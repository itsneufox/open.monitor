#!/bin/bash

set -Eeuo pipefail

umask 077

readonly BACKUP_ROOT='/backups'
readonly SUCCESS_MARKER='/tmp/last-backup-success'
readonly FAILURE_MARKER='/tmp/last-backup-failure'

current_partial=''

log() {
  printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

cleanup() {
  if [[ -n "$current_partial" && -f "$current_partial" ]]; then
    rm -f "$current_partial"
  fi
}

trap cleanup EXIT INT TERM

require_configuration() {
  local missing=()
  local variable

  for variable in \
    MYSQL_HOST \
    MYSQL_PORT \
    MYSQL_DATABASE \
    MYSQL_USER \
    MYSQL_PASSWORD \
    R2_ENDPOINT \
    R2_BUCKET \
    R2_ACCESS_KEY_ID \
    R2_SECRET_ACCESS_KEY; do
    if [[ -z "${!variable:-}" ]]; then
      missing+=("$variable")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    log "ERROR: Missing required configuration: ${missing[*]}"
    return 1
  fi

  if [[ ! "$R2_ENDPOINT" =~ ^https://[^/]+/?$ ]]; then
    log 'ERROR: R2_ENDPOINT must be an HTTPS endpoint without a bucket path'
    return 1
  fi

  if [[ ! "$R2_BUCKET" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
    log 'ERROR: R2_BUCKET is not a valid bucket name'
    return 1
  fi

  if [[ ! "${BACKUP_INTERVAL_SECONDS:-86400}" =~ ^[1-9][0-9]*$ ]]; then
    log 'ERROR: BACKUP_INTERVAL_SECONDS must be a positive integer'
    return 1
  fi

  if [[ ! "${BACKUP_RETRY_SECONDS:-300}" =~ ^[1-9][0-9]*$ ]]; then
    log 'ERROR: BACKUP_RETRY_SECONDS must be a positive integer'
    return 1
  fi

  BACKUP_PREFIX="${BACKUP_PREFIX:-mysql/production}"
  BACKUP_PREFIX="${BACKUP_PREFIX#/}"
  BACKUP_PREFIX="${BACKUP_PREFIX%/}"

  if [[ -z "$BACKUP_PREFIX" \
    || "$BACKUP_PREFIX" == *'..'* \
    || ! "$BACKUP_PREFIX" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    log 'ERROR: BACKUP_PREFIX must be a safe, non-empty object prefix'
    return 1
  fi

  R2_ENDPOINT="${R2_ENDPOINT%/}"

  export RCLONE_CONFIG_R2_TYPE='s3'
  export RCLONE_CONFIG_R2_PROVIDER='Cloudflare'
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_REGION='auto'
  export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
  export RCLONE_CONFIG_R2_ACL='private'
  export RCLONE_CONFIG_R2_NO_CHECK_BUCKET='true'
}

upload_file() {
  local file="$1"
  local relative_path="${file#${BACKUP_ROOT}/}"
  local remote="r2:${R2_BUCKET}/${relative_path}"

  log "Uploading ${relative_path} to R2"

  if ! rclone copyto "$file" "$remote" \
    --no-traverse \
    --retries 3 \
    --low-level-retries 10; then
    log "ERROR: Upload failed for ${relative_path}"
    return 1
  fi

  if ! rclone lsf "$remote" --files-only | grep -q .; then
    log "ERROR: R2 verification failed for ${relative_path}"
    return 1
  fi

  rm -f "$file"
  log "Backup verified in R2: ${relative_path}"
}

upload_pending_backups() {
  local file

  while IFS= read -r -d '' file; do
    if ! upload_file "$file"; then
      return 1
    fi
  done < <(find "$BACKUP_ROOT" -type f -name '*.sql.gz' -print0)

  find "$BACKUP_ROOT" -mindepth 1 -type d -empty -delete
}

create_backup() {
  local timestamp
  local year
  local month
  local relative_path
  local backup_file

  timestamp="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
  year="$(date -u +'%Y')"
  month="$(date -u +'%m')"
  relative_path="${BACKUP_PREFIX}/${year}/${month}/openmonitor-${timestamp}.sql.gz"
  backup_file="${BACKUP_ROOT}/${relative_path}"
  current_partial="${backup_file}.part"

  mkdir -p "$(dirname "$backup_file")"
  find "$BACKUP_ROOT" -type f -name '*.part' -mmin +60 -delete

  log "Creating consistent MySQL backup for ${MYSQL_DATABASE}"

  if ! MYSQL_PWD="$MYSQL_PASSWORD" mysqldump \
    --host="$MYSQL_HOST" \
    --port="$MYSQL_PORT" \
    --user="$MYSQL_USER" \
    --single-transaction \
    --quick \
    --skip-lock-tables \
    --routines \
    --events \
    --triggers \
    --hex-blob \
    --no-tablespaces \
    --set-gtid-purged=OFF \
    --databases "$MYSQL_DATABASE" \
    | gzip -9 > "$current_partial"; then
    log 'ERROR: mysqldump failed'
    rm -f "$current_partial"
    current_partial=''
    return 1
  fi

  if [[ ! -s "$current_partial" ]]; then
    log 'ERROR: mysqldump produced an empty backup'
    rm -f "$current_partial"
    current_partial=''
    return 1
  fi

  mv "$current_partial" "$backup_file"
  current_partial=''

  upload_file "$backup_file"
}

run_backup() {
  upload_pending_backups && create_backup
}

restore_backup() {
  local remote

  if [[ "${RESTORE_CONFIRM:-}" != 'restore-openmonitor' ]]; then
    log 'ERROR: Set RESTORE_CONFIRM=restore-openmonitor to authorize a restore'
    return 1
  fi

  if [[ -z "${BACKUP_OBJECT:-}" \
    || "$BACKUP_OBJECT" == *'..'* \
    || ! "$BACKUP_OBJECT" =~ ^[a-zA-Z0-9._/-]+\.sql\.gz$ ]]; then
    log 'ERROR: BACKUP_OBJECT must be a safe path ending in .sql.gz'
    return 1
  fi

  remote="r2:${R2_BUCKET}/${BACKUP_OBJECT}"

  log "Validating R2 backup before restore: ${BACKUP_OBJECT}"
  if ! rclone cat "$remote" | gzip -t; then
    log 'ERROR: The selected backup is missing, unreadable, or corrupt'
    return 1
  fi

  log "Restoring ${BACKUP_OBJECT} into MySQL"
  if ! rclone cat "$remote" \
    | gzip -dc \
    | MYSQL_PWD="$MYSQL_PASSWORD" mysql \
      --host="$MYSQL_HOST" \
      --port="$MYSQL_PORT" \
      --user="$MYSQL_USER"; then
    log 'ERROR: MySQL restore failed'
    return 1
  fi

  log 'Restore completed successfully'
}

run_schedule() {
  local interval="${BACKUP_INTERVAL_SECONDS:-86400}"
  local retry_interval="${BACKUP_RETRY_SECONDS:-300}"

  while true; do
    if run_backup; then
      touch "$SUCCESS_MARKER"
      log "Backup completed; next run in ${interval} seconds"
      sleep "$interval"
    else
      touch "$FAILURE_MARKER"
      log "ERROR: Backup failed; retrying in ${retry_interval} seconds"
      sleep "$retry_interval"
    fi
  done
}

require_configuration
mkdir -p "$BACKUP_ROOT"

case "${1:-schedule}" in
  once)
    run_backup
    ;;
  restore)
    restore_backup
    ;;
  schedule)
    run_schedule
    ;;
  *)
    log 'ERROR: Usage: openmonitor-backup [schedule|once|restore]'
    exit 2
    ;;
esac
