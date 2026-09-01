"""
Nyx — Backend API
FastAPI + SQLite + Ollama proxy
"""

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json, secrets, httpx, asyncio, os, io, csv, socket, ipaddress
from datetime import datetime
from pathlib import Path
import PyPDF2
import docx as docxlib
from passlib.context import CryptContext
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database import (
    init_db,
    # users
    create_user, get_user_by_username, get_user_by_id, create_session, get_session, delete_session,
    update_user_prefs, get_user_prefs, purge_expired_sessions,
    # security
    record_failed_login, reset_failed_login, is_account_locked, audit,
    get_audit_log,
    # admin
    get_all_users, set_user_role, delete_user, update_user_password,
    approve_user, revoke_user_approval, delete_sessions_for_user,
    # projects
    create_project, get_projects, get_project, update_project, delete_project,
    # chats
    create_chat, get_chats, get_chat, update_chat, delete_chat,
    add_message, get_messages, delete_message, replace_messages,
    # project files
    add_file, get_files, get_file_content, delete_file,
    # chat files
    add_chat_file, get_chat_files, get_chat_file_content, delete_chat_file,
    # documents
    create_document, get_documents, get_document, update_document, delete_document,
    # nodes
    create_node, get_nodes, get_node, update_node, delete_node,
)

# ── Allowed hosts & CORS origin ───────────────────────────────────────────────
# Set NYX_ALLOWED_HOST env var to your public domain, e.g. "nyx.flavioknobel.org"
# Defaults to localhost only — MUST be set for WAN access.
ALLOWED_HOST    = os.environ.get("NYX_ALLOWED_HOST", "localhost")
ALLOWED_ORIGINS = [
    "http://localhost", "http://localhost:5173", "http://localhost:4173", "http://localhost:4174",
    "http://127.0.0.1", "http://127.0.0.1:5173", "http://127.0.0.1:4173", "http://127.0.0.1:4174",
    "http://0.0.0.0", "http://0.0.0.0:5173", "http://0.0.0.0:4173", "http://0.0.0.0:4174",
    f"https://{ALLOWED_HOST}", f"http://{ALLOWED_HOST}",
]

# ── Password hashing (bcrypt) ─────────────────────────────────────────────────
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(p: str) -> str:
    return pwd_ctx.hash(p)

def verify_password(plain: str, hashed: str) -> bool:
    # Handle old SHA-256 hashes from before this migration
    import hashlib
    if len(hashed) == 64 and all(c in "0123456789abcdef" for c in hashed):
        return hashlib.sha256(plain.encode()).hexdigest() == hashed
    return pwd_ctx.verify(plain, hashed)

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(title="Nyx", version="2.0.0")

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — locked to your domain in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SEARXNG_URL = os.environ.get("SEARXNG_URL", "http://127.0.0.1:8888")

# Max upload size: 20 MB
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

# Threshold: if a chat exceeds this many messages the frontend offers compression
COMPRESS_THRESHOLD = 20

@app.on_event("startup")
def startup():
    init_db()
    purge_expired_sessions()  # Clean expired sessions on boot

@app.on_event("shutdown")
def shutdown():
    purge_expired_sessions()


# ── Auth helpers ──────────────────────────────────────────────────────────────

