#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DEPLOY_HOST="${DEPLOY_HOST:-118.89.115.242}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/aitodo.pem}"
DEPLOY_REPO_URL="${DEPLOY_REPO_URL:-https://github.com/ld0809/aitodo.git}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
APP_ROOT="${APP_ROOT:-/opt/aitodo}"
PM2_APP="${PM2_APP:-aitodo-backend}"
REMOTE_DB_PATH="${REMOTE_DB_PATH:-$APP_ROOT/backend/data/app.db}"

SKIP_PUSH=false
DRY_RUN=false

usage() {
  cat <<EOF
Usage:
  scripts/deploy-release.sh [options]

Options:
  --host <host>             Default: $DEPLOY_HOST
  --user <user>             Default: $DEPLOY_USER
  --ssh-key <path>          Default: $DEPLOY_SSH_KEY
  --repo <git_url>          Default: $DEPLOY_REPO_URL
  --branch <branch>         Default: $DEPLOY_BRANCH
  --app-root <path>         Default: $APP_ROOT
  --pm2-app <name>          Default: $PM2_APP
  --db-path <path>          Default: $REMOTE_DB_PATH
  --skip-push               Do not run local git push
  --dry-run                 Print resolved parameters only
  -h, --help                Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      DEPLOY_HOST="${2:-}"
      shift 2
      ;;
    --user)
      DEPLOY_USER="${2:-}"
      shift 2
      ;;
    --ssh-key)
      DEPLOY_SSH_KEY="${2:-}"
      shift 2
      ;;
    --repo)
      DEPLOY_REPO_URL="${2:-}"
      shift 2
      ;;
    --branch)
      DEPLOY_BRANCH="${2:-}"
      shift 2
      ;;
    --app-root)
      APP_ROOT="${2:-}"
      REMOTE_DB_PATH="$APP_ROOT/backend/data/app.db"
      shift 2
      ;;
    --pm2-app)
      PM2_APP="${2:-}"
      shift 2
      ;;
    --db-path)
      REMOTE_DB_PATH="${2:-}"
      shift 2
      ;;
    --skip-push)
      SKIP_PUSH=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[deploy] unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$DEPLOY_SSH_KEY" ]]; then
  echo "[deploy] ssh key not found: $DEPLOY_SSH_KEY" >&2
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "[deploy] dry-run"
  echo "  root_dir:      $ROOT_DIR"
  echo "  host:          $DEPLOY_HOST"
  echo "  user:          $DEPLOY_USER"
  echo "  ssh_key:       $DEPLOY_SSH_KEY"
  echo "  repo_url:      $DEPLOY_REPO_URL"
  echo "  branch:        $DEPLOY_BRANCH"
  echo "  app_root:      $APP_ROOT"
  echo "  pm2_app:       $PM2_APP"
  echo "  remote_db:     $REMOTE_DB_PATH"
  echo "  skip_push:     $SKIP_PUSH"
  exit 0
fi

cd "$ROOT_DIR"

LOCAL_SHA="$(git rev-parse --short HEAD)"
echo "[deploy] local_sha=$LOCAL_SHA"

if [[ "$SKIP_PUSH" != true ]]; then
  echo "[deploy] pushing branch: $DEPLOY_BRANCH"
  git push origin "$DEPLOY_BRANCH"
fi

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"
echo "[deploy] target=$SSH_TARGET"

ssh -i "$DEPLOY_SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_TARGET" \
  "sudo -n env APP_ROOT='$APP_ROOT' REPO_URL='$DEPLOY_REPO_URL' BRANCH='$DEPLOY_BRANCH' PM2_APP='$PM2_APP' REMOTE_DB_PATH='$REMOTE_DB_PATH' bash -s" <<'REMOTE'
set -euo pipefail

command -v git >/dev/null 2>&1
command -v node >/dev/null 2>&1
command -v npm >/dev/null 2>&1
command -v pm2 >/dev/null 2>&1

RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
NEW_RELEASE="$RELEASES_DIR/$TS"
PREV_RELEASE=""

if [[ -L "$CURRENT_LINK" ]]; then
  PREV_RELEASE="$(readlink -f "$CURRENT_LINK" || true)"
fi

echo "[deploy] new_release=$NEW_RELEASE"
mkdir -p "$RELEASES_DIR"
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$NEW_RELEASE"

if [[ -n "$PREV_RELEASE" ]]; then
  if [[ -f "$PREV_RELEASE/backend/.env" ]]; then cp "$PREV_RELEASE/backend/.env" "$NEW_RELEASE/backend/.env"; fi
  if [[ -f "$PREV_RELEASE/client/.env.production" ]]; then cp "$PREV_RELEASE/client/.env.production" "$NEW_RELEASE/client/.env.production"; fi
  if [[ -f "$PREV_RELEASE/client/.env" ]]; then cp "$PREV_RELEASE/client/.env" "$NEW_RELEASE/client/.env"; fi
fi

if [[ -x "$NEW_RELEASE/backend/scripts/backup-db.sh" && -f "$REMOTE_DB_PATH" ]]; then
  echo "[deploy] backup database before migration"
  DATABASE_PATH="$REMOTE_DB_PATH" BACKUP_DIR="$APP_ROOT/backend/data/backups" "$NEW_RELEASE/backend/scripts/backup-db.sh"
fi

echo "[deploy] build backend"
cd "$NEW_RELEASE/backend"
npm ci --no-audit --no-fund
npm run build

echo "[deploy] apply sql migrations"
node "$NEW_RELEASE/backend/scripts/apply-sql-migrations.js" --db "$REMOTE_DB_PATH" --dir "$NEW_RELEASE/backend/migrations/sql"

echo "[deploy] build client"
cd "$NEW_RELEASE/client"
npm ci --no-audit --no-fund
npm run build

ln -sfn "$NEW_RELEASE" "$CURRENT_LINK"

if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  pm2 start dist/main.js --name "$PM2_APP" --cwd "$APP_ROOT/current/backend"
fi
pm2 save

HEALTH_OK=0
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3002/api/v1/health >/tmp/aitodo-health.json 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done

if [[ "$HEALTH_OK" -ne 1 ]]; then
  echo "[deploy] health check failed, start rollback" >&2
  if [[ -n "$PREV_RELEASE" && -d "$PREV_RELEASE" ]]; then
    ln -sfn "$PREV_RELEASE" "$CURRENT_LINK"
    pm2 restart "$PM2_APP" --update-env || true
    pm2 save || true
    echo "[deploy] rolled back to: $PREV_RELEASE" >&2
  fi
  exit 1
fi

echo "[deploy] success"
echo "[deploy] current=$(readlink -f "$CURRENT_LINK")"
echo "[deploy] health=$(cat /tmp/aitodo-health.json)"
REMOTE
