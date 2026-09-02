#!/usr/bin/env bash
# Nyx updater — pulls the latest pushed fixes and redeploys the backend and
# frontend in place, without touching the database, uploaded content, or the
# deployed frontend's runtime config.js.
#
# Run this from the same git checkout that install.sh was originally run from.
#
# Usage:
#   sudo ./update.sh
#   sudo NYX_GIT_REF=main ./update.sh

set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SRC_DIR}/backend"
APP_DIR="${NYX_APP_DIR:-/opt/nyx}"
WEB_ROOT="${NYX_WEB_ROOT:-/var/www/nyx}"
SERVICE_NAME="${NYX_SERVICE_NAME:-nyx-backend}"
SERVICE_USER="${NYX_SERVICE_USER:-nyx}"
GIT_REF="${NYX_GIT_REF:-}"   # branch/tag to switch to; empty = stay on current branch

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Run this script as root: sudo ./update.sh"
command -v git >/dev/null 2>&1 || die "git is required."
[[ -d "${SRC_DIR}/.git" ]] || die "${SRC_DIR} is not a git checkout — clone the repo with git to use this script."
[[ -d "${APP_DIR}" ]] || die "Backend not installed at ${APP_DIR}. Run install.sh first."
[[ -x "${APP_DIR}/venv/bin/pip" ]] || die "Backend virtualenv missing at ${APP_DIR}/venv. Run install.sh first."
[[ -d "${WEB_ROOT}" ]] || die "Frontend not installed at ${WEB_ROOT}. Run install.sh first."

cd "${SRC_DIR}"

say "Fetching latest changes..."
git fetch --all --tags --prune

if [[ -n "${GIT_REF}" ]]; then
  say "Checking out ${GIT_REF}..."
  git checkout "${GIT_REF}"
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${CURRENT_BRANCH}" != "HEAD" ]]; then
  say "Pulling latest for branch '${CURRENT_BRANCH}'..."
  git pull --ff-only origin "${CURRENT_BRANCH}" \
    || die "Fast-forward pull failed — there are local commits or edits in ${SRC_DIR}. Resolve manually, then re-run."
else
  warn "Detached HEAD at $(git rev-parse --short HEAD) — already on the requested ref, skipping pull."
fi

ok "Source updated to $(git log -1 --format='%h %s')"

# ── Back up the database before touching anything ─────────────────────────────
BACKUP_FILE=""
if [[ -f "${APP_DIR}/data/nyx.db" ]]; then
  BACKUP_DIR="${APP_DIR}/data/backups"
  mkdir -p "${BACKUP_DIR}"
  BACKUP_FILE="${BACKUP_DIR}/nyx-$(date +%Y%m%d-%H%M%S).db"
  cp -a "${APP_DIR}/data/nyx.db" "${BACKUP_FILE}"
  ok "Database backed up to ${BACKUP_FILE}"
else
  warn "No existing database found at ${APP_DIR}/data/nyx.db — skipping backup."
fi

# ── Update backend ──────────────────────────────────────────────────────────────
say "Updating backend code..."
cp "${BACKEND_DIR}/main.py" "${APP_DIR}/main.py"
cp "${BACKEND_DIR}/database.py" "${APP_DIR}/database.py"
cp "${BACKEND_DIR}/requirements.txt" "${APP_DIR}/requirements.txt"
chown "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}/main.py" "${APP_DIR}/database.py" "${APP_DIR}/requirements.txt"

say "Updating backend dependencies..."
"${APP_DIR}/venv/bin/pip" install -q --upgrade -r "${APP_DIR}/requirements.txt"
ok "Backend dependencies up to date"

say "Restarting ${SERVICE_NAME}..."
systemctl restart "${SERVICE_NAME}"
sleep 1
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  ok "Service '${SERVICE_NAME}' is running"
else
  die "Service failed to restart — check: journalctl -u ${SERVICE_NAME} -n 50"
fi

# ── Update frontend ──────────────────────────────────────────────────────────────
if ! command -v rsync >/dev/null 2>&1; then
  say "Installing rsync..."
  apt-get update -qq
  apt-get install -y -qq rsync >/dev/null
fi

say "Installing frontend dependencies..."
npm ci

say "Building frontend..."
npm run build
[[ -f "${SRC_DIR}/dist/index.html" ]] || die "Vite did not create dist/index.html."

say "Deploying frontend to ${WEB_ROOT}..."
# config.js is excluded on both sides: never overwritten, never deleted — the
# deployed API_URL survives every update.
rsync -a --delete --exclude 'config.js' "${SRC_DIR}/dist/" "${WEB_ROOT}/"
[[ -f "${WEB_ROOT}/config.js" ]] || warn "No config.js found at ${WEB_ROOT} — set NYX_CONFIG.API_URL manually before use."
ok "Frontend updated at ${WEB_ROOT}"

echo
ok "Nyx update complete."
echo "  Commit:    $(git log -1 --format='%h %s')"
echo "  Backend:   systemctl status ${SERVICE_NAME}"
echo "  Frontend:  ${WEB_ROOT}"
[[ -n "${BACKUP_FILE}" ]] && echo "  DB backup: ${BACKUP_FILE}"