async def get_current_user(authorization: str = None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.split(" ", 1)[1]
    user = get_session(token)
    if not user:
        raise HTTPException(401, "Invalid or expired session")
    return user

async def auth(authorization: str = Header(None)):
    return await get_current_user(authorization)

async def admin_auth(authorization: str = Header(None)):
    user = await get_current_user(authorization)
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    return user

def get_client_ip(request: Request) -> str:
    # Respect CF-Connecting-IP header from Cloudflare
    return (
        request.headers.get("CF-Connecting-IP") or
        request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or
        (request.client.host if request.client else "unknown")
    )


# ── Pydantic models ───────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str

class LoginRequest(BaseModel):
    username: str
    password: str

class ProjectCreate(BaseModel):
    name: str

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    system_prompt: Optional[str] = None

class ChatCreate(BaseModel):
    title: str = "New Chat"
    project_id: Optional[int] = None

class MessageCreate(BaseModel):
    role: str
    content: str
    images: Optional[list[str]] = None

class OllamaRequest(BaseModel):
    model: str
    messages: list[dict]
    node_id: Optional[int] = None
    options: Optional[dict] = None
    tools: Optional[list[dict]] = None

class NodeCreate(BaseModel):
    name: str
    url: str
    priority: int = 1
    mode: str = "failover"
    enabled: bool = True

class NodeUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    priority: Optional[int] = None
    mode: Optional[str] = None
    enabled: Optional[bool] = None

class ScanRequest(BaseModel):
    subnet: Optional[str] = None   # e.g. "192.168.1.0/24" — auto-detected if omitted
    port: int = 11434

class PrefsUpdate(BaseModel):
    dark_mode: Optional[bool] = None
    accent_theme: Optional[str] = None

class TitleGenRequest(BaseModel):
    model: str
    first_message: str
    node_id: Optional[int] = None

class CompressRequest(BaseModel):
    model: str
    chat_id: int
    node_id: Optional[int] = None

class DocumentCreate(BaseModel):
    title: str = "Untitled"
    content: str = ""

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class RoleUpdate(BaseModel):
    role: str

class PasswordReset(BaseModel):
    new_password: str

class ApprovalUpdate(BaseModel):
    approved: Optional[bool] = True


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest):
    """Rate-limited: max 5 registration attempts per minute per IP."""
    if len(body.username) < 3 or len(body.username) > 32:
        raise HTTPException(400, "Username must be 3-32 characters")
    if not body.username.replace("_","").replace("-","").isalnum():
        raise HTTPException(400, "Username may only contain letters, numbers, - and _")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if get_user_by_username(body.username):
        raise HTTPException(409, "Username already exists")
    ip = get_client_ip(request)
    uid, approved = create_user(body.username, hash_password(body.password), body.email)
    if approved:
        audit(uid, body.username, "register", "New account created — first user, auto-approved as admin", ip)
    else:
        audit(uid, body.username, "register", "New account created, pending admin approval", ip)
    return {"ok": True, "user_id": uid, "approved": approved}

