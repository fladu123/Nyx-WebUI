
"""
Nyx — Database layer
SQLite with a clean query interface. No ORM, plain SQL.
"""

import sqlite3
import json
from pathlib import Path
from datetime import datetime

DB_PATH = Path("data/nyx.db")

def get_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT    UNIQUE NOT NULL,
            password        TEXT    NOT NULL,
            email           TEXT    NOT NULL,
            role            TEXT    DEFAULT 'user',
            approved        INTEGER DEFAULT 0,
            prefs           TEXT    DEFAULT '{}',
            failed_attempts INTEGER DEFAULT 0,
            locked_until    TEXT,
            last_login      TEXT,
            created_at      TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT    PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT    DEFAULT (datetime('now')),
            expires_at TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            username   TEXT,
            action     TEXT    NOT NULL,
            detail     TEXT,
            ip_address TEXT,
            created_at TEXT    DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);

        CREATE TABLE IF NOT EXISTS projects (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name          TEXT    NOT NULL,
            system_prompt TEXT    DEFAULT '',
            created_at    TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chats (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
            title      TEXT    DEFAULT 'New Chat',
            created_at TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            role       TEXT    NOT NULL,
            content    TEXT    NOT NULL,
            images     TEXT,
            created_at TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS files (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name       TEXT    NOT NULL,
            content    TEXT    NOT NULL,
            size       INTEGER NOT NULL,
            created_at TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS nodes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name       TEXT    NOT NULL,
            url        TEXT    NOT NULL,
            priority   INTEGER DEFAULT 1,
            mode       TEXT    DEFAULT 'failover',
            enabled    INTEGER DEFAULT 1,
            created_at TEXT    DEFAULT (datetime('now'))
        );

        -- Standalone chat file attachments (Feature: file upload in lone chats)
        CREATE TABLE IF NOT EXISTS chat_files (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            name       TEXT    NOT NULL,
            content    TEXT    NOT NULL,
            size       INTEGER NOT NULL,
            created_at TEXT    DEFAULT (datetime('now'))
        );

        -- User documents (Feature: document creation & editing)
        CREATE TABLE IF NOT EXISTS documents (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title      TEXT    NOT NULL DEFAULT 'Untitled',
            content    TEXT    NOT NULL DEFAULT '',
            created_at TEXT    DEFAULT (datetime('now')),
            updated_at TEXT    DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_messages_chat  ON messages(chat_id);
        CREATE INDEX IF NOT EXISTS idx_chats_user     ON chats(user_id);
        CREATE INDEX IF NOT EXISTS idx_files_project  ON files(project_id);
        CREATE INDEX IF NOT EXISTS idx_chat_files     ON chat_files(chat_id);
        CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
    """)
    conn.commit()

    # ── Migrations — safe to run on every startup ─────────────────────────────
    migrations = [
        "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
        "ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN locked_until TEXT",
        "ALTER TABLE users ADD COLUMN last_login TEXT",
        "ALTER TABLE users ADD COLUMN approved INTEGER DEFAULT 0",
        "ALTER TABLE sessions ADD COLUMN ip_address TEXT",
        "ALTER TABLE sessions ADD COLUMN user_agent TEXT",
        "ALTER TABLE sessions ADD COLUMN expires_at TEXT NOT NULL DEFAULT (datetime('now','+30 days'))",
    ]
    for migration in migrations:
        try:
            conn.execute(migration)
            conn.commit()
        except sqlite3.OperationalError:
            pass  # column already exists

    # One-time backfill: anyone who already has an admin role, or who logged in
    # before this feature existed, should not get locked out retroactively.
    conn.execute("UPDATE users SET approved=1 WHERE role='admin' AND approved=0")
    conn.execute("UPDATE users SET approved=1 WHERE last_login IS NOT NULL AND approved=0")
    conn.commit()

    conn.close()


# ── helpers ───────────────────────────────────────────────────────────────────

def row(conn, sql, params=()):
    r = conn.execute(sql, params).fetchone()
    return dict(r) if r else None

def rows(conn, sql, params=()):
    return [dict(r) for r in conn.execute(sql, params).fetchall()]

def run(conn, sql, params=()):
    cur = conn.execute(sql, params)
    conn.commit()
    return cur.lastrowid


# ── Users ─────────────────────────────────────────────────────────────────────

def create_user(username, password, email):
    """
    Creates a new user. The very first account in a fresh install is
    auto-approved and made admin (so there's always someone who can approve
    everyone else). Every account after that starts as unapproved and must
    be approved by an admin before it can sign in.
    """
    conn = get_db()
    existing = row(conn, "SELECT COUNT(*) AS c FROM users")
    is_first_user = (existing["c"] == 0)
    role = "admin" if is_first_user else "user"
    approved = 1 if is_first_user else 0
    uid = run(conn, "INSERT INTO users (username, password, email, role, approved) VALUES (?,?,?,?,?)",
              (username, password, email, role, approved))
    run(conn, "INSERT INTO nodes (user_id, name, url, priority) VALUES (?,?,?,?)",
        (uid, "Local", "http://localhost:11434", 1))
    conn.close()
    return uid, bool(approved)

def get_user_by_username(username):
    conn = get_db()
    u = row(conn, "SELECT * FROM users WHERE username=?", (username,))
    conn.close()
    return u

def get_user_by_id(user_id):
    conn = get_db()
    u = row(conn, "SELECT * FROM users WHERE id=?", (user_id,))
    conn.close()
    return u

def get_user_prefs(user_id):
    conn = get_db()
    u = row(conn, "SELECT prefs FROM users WHERE id=?", (user_id,))
    conn.close()
    return json.loads(u["prefs"]) if u else {}

def update_user_prefs(user_id, updates: dict):
    conn = get_db()
    u = row(conn, "SELECT prefs FROM users WHERE id=?", (user_id,))
    prefs = json.loads(u["prefs"]) if u else {}
    prefs.update(updates)
    run(conn, "UPDATE users SET prefs=? WHERE id=?", (json.dumps(prefs), user_id))
    conn.close()


# ── Admin ─────────────────────────────────────────────────────────────────────

def get_all_users():
    conn = get_db()
    r = rows(conn, "SELECT id, username, email, role, approved, created_at FROM users ORDER BY created_at ASC")
    conn.close()
    for u in r:
        u["approved"] = bool(u["approved"])
    return r

def get_pending_users():
    """Users who have registered but not yet been approved by an admin."""
    conn = get_db()
    r = rows(conn, "SELECT id, username, email, created_at FROM users WHERE approved=0 ORDER BY created_at ASC")
    conn.close()
    return r

def count_pending_users():
    conn = get_db()
    c = row(conn, "SELECT COUNT(*) AS c FROM users WHERE approved=0")
    conn.close()
    return c["c"] if c else 0

def approve_user(user_id):
    conn = get_db()
    run(conn, "UPDATE users SET approved=1 WHERE id=?", (user_id,))
    conn.close()

def revoke_user_approval(user_id):
    """Re-lock a previously approved account without deleting it."""
    conn = get_db()
    run(conn, "UPDATE users SET approved=0 WHERE id=?", (user_id,))
    conn.close()

def set_user_role(user_id, role: str):
    if role not in ("user", "admin"):
        raise ValueError(f"Invalid role: {role}")
    conn = get_db()
    run(conn, "UPDATE users SET role=? WHERE id=?", (role, user_id))
    conn.close()

def delete_user(user_id):
    conn = get_db()
    run(conn, "DELETE FROM users WHERE id=?", (user_id,))
    conn.close()

def update_user_password(user_id, hashed_password: str):
    conn = get_db()
    run(conn, "UPDATE users SET password=? WHERE id=?", (hashed_password, user_id))
    conn.close()


# ── Sessions ──────────────────────────────────────────────────────────────────

def create_session(token, user_id, ip_address=None, user_agent=None, days=30):
    from datetime import timedelta
    expires = (datetime.now() + timedelta(days=days)).isoformat()
    conn = get_db()
    run(conn, "INSERT INTO sessions (token, user_id, ip_address, user_agent, expires_at) VALUES (?,?,?,?,?)",
        (token, user_id, ip_address, user_agent, expires))
    # Update last_login
    run(conn, "UPDATE users SET last_login=? WHERE id=?", (datetime.now().isoformat(), user_id))
    conn.close()

def get_session(token):
    conn = get_db()
    r = row(conn, """
        SELECT u.id, u.username, u.role, u.approved FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token=? AND s.expires_at > datetime('now')
    """, (token,))
    conn.close()
    if r: r["approved"] = bool(r["approved"])
    return r

def delete_session(token):
    conn = get_db()
    run(conn, "DELETE FROM sessions WHERE token=?", (token,))
    conn.close()

def delete_sessions_for_user(user_id):
    """Kick a user out of all active sessions — used when revoking approval or deleting."""
    conn = get_db()
    run(conn, "DELETE FROM sessions WHERE user_id=?", (user_id,))
    conn.close()

def purge_expired_sessions():
    """Remove all expired sessions — call periodically."""
    conn = get_db()
    run(conn, "DELETE FROM sessions WHERE expires_at <= datetime('now')")
    conn.close()


# ── Security: login attempt tracking ─────────────────────────────────────────

def record_failed_login(username: str):
    conn = get_db()
    u = row(conn, "SELECT id, failed_attempts FROM users WHERE username=?", (username,))
    if not u:
        conn.close()
        return
    attempts = (u["failed_attempts"] or 0) + 1
    locked_until = None
    if attempts >= 10:
        # Lock for 15 minutes after 10 failures
        from datetime import timedelta
        locked_until = (datetime.now() + timedelta(minutes=15)).isoformat()
    run(conn, "UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?",
        (attempts, locked_until, u["id"]))
    conn.close()

def reset_failed_login(user_id: int):
    conn = get_db()
    run(conn, "UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?", (user_id,))
    conn.close()

def is_account_locked(username: str) -> tuple:
    """Returns (is_locked: bool, locked_until: str|None)"""
    conn = get_db()
    u = row(conn, "SELECT locked_until FROM users WHERE username=?", (username,))
    conn.close()
    if not u or not u.get("locked_until"):
        return False, None
    from datetime import datetime as dt
    if dt.fromisoformat(u["locked_until"]) > dt.now():
        return True, u["locked_until"]
    # Lock expired — clear it
    conn2 = get_db()
    run(conn2, "UPDATE users SET locked_until=NULL, failed_attempts=0 WHERE username=?", (username,))
    conn2.close()
    return False, None


# ── Audit log ─────────────────────────────────────────────────────────────────

def audit(user_id, username, action, detail=None, ip_address=None):
    conn = get_db()
    run(conn, "INSERT INTO audit_log (user_id, username, action, detail, ip_address) VALUES (?,?,?,?,?)",
        (user_id, username, action, detail, ip_address))
    conn.close()

def get_audit_log(limit=200):
    conn = get_db()
    r = rows(conn, "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?", (limit,))
    conn.close()
    return r


# ── Projects ──────────────────────────────────────────────────────────────────

def create_project(user_id, name):
    conn = get_db()
    pid = run(conn, "INSERT INTO projects (user_id, name) VALUES (?,?)", (user_id, name))
    conn.close()
    return pid

def get_projects(user_id):
    conn = get_db()
    r = rows(conn, "SELECT * FROM projects WHERE user_id=? ORDER BY created_at DESC", (user_id,))
    conn.close()
    return r

def get_project(pid):
    conn = get_db()
    r = row(conn, "SELECT * FROM projects WHERE id=?", (pid,))
    conn.close()
    return r

def update_project(pid, data: dict):
    conn = get_db()
    for k, v in data.items():
        if k in ("name", "system_prompt"):
            run(conn, f"UPDATE projects SET {k}=? WHERE id=?", (v, pid))
    conn.close()

def delete_project(pid):
    conn = get_db()
    run(conn, "DELETE FROM projects WHERE id=?", (pid,))
    conn.close()


# ── Chats ─────────────────────────────────────────────────────────────────────

def create_chat(user_id, project_id, title="New Chat"):
    conn = get_db()
    cid = run(conn, "INSERT INTO chats (user_id, project_id, title) VALUES (?,?,?)",
              (user_id, project_id, title))
    conn.close()
    return cid

def get_chats(user_id, project_id=None):
    conn = get_db()
    if project_id is not None:
        r = rows(conn, "SELECT * FROM chats WHERE user_id=? AND project_id=? ORDER BY created_at DESC",
                 (user_id, project_id))
    else:
        r = rows(conn, "SELECT * FROM chats WHERE user_id=? AND project_id IS NULL ORDER BY created_at DESC",
                 (user_id,))
    conn.close()
    return r

def get_chat(cid):
    conn = get_db()
    r = row(conn, "SELECT * FROM chats WHERE id=?", (cid,))
    conn.close()
    return r

def update_chat(cid, data: dict):
    conn = get_db()
    if "title" in data:
        run(conn, "UPDATE chats SET title=? WHERE id=?", (data["title"], cid))
    conn.close()

def delete_chat(cid):
    conn = get_db()
    run(conn, "DELETE FROM chats WHERE id=?", (cid,))
    conn.close()


# ── Messages ──────────────────────────────────────────────────────────────────

def add_message(chat_id, role, content, images=None):
    conn = get_db()
    mid = run(conn, "INSERT INTO messages (chat_id, role, content, images) VALUES (?,?,?,?)",
              (chat_id, role, content, images))
    conn.close()
    return mid

def get_messages(chat_id):
    conn = get_db()
    r = rows(conn, "SELECT * FROM messages WHERE chat_id=? ORDER BY id ASC", (chat_id,))
    conn.close()
    for msg in r:
        if msg.get("images"):
            try: msg["images"] = json.loads(msg["images"])
            except: msg["images"] = []
    return r

def delete_message(mid):
    conn = get_db()
    run(conn, "DELETE FROM messages WHERE id=?", (mid,))
    conn.close()

def replace_messages(chat_id, new_messages: list):
    """Replace all messages in a chat — used for compression."""
    conn = get_db()
    conn.execute("DELETE FROM messages WHERE chat_id=?", (chat_id,))
    conn.commit()
    for m in new_messages:
        run(conn, "INSERT INTO messages (chat_id, role, content) VALUES (?,?,?)",
            (chat_id, m["role"], m["content"]))
    conn.close()


# ── Project Files ─────────────────────────────────────────────────────────────

def add_file(project_id, name, content):
    conn = get_db()
    fid = run(conn, "INSERT INTO files (project_id, name, content, size) VALUES (?,?,?,?)",
              (project_id, name, content, len(content)))
    conn.close()
    return fid

def get_files(project_id):
    conn = get_db()
    r = rows(conn, "SELECT id, project_id, name, content, size, created_at FROM files WHERE project_id=?",
             (project_id,))
    conn.close()
    return r

def get_file_content(fid):
    conn = get_db()
    r = row(conn, "SELECT content FROM files WHERE id=?", (fid,))
    conn.close()
    return r["content"] if r else ""

def delete_file(fid):
    conn = get_db()
    run(conn, "DELETE FROM files WHERE id=?", (fid,))
    conn.close()


# ── Chat Files (standalone chat uploads) ──────────────────────────────────────

def add_chat_file(chat_id, name, content):
    conn = get_db()
    fid = run(conn, "INSERT INTO chat_files (chat_id, name, content, size) VALUES (?,?,?,?)",
              (chat_id, name, content, len(content)))
    conn.close()
    return fid

def get_chat_files(chat_id):
    conn = get_db()
    r = rows(conn, "SELECT id, chat_id, name, content, size, created_at FROM chat_files WHERE chat_id=?",
             (chat_id,))
    conn.close()
    return r

def get_chat_file_content(fid):
    conn = get_db()
    r = row(conn, "SELECT content FROM chat_files WHERE id=?", (fid,))
    conn.close()
    return r["content"] if r else ""

def delete_chat_file(fid):
    conn = get_db()
    run(conn, "DELETE FROM chat_files WHERE id=?", (fid,))
    conn.close()


# ── Documents ─────────────────────────────────────────────────────────────────

def create_document(user_id, title, content=""):
    conn = get_db()
    did = run(conn, "INSERT INTO documents (user_id, title, content) VALUES (?,?,?)",
              (user_id, title, content))
    conn.close()
    return did

def get_documents(user_id):
    conn = get_db()
    r = rows(conn, "SELECT id, user_id, title, updated_at, created_at FROM documents WHERE user_id=? ORDER BY updated_at DESC",
             (user_id,))
    conn.close()
    return r

def get_document(did):
    conn = get_db()
    r = row(conn, "SELECT * FROM documents WHERE id=?", (did,))
    conn.close()
    return r

def update_document(did, title=None, content=None):
    conn = get_db()
    now = datetime.now().isoformat()
    if title is not None:
        run(conn, "UPDATE documents SET title=?, updated_at=? WHERE id=?", (title, now, did))
    if content is not None:
        run(conn, "UPDATE documents SET content=?, updated_at=? WHERE id=?", (content, now, did))
    conn.close()

def delete_document(did):
    conn = get_db()
    run(conn, "DELETE FROM documents WHERE id=?", (did,))
    conn.close()


# ── Nodes ─────────────────────────────────────────────────────────────────────

def create_node(user_id, name, url, priority=1, mode="failover", enabled=True):
    conn = get_db()
    nid = run(conn, "INSERT INTO nodes (user_id, name, url, priority, mode, enabled) VALUES (?,?,?,?,?,?)",
              (user_id, name, url, priority, mode, int(enabled)))
    conn.close()
    return nid

def get_nodes(user_id):
    conn = get_db()
    r = rows(conn, "SELECT * FROM nodes WHERE user_id=? ORDER BY priority ASC", (user_id,))
    conn.close()
    for n in r:
        n["enabled"] = bool(n["enabled"])
    return r

def get_node(nid):
    conn = get_db()
    r = row(conn, "SELECT * FROM nodes WHERE id=?", (nid,))
    conn.close()
    if r: r["enabled"] = bool(r["enabled"])
    return r

def update_node(nid, data: dict):
    conn = get_db()
    allowed = {"name", "url", "priority", "mode", "enabled"}
    for k, v in data.items():
        if k in allowed:
            if k == "enabled": v = int(v)
            run(conn, f"UPDATE nodes SET {k}=? WHERE id=?", (v, nid))
    conn.close()

def delete_node(nid):
    conn = get_db()
    run(conn, "DELETE FROM nodes WHERE id=?", (nid,))
    conn.close()
