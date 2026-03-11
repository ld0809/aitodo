#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/aitodo}"
RELEASES_DIR="${RELEASES_DIR:-$APP_ROOT/releases}"
CURRENT_LINK="${CURRENT_LINK:-$APP_ROOT/current}"
PM2_APP="${PM2_APP:-aitodo-backend}"
PM2_BIN="${PM2_BIN:-pm2}"
NGINX_RELOAD_CMD="${NGINX_RELOAD_CMD:-systemctl reload nginx}"

TARGET_RELEASE=""
DRY_RUN=false
SKIP_NGINX=false

usage() {
  cat <<'EOF'
Usage:
  rollback-release.sh [options]

Options:
  -t, --target <release_name_or_path>  Roll back to the specified release directory.
                                        If omitted, rollback to the previous release.
  --dry-run                             Print actions without executing them.
  --skip-nginx                          Skip nginx reload.
  -h, --help                            Show this help.

Environment variables (optional):
  APP_ROOT         Default: /opt/aitodo
  RELEASES_DIR     Default: $APP_ROOT/releases
  CURRENT_LINK     Default: $APP_ROOT/current
  PM2_APP          Default: aitodo-backend
  PM2_BIN          Default: pm2
  NGINX_RELOAD_CMD Default: systemctl reload nginx

Examples:
  ./scripts/rollback-release.sh
  ./scripts/rollback-release.sh --target 20260311T101500Z
  ./scripts/rollback-release.sh --target /opt/aitodo/releases/20260311T101500Z --dry-run
EOF
}

run_cmd() {
  local cmd="$1"
  if [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] $cmd"
    return 0
  fi
  eval "$cmd"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--target)
      TARGET_RELEASE="${2:-}"
      if [[ -z "$TARGET_RELEASE" ]]; then
        echo "[rollback] missing value for $1" >&2
        exit 1
      fi
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-nginx)
      SKIP_NGINX=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[rollback] unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -d "$RELEASES_DIR" ]]; then
  echo "[rollback] releases directory not found: $RELEASES_DIR" >&2
  exit 1
fi

RELEASE_PATHS=()
while IFS= read -r path; do
  RELEASE_PATHS+=("$path")
done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort)
if [[ "${#RELEASE_PATHS[@]}" -eq 0 ]]; then
  echo "[rollback] no release directories found in $RELEASES_DIR" >&2
  exit 1
fi

resolve_target_release() {
  if [[ -n "$TARGET_RELEASE" ]]; then
    if [[ "$TARGET_RELEASE" == /* ]]; then
      echo "$TARGET_RELEASE"
    else
      echo "$RELEASES_DIR/$TARGET_RELEASE"
    fi
    return 0
  fi

  if [[ "${#RELEASE_PATHS[@]}" -lt 2 ]]; then
    echo "[rollback] at least two releases are required for automatic rollback" >&2
    exit 1
  fi

  local current_target=""
  if [[ -L "$CURRENT_LINK" ]]; then
    current_target="$(readlink "$CURRENT_LINK" || true)"
    if [[ "$current_target" != /* && -n "$current_target" ]]; then
      current_target="$(cd "$(dirname "$CURRENT_LINK")" && cd "$(dirname "$current_target")" && pwd)/$(basename "$current_target")"
    fi
  fi

  if [[ -n "$current_target" ]]; then
    local idx
    for idx in "${!RELEASE_PATHS[@]}"; do
      if [[ "${RELEASE_PATHS[$idx]}" == "$current_target" ]]; then
        if [[ "$idx" -eq 0 ]]; then
          echo "[rollback] current release is already the earliest: $current_target" >&2
          exit 1
        fi
        echo "${RELEASE_PATHS[$((idx - 1))]}"
        return 0
      fi
    done
  fi

  # Fallback: pick the second latest release by lexical order.
  echo "${RELEASE_PATHS[$(( ${#RELEASE_PATHS[@]} - 2 ))]}"
}

TARGET_PATH="$(resolve_target_release)"

if [[ ! -d "$TARGET_PATH" ]]; then
  echo "[rollback] target release does not exist: $TARGET_PATH" >&2
  exit 1
fi

echo "[rollback] releases dir: $RELEASES_DIR"
echo "[rollback] current link: $CURRENT_LINK"
echo "[rollback] target:       $TARGET_PATH"
echo "[rollback] pm2 app:      $PM2_APP"
echo "[rollback] dry run:      $DRY_RUN"

run_cmd "ln -sfn '$TARGET_PATH' '$CURRENT_LINK'"
run_cmd "$PM2_BIN restart '$PM2_APP' --update-env"

if [[ "$SKIP_NGINX" == true ]]; then
  echo "[rollback] skip nginx reload"
else
  run_cmd "$NGINX_RELOAD_CMD"
fi

echo "[rollback] completed"