@app.post("/api/auth/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest):
    """
    Rate-limited: max 10 login attempts per minute per IP.
    Accounts lock for 15 minutes after 10 consecutive failures.
    """
    ip = get_client_ip(request)
    ua = request.headers.get("User-Agent", "")[:200]

    # Check account lock
    locked, locked_until = is_account_locked(body.username)
    if locked:
        audit(None, body.username, "login_blocked", f"Account locked until {locked_until}", ip)
        raise HTTPException(429, f"Account temporarily locked due to too many failed attempts. Try again after {locked_until}")

    user = get_user_by_username(body.username)
    if not user or not verify_password(body.password, user["password"]):
        if user:
            record_failed_login(body.username)
        audit(None, body.username, "login_failed", "Bad credentials", ip)
        # Generic message — don't reveal whether username exists
        raise HTTPException(401, "Invalid credentials")

    # Gate on admin approval — credentials are correct but the account hasn't been approved yet
    if not user.get("approved"):
        audit(user["id"], user["username"], "login_blocked", "Account pending admin approval", ip)
        raise HTTPException(403, "Account pending admin approval")

    # Upgrade SHA-256 hash to bcrypt on successful login
    import hashlib
    if len(user["password"]) == 64:
        from database import update_user_password
        update_user_password(user["id"], hash_password(body.password))

    reset_failed_login(user["id"])
    token = secrets.token_urlsafe(32)
    create_session(token, user["id"], ip_address=ip, user_agent=ua, days=30)
    audit(user["id"], user["username"], "login", f"from {ip}", ip)
    return {"token": token, "username": user["username"], "role": user.get("role", "user")}

@app.post("/api/auth/logout")
def logout(request: Request, user=Depends(auth), authorization: str = Header(None)):
    token = authorization.split(" ", 1)[1]
    delete_session(token)
    audit(user["id"], user["username"], "logout", None, get_client_ip(request))
    return {"ok": True}

@app.get("/api/auth/me")
def me(user=Depends(auth)):
    return {"username": user["username"], "id": user["id"], "role": user.get("role", "user")}


# ── Admin routes ──────────────────────────────────────────────────────────────

@app.get("/api/admin/users")
def admin_list_users(user=Depends(admin_auth)):
    return get_all_users()

@app.patch("/api/admin/users/{uid}/approve")
def admin_approve_user(uid: int, body: ApprovalUpdate, request: Request, admin=Depends(admin_auth)):
    """Approve a pending account, or revoke access from an already-approved one."""
    target = get_user_by_id(uid)
    if not target:
        raise HTTPException(404, "User not found")
    ip = get_client_ip(request)
    if body.approved:
        approve_user(uid)
        audit(admin["id"], admin["username"], "approve_user", f"Approved {target['username']}", ip)
    else:
        if uid == admin["id"]:
            raise HTTPException(400, "Cannot revoke your own access")
        revoke_user_approval(uid)
        delete_sessions_for_user(uid)  # kick them out of any active sessions immediately
        audit(admin["id"], admin["username"], "revoke_user", f"Revoked access for {target['username']}", ip)
    return {"ok": True}

@app.patch("/api/admin/users/{uid}/role")
def admin_set_role(uid: int, body: RoleUpdate, user=Depends(admin_auth)):
    if body.role not in ("user", "admin"):
        raise HTTPException(400, "Role must be 'user' or 'admin'")
    set_user_role(uid, body.role)
    return {"ok": True}

@app.patch("/api/admin/users/{uid}/password")
def admin_reset_password(uid: int, body: PasswordReset, user=Depends(admin_auth)):
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    update_user_password(uid, hash_password(body.new_password))
    return {"ok": True}

@app.delete("/api/admin/users/{uid}", status_code=204)
def admin_delete_user(uid: int, user=Depends(admin_auth)):
    if uid == user["id"]:
        raise HTTPException(400, "Cannot delete your own account")
    delete_user(uid)

@app.get("/api/admin/audit")
def admin_audit_log(limit: int = 200, user=Depends(admin_auth)):
    """Return recent audit log entries. Admin only."""
    return get_audit_log(min(limit, 1000))


# ── User preferences ──────────────────────────────────────────────────────────

@app.get("/api/prefs")
def get_prefs(user=Depends(auth)):
    return get_user_prefs(user["id"])

@app.patch("/api/prefs")
def patch_prefs(body: PrefsUpdate, user=Depends(auth)):
    update_user_prefs(user["id"], body.dict(exclude_none=True))
    return get_user_prefs(user["id"])


# ── Projects ──────────────────────────────────────────────────────────────────

@app.get("/api/projects")
def list_projects(user=Depends(auth)):
    return get_projects(user["id"])

@app.post("/api/projects", status_code=201)
def new_project(body: ProjectCreate, user=Depends(auth)):
    pid = create_project(user["id"], body.name)
    return get_project(pid)

@app.get("/api/projects/{pid}")
def fetch_project(pid: int, user=Depends(auth)):
    p = get_project(pid)
    if not p or p["user_id"] != user["id"]:
        raise HTTPException(404)
    return p

@app.patch("/api/projects/{pid}")
def patch_project(pid: int, body: ProjectUpdate, user=Depends(auth)):
    p = get_project(pid)
    if not p or p["user_id"] != user["id"]:
        raise HTTPException(404)
    update_project(pid, body.dict(exclude_none=True))
    return get_project(pid)

@app.delete("/api/projects/{pid}", status_code=204)
def remove_project(pid: int, user=Depends(auth)):
    p = get_project(pid)
    if not p or p["user_id"] != user["id"]:
        raise HTTPException(404)
    delete_project(pid)


# ── Chats ─────────────────────────────────────────────────────────────────────

@app.get("/api/chats")
def list_chats(project_id: Optional[int] = None, user=Depends(auth)):
    return get_chats(user["id"], project_id)

@app.post("/api/chats", status_code=201)
def new_chat(body: ChatCreate, user=Depends(auth)):
    if body.project_id:
        p = get_project(body.project_id)
        if not p or p["user_id"] != user["id"]:
            raise HTTPException(404)
    cid = create_chat(user["id"], body.project_id, body.title)
    return get_chat(cid)

@app.get("/api/chats/{cid}")
def fetch_chat(cid: int, user=Depends(auth)):
    c = get_chat(cid)
    if not c or c["user_id"] != user["id"]:
        raise HTTPException(404)
    return c

@app.patch("/api/chats/{cid}")
def patch_chat(cid: int, body: dict, user=Depends(auth)):
    c = get_chat(cid)
    if not c or c["user_id"] != user["id"]:
        raise HTTPException(404)
    update_chat(cid, body)
    return get_chat(cid)

@app.delete("/api/chats/{cid}", status_code=204)
def remove_chat(cid: int, user=Depends(auth)):
    c = get_chat(cid)
    if not c or c["user_id"] != user["id"]:
        raise HTTPException(404)
    delete_chat(cid)


# ── Messages ──────────────────────────────────────────────────────────────────

@app.get("/api/chats/{cid}/messages")
def list_messages(cid: int, user=Depends(auth)):
    c = get_chat(cid)
    if not c or c["user_id"] != user["id"]:
        raise HTTPException(404)
    return get_messages(cid)

@app.post("/api/chats/{cid}/messages", status_code=201)
def post_message(cid: int, body: MessageCreate, user=Depends(auth)):
    c = get_chat(cid)
    if not c or c["user_id"] != user["id"]:
        raise HTTPException(404)
    mid = add_message(cid, body.role, body.content,
                      json.dumps(body.images) if body.images else None)
    return {"id": mid}

@app.delete("/api/chats/{cid}/messages/{mid}", status_code=204)
def remove_message(cid: int, mid: int, user=Depends(auth)):
    c = get_chat(cid)
    if not c or c["user_id"] != user["id"]:
        raise HTTPException(404)
    delete_message(mid)


# ── Chat compression ──────────────────────────────────────────────────────────

@app.post("/api/chats/{cid}/compress")
async def compress_chat(cid: int, body: CompressRequest, user=Depends(auth)):
    """
    Summarise the chat history into a single system message via Ollama,
    then replace all messages with: [summary system msg] + last 4 messages.
    Returns the new message list.
    """
    c = get_chat(cid)
    if not c or c["user_id"] != user["id"]:
        raise HTTPException(404)

    msgs = get_messages(cid)
    if len(msgs) < COMPRESS_THRESHOLD:
        return {"ok": False, "reason": "Chat not long enough to compress"}

    nodes = get_nodes(user["id"])
    url, _ = await pick_node_url(nodes, body.node_id)

    # Build summary prompt from all but last 4 messages
    to_summarise = msgs[:-4]
    summary_input = "\n\n".join(
        f"{m['role'].upper()}: {m['content'][:500]}" for m in to_summarise
    )
    payload = {
        "model": body.model,
        "messages": [
            {"role": "system", "content": "You are a concise summariser. Write a compact but complete summary of this conversation so far. Include key facts, decisions, and context needed to continue the conversation."},
            {"role": "user", "content": f"Summarise this conversation:\n\n{summary_input}"},
        ],
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{url}/api/chat", json=payload)
    summary = r.json().get("message", {}).get("content", "Previous conversation summarised.")

    # Keep summary + last 4 messages
    keep = msgs[-4:]
    new_msgs = [{"role": "system", "content": f"[Previous conversation summary]\n{summary}"}] + \
               [{"role": m["role"], "content": m["content"]} for m in keep]

    replace_messages(cid, new_msgs)
    return {"ok": True, "messages": get_messages(cid), "summary": summary}


# ── Project Files ─────────────────────────────────────────────────────────────

def extract_text(file: UploadFile) -> str:
    name = file.filename.lower()
    raw  = file.file.read()
    if name.endswith(".pdf"):
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(raw))
            text = ""
            for page in reader.pages[:100]:
                try: text += (page.extract_text() or "") + "\n\n"
                except: pass
            return text.strip() or "No text extracted"
        except Exception as e: return f"PDF error: {e}"
    if name.endswith(".docx"):
        try:
            d = docxlib.Document(io.BytesIO(raw))
            return "\n".join(p.text for p in d.paragraphs)
        except Exception as e: return f"DOCX error: {e}"
    if name.endswith(".csv"):
        try:
            rows = list(csv.reader(io.StringIO(raw.decode("utf-8"))))
            return "CSV:\n" + "\n".join(", ".join(r) for r in rows[:100])
        except Exception as e: return f"CSV error: {e}"
    try: return raw.decode("utf-8")
    except: return "Could not extract text"

@app.get("/api/projects/{pid}/files")
def list_files(pid: int, user=Depends(auth)):
    p = get_project(pid)
    if not p or p["user_id"] != user["id"]: raise HTTPException(404)
    return get_files(pid)

@app.post("/api/projects/{pid}/files", status_code=201)
async def upload_file(pid: int, file: UploadFile = File(...), user=Depends(auth)):
    p = get_project(pid)
    if not p or p["user_id"] != user["id"]: raise HTTPException(404)
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large. Max {MAX_UPLOAD_BYTES // 1024 // 1024} MB")
    file.file = io.BytesIO(raw)
    content = extract_text(file)
    if len(content) > 100_000: content = content[:100_000] + "\n\n[Truncated]"
    fid = add_file(pid, file.filename, content)
    return {"id": fid, "name": file.filename, "size": len(content)}

@app.delete("/api/projects/{pid}/files/{fid}", status_code=204)
def remove_file(pid: int, fid: int, user=Depends(auth)):
    p = get_project(pid)
    if not p or p["user_id"] != user["id"]: raise HTTPException(404)
    delete_file(fid)


# ── Chat Files (standalone chat uploads) ─────────────────────────────────────

@app.get("/api/chats/{cid}/files")
def list_chat_files(cid: int, user=Depends(auth)):
    c = get_chat(cid)
    if not c or c["user_id"] != user["id"]: raise HTTPException(404)
    return get_chat_files(cid)

@app.post("/api/chats/{cid}/files", status_code=201)
async def upload_chat_file(cid: int, file: UploadFile = File(...), user=Depends(auth)):
    c = get_chat(cid)
    if not c or c["user_id"] != user["id"]: raise HTTPException(404)
    content = extract_text(file)
    if len(content) > 100_000: content = content[:100_000] + "\n\n[Truncated]"
    fid = add_chat_file(cid, file.filename, content)
    return {"id": fid, "name": file.filename, "size": len(content)}

@app.delete("/api/chats/{cid}/files/{fid}", status_code=204)
def remove_chat_file(cid: int, fid: int, user=Depends(auth)):
    c = get_chat(cid)
    if not c or c["user_id"] != user["id"]: raise HTTPException(404)
    delete_chat_file(fid)


# ── Documents ─────────────────────────────────────────────────────────────────

@app.get("/api/documents")
def list_documents(user=Depends(auth)):
    return get_documents(user["id"])

@app.post("/api/documents", status_code=201)
def new_document(body: DocumentCreate, user=Depends(auth)):
    did = create_document(user["id"], body.title, body.content)
    return get_document(did)

@app.get("/api/documents/{did}")
def fetch_document(did: int, user=Depends(auth)):
    d = get_document(did)
    if not d or d["user_id"] != user["id"]: raise HTTPException(404)
    return d

@app.patch("/api/documents/{did}")
def patch_document(did: int, body: DocumentUpdate, user=Depends(auth)):
    d = get_document(did)
    if not d or d["user_id"] != user["id"]: raise HTTPException(404)
    update_document(did, body.title, body.content)
    return get_document(did)

@app.delete("/api/documents/{did}", status_code=204)
def remove_document(did: int, user=Depends(auth)):
    d = get_document(did)
    if not d or d["user_id"] != user["id"]: raise HTTPException(404)
    delete_document(did)


# ── Nodes ─────────────────────────────────────────────────────────────────────

@app.get("/api/nodes")
def list_nodes(user=Depends(auth)):
    return get_nodes(user["id"])

@app.post("/api/nodes", status_code=201)
def new_node(body: NodeCreate, user=Depends(auth)):
    nid = create_node(user["id"], body.name, body.url.rstrip("/"),
                      body.priority, body.mode, body.enabled)
    return get_node(nid)

@app.patch("/api/nodes/{nid}")
def patch_node(nid: int, body: NodeUpdate, user=Depends(auth)):
    n = get_node(nid)
    if not n or n["user_id"] != user["id"]: raise HTTPException(404)
    update_node(nid, body.dict(exclude_none=True))
    return get_node(nid)

@app.delete("/api/nodes/{nid}", status_code=204)
def remove_node(nid: int, user=Depends(auth)):
    n = get_node(nid)
    if not n or n["user_id"] != user["id"]: raise HTTPException(404)
    delete_node(nid)

@app.get("/api/nodes/{nid}/probe")
async def probe_node_route(nid: int, user=Depends(auth)):
    n = get_node(nid)
    if not n or n["user_id"] != user["id"]: raise HTTPException(404)
    return await _probe(n)

@app.get("/api/nodes/probe-all")
async def probe_all(user=Depends(auth)):
    nodes = get_nodes(user["id"])
    results = await asyncio.gather(*[_probe(n) for n in nodes])
    return list(results)

async def _probe(node: dict) -> dict:
    try:
        start = datetime.now()
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{node['url']}/api/tags")
        ms = int((datetime.now() - start).total_seconds() * 1000)
        if r.status_code == 200:
            models = [m["name"] for m in r.json().get("models", [])]
            return {**node, "online": True, "latency_ms": ms, "models": models}
    except: pass
    return {**node, "online": False, "latency_ms": None, "models": []}


# ── Network scan (LAN discovery for Ollama nodes) ────────────────────────────────

def detect_local_subnet() -> str:
    """
    Best-effort detection of the /24 this server is on, without needing any
    external network access. Opens a UDP "connection" to a public IP purely so
    the OS picks a source address/interface for us — no packet is actually
    sent for UDP until data is written, and we never write any.
    """
    fallback = "192.168.1.0/24"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("10.255.255.255", 1))
            local_ip = s.getsockname()[0]
        finally:
            s.close()
        network = ipaddress.ip_interface(f"{local_ip}/24").network
        # Guard against unusual network setups (some containers/NAT configs) where
        # the detected source address isn't actually an RFC1918 range — scanning
        # is restricted to private ranges, so an auto-detected public/reserved
        # address would otherwise fail with a confusing "not private" error.
        return str(network) if network.is_private else fallback
    except Exception:
        return fallback

async def _scan_host(ip: str, port: int, sem: asyncio.Semaphore) -> Optional[dict]:
    """
    Two-stage check: a fast raw TCP connect to see if anything is listening,
    then (only for hosts that pass) an HTTP call to /api/tags to confirm it's
    actually Ollama and not some other service that happens to use this port.
    """
    async with sem:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port), timeout=0.4
            )
            writer.close()
            try: await writer.wait_closed()
            except Exception: pass
        except Exception:
            return None

        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                r = await client.get(f"http://{ip}:{port}/api/tags")
            if r.status_code != 200:
                return None
            models = [m["name"] for m in r.json().get("models", [])]
            return {"ip": ip, "port": port, "url": f"http://{ip}:{port}", "models": models}
        except Exception:
            return None

