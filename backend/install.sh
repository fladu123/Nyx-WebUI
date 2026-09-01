#!/usr/bin/env bash
#
# Nyx — install script
# Sets up the FastAPI backend (main.py + database.py) as a systemd service
# behind an optional nginx reverse proxy.
#
# Usage:
#   sudo ./install.sh
#
# Optional overrides (env vars), e.g.:
#   sudo NYX_PORT=8001 NYX_DOMAIN=nyx.example.org SETUP_NGINX=yes ./install.sh
#
# Run this from the directory containing main.py and database.py
# (the files this script installs — it will copy them into place).

set -euo pipefail

# ── Config (override via env vars) ────────────────────────────────────────────
APP_DIR="${NYX_APP_DIR:-/opt/nyx}"
SERVICE_USER="${NYX_SERVICE_USER:-nyx}"
SERVICE_NAME="${NYX_SERVICE_NAME:-nyx-backend}"
PORT="${NYX_PORT:-8000}"
ALLOWED_HOST="${NYX_DOMAIN:-}"          # e.g. nyx.flavioknobel.org, or a LAN IP — auto-detected below if left empty
SETUP_NGINX="${SETUP_NGINX:-}"          # yes/no — if empty, script will ask
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Helpers ────────────────────────────────────────────────────────────────────
c_reset='\033[0m'; c_green='\033[0;32m'; c_yellow='\033[1;33m'; c_red='\033[0;31m'; c_blue='\033[0;34m'
say()  { echo -e "${c_blue}==>${c_reset} $*"; }
ok()   { echo -e "${c_green}✓${c_reset} $*"; }
warn() { echo -e "${c_yellow}!${c_reset} $*"; }
die()  { echo -e "${c_red}✗ $*${c_reset}" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this as root (sudo ./install.sh, or as root directly)."
command -v apt-get >/dev/null 2>&1 || die "This script assumes a Debian/Ubuntu host (apt-get not found)."

# CORS needs at least one real host in the allow-list, or the frontend can't talk to
# the backend from anywhere but localhost. If NYX_DOMAIN wasn't set, auto-detect this
# machine's LAN IP instead of leaving it blank — an *empty* NYX_ALLOWED_HOST env var
# is not the same as an unset one, so leaving this blank would silently break CORS
# rather than falling back to a sane default.
if [[ -z "$ALLOWED_HOST" ]]; then
  detected_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -n "$detected_ip" ]]; then
    ALLOWED_HOST="$detected_ip"
    warn "NYX_DOMAIN not set — defaulting NYX_ALLOWED_HOST to '$ALLOWED_HOST' (this machine's detected LAN IP)."
    warn "Override with NYX_DOMAIN=... if you'll access Nyx by a different address."
  else
    ALLOWED_HOST="localhost"
    warn "Could not detect a LAN IP — defaulting NYX_ALLOWED_HOST to 'localhost'. Set NYX_DOMAIN=... to fix this."
  fi
fi

# ── 1. System packages ─────────────────────────────────────────────────────────
say "Installing system packages..."
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip build-essential curl >/dev/null
ok "System packages ready"

# ── 2. Service user ─────────────────────────────────────────────────────────────
if ! id "$SERVICE_USER" &>/dev/null; then
  say "Creating service user '$SERVICE_USER'..."
  useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  ok "User '$SERVICE_USER' created"
else
  ok "User '$SERVICE_USER' already exists"
fi

# ── 3. App directory + source files ─────────────────────────────────────────────
say "Setting up $APP_DIR ..."
mkdir -p "$APP_DIR/data"

copy_if_present() {
  local fname="$1"
  if [[ -f "$SRC_DIR/$fname" ]]; then
    cp "$SRC_DIR/$fname" "$APP_DIR/$fname"
    ok "Copied $fname"
  elif [[ -f "$APP_DIR/$fname" ]]; then
    ok "$fname already present in $APP_DIR — leaving it as is"
  else
    warn "$fname not found next to this script or in $APP_DIR — you'll need to put it there before starting the service."
  fi
}
copy_if_present "main.py"
copy_if_present "database.py"

if [[ -f "$SRC_DIR/requirements.txt" ]]; then
  cp "$SRC_DIR/requirements.txt" "$APP_DIR/requirements.txt"
else
  cat > "$APP_DIR/requirements.txt" <<'EOF'
fastapi>=0.110
uvicorn[standard]>=0.29
httpx>=0.27
pydantic>=2.6
passlib[bcrypt]>=1.7
bcrypt>=4.0
slowapi>=0.1.9
python-multipart>=0.0.9
PyPDF2>=3.0
python-docx>=1.1
EOF
  warn "requirements.txt not found next to script — wrote a default one"
