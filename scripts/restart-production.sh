#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DEPLOY_HOST="${DEPLOY_HOST:-118.89.115.242}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/aitodo.pem}"
PM2_APP="${PM2_APP:-aitodo-backend}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3002/api/v1/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-1}"

SKIP_HEALTH_CHECK=false
DRY_RUN=false

usage() {
  cat <<EOF
Usage:
  scripts/restart-production.sh [options]

Options:
  --host <host>             Default: $DEPLOY_HOST
  --user <user>             Default: $DEPLOY_USER
  --ssh-key <path>          Default: $DEPLOY_SSH_KEY
  --pm2-app <name>          Default: $PM2_APP
  --health-url <url>        Default: $HEALTH_URL
  --health-retries <count>  Default: $HEALTH_RETRIES
  --health-interval <sec>   Default: $HEALTH_INTERVAL
  --skip-health-check       Restart PM2 only, skip curl health check
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
    --pm2-app)
      PM2_APP="${2:-}"
      shift 2
      ;;
    --health-url)
      HEALTH_URL="${2:-}"
      shift 2
      ;;
    --health-retries)
      HEALTH_RETRIES="${2:-}"
      shift 2
      ;;
    --health-interval)
      HEALTH_INTERVAL="${2:-}"
      shift 2
      ;;
    --skip-health-check)
      SKIP_HEALTH_CHECK=true
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
      echo "[restart] unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$DEPLOY_SSH_KEY" ]]; then
  echo "[restart] ssh key not found: $DEPLOY_SSH_KEY" >&2
  exit 1
fi

if ! [[ "$HEALTH_RETRIES" =~ ^[0-9]+$ ]] || [[ "$HEALTH_RETRIES" -lt 1 ]]; then
  echo "[restart] health retries must be a positive integer: $HEALTH_RETRIES" >&2
  exit 1
fi

if ! [[ "$HEALTH_INTERVAL" =~ ^[0-9]+$ ]] || [[ "$HEALTH_INTERVAL" -lt 1 ]]; then
  echo "[restart] health interval must be a positive integer: $HEALTH_INTERVAL" >&2
  exit 1
fi

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ "$DRY_RUN" == true ]]; then
  echo "[restart] dry-run"
  echo "  root_dir:            $ROOT_DIR"
  echo "  target:              $SSH_TARGET"
  echo "  ssh_key:             $DEPLOY_SSH_KEY"
  echo "  pm2_app:             $PM2_APP"
  echo "  health_url:          $HEALTH_URL"
  echo "  health_retries:      $HEALTH_RETRIES"
  echo "  health_interval_sec: $HEALTH_INTERVAL"
  echo "  skip_health_check:   $SKIP_HEALTH_CHECK"
  exit 0
fi

echo "[restart] target=$SSH_TARGET"
echo "[restart] pm2_app=$PM2_APP"

ssh -i "$DEPLOY_SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_TARGET" \
  "sudo -n env PM2_APP='$PM2_APP' HEALTH_URL='$HEALTH_URL' HEALTH_RETRIES='$HEALTH_RETRIES' HEALTH_INTERVAL='$HEALTH_INTERVAL' SKIP_HEALTH_CHECK='$SKIP_HEALTH_CHECK' bash -s" <<'REMOTE'
set -euo pipefail

command -v pm2 >/dev/null 2>&1

if [[ "$SKIP_HEALTH_CHECK" != "true" ]]; then
  command -v curl >/dev/null 2>&1
fi

if ! pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  echo "[restart] pm2 app not found: $PM2_APP" >&2
  pm2 ls
  exit 1
fi

pm2 restart "$PM2_APP" --update-env
pm2 save

if [[ "$SKIP_HEALTH_CHECK" == "true" ]]; then
  echo "[restart] skipped health check"
  exit 0
fi

HEALTH_OK=0
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS "$HEALTH_URL" >/tmp/aitodo-health.json 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep "$HEALTH_INTERVAL"
done

if [[ "$HEALTH_OK" -ne 1 ]]; then
  echo "[restart] health check failed: $HEALTH_URL" >&2
  exit 1
fi

echo "[restart] success"
echo "[restart] health=$(cat /tmp/aitodo-health.json)"
REMOTE