@app.post("/api/nodes/scan")
async def scan_network(body: ScanRequest, user=Depends(auth)):
    """
    Sweeps a subnet looking for Ollama instances. Restricted to private
    (RFC1918/link-local) ranges and /24-or-smaller to prevent this endpoint
    being used as a general-purpose network scanner against arbitrary hosts.
    """
    subnet_str = (body.subnet or "").strip() or detect_local_subnet()
    try:
        network = ipaddress.ip_network(subnet_str, strict=False)
    except ValueError:
        raise HTTPException(400, "Invalid subnet — expected CIDR notation, e.g. 192.168.1.0/24")
    if not network.is_private:
        raise HTTPException(400, "Only private network ranges can be scanned")
    if network.num_addresses > 256:
        raise HTTPException(400, "Subnet too large — use a /24 or smaller")
    if not (1 <= body.port <= 65535):
        raise HTTPException(400, "Invalid port")

    hosts = [str(ip) for ip in network.hosts()]
    sem = asyncio.Semaphore(64)
    results = await asyncio.gather(*[_scan_host(ip, body.port, sem) for ip in hosts])
    found = [r for r in results if r]
    return {"subnet": str(network), "port": body.port, "scanned": len(hosts), "found": found}


# ── Ollama proxy ──────────────────────────────────────────────────────────────

