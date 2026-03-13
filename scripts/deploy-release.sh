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
CONFIG_BACKUP_DIR="${CONFIG_BACKUP_DIR:-$APP_ROOT/configs_backup}"
BACKEND_ENV_BACKUP_PATH="${BACKEND_ENV_BACKUP_PATH:-$CONFIG_BACKUP_DIR/.env}"
CLIENT_ENV_PRODUCTION_BACKUP_PATH="${CLIENT_ENV_PRODUCTION_BACKUP_PATH:-$CONFIG_BACKUP_DIR/client.env.production}"
CLIENT_ENV_BACKUP_PATH="${CLIENT_ENV_BACKUP_PATH:-$CONFIG_BACKUP_DIR/client.env}"

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
  --config-backup-dir <dir> Default: $CONFIG_BACKUP_DIR
  --backend-env <path>      Default: $BACKEND_ENV_BACKUP_PATH
  --client-env-prod <path>  Default: $CLIENT_ENV_PRODUCTION_BACKUP_PATH
  --client-env <path>       Default: $CLIENT_ENV_BACKUP_PATH
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
    --config-backup-dir)
      CONFIG_BACKUP_DIR="${2:-}"
      BACKEND_ENV_BACKUP_PATH="$CONFIG_BACKUP_DIR/.env"
      CLIENT_ENV_PRODUCTION_BACKUP_PATH="$CONFIG_BACKUP_DIR/client.env.production"
      CLIENT_ENV_BACKUP_PATH="$CONFIG_BACKUP_DIR/client.env"
      shift 2
      ;;
    --backend-env)
      BACKEND_ENV_BACKUP_PATH="${2:-}"
      shift 2
      ;;
    --client-env-prod)
      CLIENT_ENV_PRODUCTION_BACKUP_PATH="${2:-}"
      shift 2
      ;;
    --client-env)
      CLIENT_ENV_BACKUP_PATH="${2:-}"
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
  echo "  config_dir:    $CONFIG_BACKUP_DIR"
  echo "  backend_env:   $BACKEND_ENV_BACKUP_PATH"
  echo "  client_env:    $CLIENT_ENV_BACKUP_PATH"
  echo "  client_env_p:  $CLIENT_ENV_PRODUCTION_BACKUP_PATH"
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
  "sudo -n env APP_ROOT='$APP_ROOT' REPO_URL='$DEPLOY_REPO_URL' BRANCH='$DEPLOY_BRANCH' PM2_APP='$PM2_APP' REMOTE_DB_PATH='$REMOTE_DB_PATH' BACKEND_ENV_BACKUP_PATH='$BACKEND_ENV_BACKUP_PATH' CLIENT_ENV_PRODUCTION_BACKUP_PATH='$CLIENT_ENV_PRODUCTION_BACKUP_PATH' CLIENT_ENV_BACKUP_PATH='$CLIENT_ENV_BACKUP_PATH' bash -s" <<'REMOTE'
set -euo pipefail

command -v git >/dev/null 2>&1
command -v node >/dev/null 2>&1
command -v npm >/dev/null 2>&1
command -v pm2 >/dev/null 2>&1
command -v curl >/dev/null 2>&1

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

