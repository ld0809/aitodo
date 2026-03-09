#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_PATH="${DATABASE_PATH:-$BACKEND_DIR/data/app.db}"
BACKUP_DIR="${BACKUP_DIR:-$BACKEND_DIR/data/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_BASENAME="todo_manager_${TIMESTAMP}"
WORK_DB="$BACKUP_DIR/${BACKUP_BASENAME}.db"
ARCHIVE_PATH="$BACKUP_DIR/${BACKUP_BASENAME}.db.gz"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

if [[ ! -f "$DB_PATH" ]]; then
  echo "[backup-db] database file not found: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

LOCK_DIR="$BACKUP_DIR/.backup.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[backup-db] another backup process is running" >&2
  exit 1
fi
trap 'rm -rf "$LOCK_DIR" "$WORK_DB"' EXIT

# Use SQLite online backup API to avoid inconsistent file copies while writes happen.
sqlite3 "$DB_PATH" ".backup '$WORK_DB'"

if [[ "$(sqlite3 "$WORK_DB" "PRAGMA quick_check;")" != "ok" ]]; then
  echo "[backup-db] quick_check failed, backup aborted" >&2
  exit 1
fi

gzip -9 "$WORK_DB"
shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}' > "$CHECKSUM_PATH"

ln -sfn "$(basename "$ARCHIVE_PATH")" "$BACKUP_DIR/latest.db.gz"
ln -sfn "$(basename "$CHECKSUM_PATH")" "$BACKUP_DIR/latest.db.gz.sha256"

find "$BACKUP_DIR" -type f -name 'todo_manager_*.db.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name 'todo_manager_*.db.gz.sha256' -mtime +"$RETENTION_DAYS" -delete

ARCHIVE_SIZE="$(wc -c < "$ARCHIVE_PATH" | tr -d ' ')"
CHECKSUM="$(cat "$CHECKSUM_PATH")"

echo "[backup-db] backup completed"
echo "[backup-db] source:   $DB_PATH"
echo "[backup-db] archive:  $ARCHIVE_PATH"
echo "[backup-db] size:     ${ARCHIVE_SIZE} bytes"
echo "[backup-db] sha256:   $CHECKSUM"