async def pick_node_url(nodes: list, node_id: Optional[int] = None) -> tuple:
    if node_id:
        n = next((x for x in nodes if x["id"] == node_id), None)
        if n: return n["url"], n["name"]
    enabled = [n for n in nodes if n.get("enabled", True)]
    use_lb  = any(n.get("mode") == "loadbalance" for n in enabled)
    probed  = await asyncio.gather(*[_probe(n) for n in enabled])
    online  = [n for n in probed if n["online"]]
    if not online: raise HTTPException(503, "No Ollama nodes online")
    if use_lb:
        import random; n = random.choice(online)
    else:
        n = sorted(online, key=lambda x: x.get("priority", 99))[0]
    return n["url"], n["name"]

@app.post("/api/ollama/chat")
async def ollama_chat(body: OllamaRequest, user=Depends(auth)):
    nodes = get_nodes(user["id"])
    url, node_name = await pick_node_url(nodes, body.node_id)
    payload = {"model": body.model, "messages": body.messages, "stream": True}
    if body.options: payload["options"] = body.options
    if body.tools:   payload["tools"]   = body.tools

    async def stream():
        yield f"data: {json.dumps({'node': node_name})}\n\n"
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream("POST", f"{url}/api/chat", json=payload) as r:
                async for line in r.aiter_lines():
                    if line: yield f"data: {line}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")