fi

# ── 4. Python virtualenv ─────────────────────────────────────────────────────────
say "Setting up Python virtualenv..."
if [[ ! -d "$APP_DIR/venv" ]]; then
  python3 -m venv "$APP_DIR/venv"
fi
"$APP_DIR/venv/bin/pip" install --upgrade pip -q
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt" -q
ok "Python dependencies installed"

# ── 5. Permissions ───────────────────────────────────────────────────────────────
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# ── 6. Initialise the database ──────────────────────────────────────────────────
if [[ -f "$APP_DIR/database.py" ]]; then
  say "Initialising SQLite database..."
  runuser -u "$SERVICE_USER" -- bash -c "cd '$APP_DIR' && venv/bin/python -c 'from database import init_db; init_db()'"
  ok "Database ready at $APP_DIR/data/nyx.db"
else
  warn "Skipping database init — database.py is missing"
fi

# ── 7. systemd service ───────────────────────────────────────────────────────────
say "Writing systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Nyx backend (FastAPI + Ollama proxy)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
Environment=NYX_ALLOWED_HOST=${ALLOWED_HOST:-localhost}
ExecStart=${APP_DIR}/venv/bin/uvicorn main:app --host 127.0.0.1 --port ${PORT}
Restart=on-failure
RestartSec=3

# Basic hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${APP_DIR}/data

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}" >/dev/null
sleep 1
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  ok "Service '${SERVICE_NAME}' is running on 127.0.0.1:${PORT}"
else
  warn "Service didn't start cleanly — check: journalctl -u ${SERVICE_NAME} -n 50"
fi

# ── 8. Optional nginx reverse proxy ─────────────────────────────────────────────
if [[ -z "$SETUP_NGINX" ]]; then
  read -rp "Set up an nginx reverse proxy for this service? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] && SETUP_NGINX="yes" || SETUP_NGINX="no"
fi

if [[ "$SETUP_NGINX" == "yes" ]]; then
  apt-get install -y -qq nginx >/dev/null
  read -rp "nginx server_name [${ALLOWED_HOST}]: " nginx_host_input
  new_host="${nginx_host_input:-$ALLOWED_HOST}"
  if [[ "$new_host" != "$ALLOWED_HOST" ]]; then
    ALLOWED_HOST="$new_host"
    say "Host changed — updating NYX_ALLOWED_HOST in the systemd unit to match ('${ALLOWED_HOST}')..."
    sed -i "s|^Environment=NYX_ALLOWED_HOST=.*|Environment=NYX_ALLOWED_HOST=${ALLOWED_HOST}|" "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload
    systemctl restart "${SERVICE_NAME}"
  fi
  NGINX_CONF="/etc/nginx/sites-available/${SERVICE_NAME}.conf"
  cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name ${ALLOWED_HOST};

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # streaming responses (chat, model pulls) need buffering off
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
EOF
  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${SERVICE_NAME}.conf"
  nginx -t && systemctl reload nginx
  ok "nginx reverse proxy configured for ${ALLOWED_HOST} → 127.0.0.1:${PORT}"
  warn "For HTTPS, run (as root): apt install certbot python3-certbot-nginx && certbot --nginx -d ${ALLOWED_HOST}"
  warn "Remember to update NYX_ALLOWED_HOST in the systemd unit if this domain changes:"
  echo "    /etc/systemd/system/${SERVICE_NAME}.service"
else
  ok "Skipping nginx — the service is reachable at http://127.0.0.1:${PORT} (or your LAN IP if not firewalled)"
fi

# ── Done ─────────────────────────────────────────────────────────────────────────
echo
ok "Install complete."
echo
echo "  App directory:   ${APP_DIR}"
echo "  Service:         systemctl status ${SERVICE_NAME}"
echo "  Logs:            journalctl -u ${SERVICE_NAME} -f"
echo "  Database:        ${APP_DIR}/data/nyx.db"
echo
echo "  Next steps:"
echo "  - Point the frontend's API constant (nyx.html) at this server:"
if [[ "$SETUP_NGINX" == "yes" ]]; then
  echo "      const API = 'https://${ALLOWED_HOST}';"
else
  echo "      const API = 'http://<this-machine-lan-ip>:${PORT}';"
fi
echo "  - The first account you register through the app is auto-approved and made admin."
echo "  - Every account after that needs approval from the Admin > Pending tab."
