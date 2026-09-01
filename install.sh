#!/usr/bin/env bash
# NyxV2 full-stack installer for Debian/Ubuntu Linux.
# Installs the bundled FastAPI backend, builds the Vite frontend, and serves it with nginx.
#
# Usage:
#   sudo ./install.sh
#   sudo NYX_API_URL=https://api.example.com NYX_DOMAIN=nyx.example.com ./install.sh

set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SRC_DIR}/backend"
WEB_ROOT="${NYX_WEB_ROOT:-/var/www/nyx}"
NYX_DOMAIN="${NYX_DOMAIN:-_}"
NYX_API_URL="${NYX_API_URL:-}"
NYX_PORT="${NYX_PORT:-8000}"
NYX_BACKEND_URL="${NYX_BACKEND_URL:-http://127.0.0.1:${NYX_PORT}}"
SETUP_NGINX="${SETUP_NGINX:-yes}"
NGINX_SITE="${NYX_NGINX_SITE:-nyx}"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Run this script as root: sudo ./install.sh"
command -v apt-get >/dev/null 2>&1 || die "This script supports Debian/Ubuntu systems with apt-get."
[[ -f "${SRC_DIR}/package.json" ]] || die "package.json not found next to this script."
[[ -f "${SRC_DIR}/package-lock.json" ]] || die "package-lock.json not found; run npm install before deploying."
[[ -f "${BACKEND_DIR}/install.sh" ]] || die "Bundled backend installer not found: ${BACKEND_DIR}/install.sh"

say "Installing bundled Nyx backend..."
(
  cd "${BACKEND_DIR}"
  NYX_PORT="${NYX_PORT}" SETUP_NGINX=no bash ./install.sh
)

say "Installing system prerequisites..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl build-essential >/dev/null

node_is_usable() {
  command -v node >/dev/null 2>&1 || return 1
  node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 19) ? 0 : 1)"
}

if ! node_is_usable; then
  say "Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs >/dev/null
fi

node_is_usable || die "Node.js 20.19+ is required by Vite 8."
ok "Node.js $(node --version) and npm $(npm --version) ready"

say "Installing frontend dependencies..."
cd "${SRC_DIR}"
npm ci

say "Building NyxV2..."
npm run build
[[ -f "${SRC_DIR}/dist/index.html" ]] || die "Vite did not create dist/index.html."

say "Installing frontend into ${WEB_ROOT}..."
install -d -m 0755 "${WEB_ROOT}"
cp -a "${SRC_DIR}/dist/." "${WEB_ROOT}/"

# Keep the API configurable after deployment without rebuilding the bundle.
cat > "${WEB_ROOT}/config.js" <<EOF
window.NYX_CONFIG = {
  API_URL: "${NYX_API_URL}",
};
EOF
chmod 0644 "${WEB_ROOT}/config.js"
ok "Frontend installed at ${WEB_ROOT}"

if [[ "${SETUP_NGINX}" == "yes" ]]; then
  say "Configuring nginx..."
  apt-get install -y -qq nginx >/dev/null
  cat > "/etc/nginx/sites-available/${NGINX_SITE}.conf" <<EOF
server {
    listen 80;
    server_name ${NYX_DOMAIN};
    root ${WEB_ROOT};
    index index.html;

    client_max_body_size 25m;

    location /api/ {
        proxy_pass ${NYX_BACKEND_URL}/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
  ln -sfn "/etc/nginx/sites-available/${NGINX_SITE}.conf" "/etc/nginx/sites-enabled/${NGINX_SITE}.conf"
  nginx -t
  systemctl enable --now nginx >/dev/null
  systemctl reload nginx
  ok "nginx serves NyxV2 on ${NYX_DOMAIN}"
else
  warn "nginx setup skipped. Serve ${WEB_ROOT} with a static server and set NYX_API_URL appropriately."
fi

echo
echo "NyxV2 installation complete."
echo "  Web root:  ${WEB_ROOT}"
echo "  API URL:   ${NYX_API_URL:-same-origin via nginx /api/}"
echo "  Rebuild:   cd ${SRC_DIR} && npm run build"