@app.post("/api/ollama/title")
async def generate_title(body: TitleGenRequest, user=Depends(auth)):
    nodes = get_nodes(user["id"])
    url, _ = await pick_node_url(nodes, body.node_id)
    payload = {
        "model": body.model,
        "messages": [
            {"role": "system", "content": "Generate ONLY a short 3-5 word title. No quotes, no punctuation."},
            {"role": "user",   "content": f"Title for: {body.first_message[:120]}"},
        ],
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{url}/api/chat", json=payload)
    title = r.json().get("message", {}).get("content", "New Chat").strip()
    title = title.split("\n")[0].replace('"', "").replace("'", "")[:60]
    return {"title": title}

@app.get("/api/ollama/models")
async def list_models(node_id: Optional[int] = None, user=Depends(auth)):
    nodes = get_nodes(user["id"])
    url, _ = await pick_node_url(nodes, node_id)
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(f"{url}/api/tags")
    return r.json().get("models", [])

@app.post("/api/ollama/pull")
async def pull_model(node_id: int, model: str, user=Depends(auth)):
    n = get_node(node_id)
    if not n or n["user_id"] != user["id"]: raise HTTPException(404)
    async def stream():
        async with httpx.AsyncClient(timeout=3600) as client:
            async with client.stream("POST", f"{n['url']}/api/pull", json={"name": model}) as r:
                async for line in r.aiter_lines():
                    if line: yield f"data: {line}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")