OWNER_REPO="$(echo "$REPO_URL" | sed -E 's#^git@github.com:##; s#^https://github.com/##; s#\.git$##')"
if [[ "$OWNER_REPO" == "$REPO_URL" || "$OWNER_REPO" != */* ]]; then
  echo "[deploy] unsupported repo url for codeload: $REPO_URL" >&2
  exit 1
fi

ARCHIVE_URL="https://codeload.github.com/$OWNER_REPO/tar.gz/refs/heads/$BRANCH"
ARCHIVE_FILE="/tmp/aitodo-$TS.tar.gz"
echo "[deploy] download archive: $ARCHIVE_URL"
curl -fL --retry 5 --retry-delay 2 --connect-timeout 20 --max-time 300 "$ARCHIVE_URL" -o "$ARCHIVE_FILE"

mkdir -p "$NEW_RELEASE"
tar -xzf "$ARCHIVE_FILE" -C "$NEW_RELEASE" --strip-components=1
rm -f "$ARCHIVE_FILE"

if [[ -f "$BACKEND_ENV_BACKUP_PATH" ]]; then
  echo "[deploy] use backend env backup: $BACKEND_ENV_BACKUP_PATH"
  cp "$BACKEND_ENV_BACKUP_PATH" "$NEW_RELEASE/backend/.env"
elif [[ -n "$PREV_RELEASE" && -f "$PREV_RELEASE/backend/.env" ]]; then
  echo "[deploy] reuse backend env from previous release"
  cp "$PREV_RELEASE/backend/.env" "$NEW_RELEASE/backend/.env"
fi

if [[ -f "$CLIENT_ENV_PRODUCTION_BACKUP_PATH" ]]; then
  echo "[deploy] use client prod env backup: $CLIENT_ENV_PRODUCTION_BACKUP_PATH"
  cp "$CLIENT_ENV_PRODUCTION_BACKUP_PATH" "$NEW_RELEASE/client/.env.production"
elif [[ -n "$PREV_RELEASE" && -f "$PREV_RELEASE/client/.env.production" ]]; then
  echo "[deploy] reuse client prod env from previous release"
  cp "$PREV_RELEASE/client/.env.production" "$NEW_RELEASE/client/.env.production"
fi

if [[ -f "$CLIENT_ENV_BACKUP_PATH" ]]; then
  echo "[deploy] use client env backup: $CLIENT_ENV_BACKUP_PATH"
  cp "$CLIENT_ENV_BACKUP_PATH" "$NEW_RELEASE/client/.env"
elif [[ -n "$PREV_RELEASE" && -f "$PREV_RELEASE/client/.env" ]]; then
  echo "[deploy] reuse client env from previous release"
  cp "$PREV_RELEASE/client/.env" "$NEW_RELEASE/client/.env"
fi

read_package_version() {
  local package_json="$1"
  if [[ ! -f "$package_json" ]]; then
    echo ""
    return
  fi

  node -e '
    const fs = require("fs");
    const packageJson = process.argv[1];
    try {
      const parsed = JSON.parse(fs.readFileSync(packageJson, "utf8"));
      process.stdout.write(String(parsed.version ?? ""));
    } catch {
      process.stdout.write("");
    }
  ' "$package_json"
}

reuse_node_modules_if_same_version() {
  local app_name="$1"
  local prev_app_dir="$PREV_RELEASE/$app_name"
  local new_app_dir="$NEW_RELEASE/$app_name"
  local prev_version
  local new_version

  if [[ ! -d "$prev_app_dir/node_modules" ]]; then
    return 1
  fi

  prev_version="$(read_package_version "$prev_app_dir/package.json")"
  new_version="$(read_package_version "$new_app_dir/package.json")"

  if [[ -z "$prev_version" || -z "$new_version" ]]; then
    return 1
  fi
  if [[ "$prev_version" != "$new_version" ]]; then
    return 1
  fi

  echo "[deploy] reuse $app_name node_modules (version=$new_version)"
  cp -a "$prev_app_dir/node_modules" "$new_app_dir/node_modules"
}

BACKEND_NODE_MODULES_REUSED=0
CLIENT_NODE_MODULES_REUSED=0

if [[ -n "$PREV_RELEASE" && -d "$PREV_RELEASE" ]]; then
  if reuse_node_modules_if_same_version backend; then
    BACKEND_NODE_MODULES_REUSED=1
  fi
  if reuse_node_modules_if_same_version client; then
    CLIENT_NODE_MODULES_REUSED=1
  fi
fi

if [[ -x "$NEW_RELEASE/backend/scripts/backup-db.sh" && -f "$REMOTE_DB_PATH" ]]; then
  echo "[deploy] backup database before migration"
  DATABASE_PATH="$REMOTE_DB_PATH" BACKUP_DIR="$APP_ROOT/backend/data/backups" "$NEW_RELEASE/backend/scripts/backup-db.sh"
fi

echo "[deploy] build backend"
cd "$NEW_RELEASE/backend"
if [[ "$BACKEND_NODE_MODULES_REUSED" -eq 1 ]]; then
  echo "[deploy] skip backend npm ci (reused node_modules)"
else
  npm ci --no-audit --no-fund
fi
npm run build

echo "[deploy] reminder: if schema changed, generate+commit local migration SQL before deploy"

echo "[deploy] apply sql migrations"
node "$NEW_RELEASE/backend/scripts/apply-sql-migrations.js" --db "$REMOTE_DB_PATH" --dir "$NEW_RELEASE/backend/migrations/sql"

echo "[deploy] build client"
cd "$NEW_RELEASE/client"
if [[ "$CLIENT_NODE_MODULES_REUSED" -eq 1 ]]; then
  echo "[deploy] skip client npm ci (reused node_modules)"
else
  npm ci --no-audit --no-fund
fi
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
