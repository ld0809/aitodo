#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup_archive_path> [target_db_path]" >&2
  echo "Example: $0 data/backups/todo_manager_20260308T010000Z.db.gz data/app.db" >&2
  exit 1
fi

ARCHIVE_PATH="$1"
TARGET_DB_PATH="${2:-${DATABASE_PATH:-$BACKEND_DIR/data/app.db}}"

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "[restore-db] backup archive not found: $ARCHIVE_PATH" >&2
  exit 1
fi

CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"
if [[ -f "$CHECKSUM_PATH" ]]; then
  EXPECTED_SUM="$(cat "$CHECKSUM_PATH" | tr -d '[:space:]')"
  ACTUAL_SUM="$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')"
  if [[ "$EXPECTED_SUM" != "$ACTUAL_SUM" ]]; then
    echo "[restore-db] checksum mismatch: expected=$EXPECTED_SUM actual=$ACTUAL_SUM" >&2
    exit 1
  fi
fi

TARGET_DIR="$(dirname "$TARGET_DB_PATH")"
mkdir -p "$TARGET_DIR"

TEMP_RESTORE_PATH="${TARGET_DB_PATH}.restore_tmp"
gzip -dc "$ARCHIVE_PATH" > "$TEMP_RESTORE_PATH"

if [[ "$(sqlite3 "$TEMP_RESTORE_PATH" "PRAGMA quick_check;")" != "ok" ]]; then
  echo "[restore-db] quick_check failed, restore aborted" >&2
  rm -f "$TEMP_RESTORE_PATH"
  exit 1
fi

mv "$TEMP_RESTORE_PATH" "$TARGET_DB_PATH"

echo "[restore-db] restore completed"
echo "[restore-db] archive: $ARCHIVE_PATH"
echo "[restore-db] target:  $TARGET_DB_PATH"