@app.delete("/api/ollama/models")
async def delete_model(node_id: int, model: str, user=Depends(auth)):
    n = get_node(node_id)
    if not n or n["user_id"] != user["id"]: raise HTTPException(404)
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.request("DELETE", f"{n['url']}/api/delete", json={"name": model})
    if not r.is_success: raise HTTPException(500, r.text)
    return {"ok": True}

@app.get("/api/ollama/ps")
async def running_models(node_id: int, user=Depends(auth)):
    n = get_node(node_id)
    if not n or n["user_id"] != user["id"]: raise HTTPException(404)
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(f"{n['url']}/api/ps")
    return r.json().get("models", [])


# ── Web search ────────────────────────────────────────────────────────────────

@app.get("/api/search/web")
async def web_search(q: str, user=Depends(auth)):
    if not SEARXNG_URL: raise HTTPException(503, "Web search not configured")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(f"{SEARXNG_URL}/search", params={"q": q, "format": "json"})
        results = r.json().get("results", [])[:5]
        return [{"title": res.get("title",""), "url": res.get("url",""), "snippet": res.get("content","")} for res in results]
    except httpx.ConnectError:
        raise HTTPException(503, "SearXNG is not reachable")
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/api/search/web/status")
async def web_search_status(user=Depends(auth)):
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{SEARXNG_URL}/search", params={"q": "test", "format": "json"})
        return {"available": r.is_success}
    except:
        return {"available": False}


# ── Message search ────────────────────────────────────────────────────────────

@app.get("/api/search")
def search(q: str, user=Depends(auth)):
    if len(q) < 2: return []
    import sqlite3
    from database import DB_PATH
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.execute("""
        SELECT m.id, m.chat_id, m.role, m.content,
               c.title as chat_title, c.project_id,
               p.name as project_name
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        LEFT JOIN projects p ON p.id = c.project_id
        WHERE c.user_id = ? AND m.content LIKE ?
        LIMIT 50
    """, (user["id"], f"%{q}%"))
    results = [dict(r) for r in cur.fetchall()]
    conn.close()
    for r in results:
        idx = r["content"].lower().find(q.lower())
        start = max(0, idx - 60)
        end   = min(len(r["content"]), idx + len(q) + 60)
        snip  = r["content"][start:end]
        if start > 0: snip = "..." + snip
        if end < len(r["content"]): snip += "..."
        r["snippet"] = snip
    return results
