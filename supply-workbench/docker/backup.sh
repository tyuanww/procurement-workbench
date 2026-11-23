#!/bin/bash
set -euo pipefail
umask 077

backup_dir=${BACKUP_DIR:-/backups}
uploads_dir=${UPLOADS_DIR:-/uploads}
mkdir -p -- "$backup_dir"

for attempt in {1..30}; do
  if pg_isready --quiet --timeout=2; then break; fi
  if [[ $attempt == 30 ]]; then
    echo 'backup failed: PostgreSQL did not become ready' >&2
    exit 1
  fi
  sleep 5
done

stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=$(mktemp -d "$backup_dir/.backup-$stamp.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
dump="sw-$stamp.dump"
archive="uploads-$stamp.tgz"
checksums="backup-$stamp.sha256"

pg_dump -Fc -f "$stage/$dump"
pg_restore --list "$stage/$dump" >/dev/null
tar -C "$uploads_dir" -czf "$stage/$archive" .
tar -tzf "$stage/$archive" >/dev/null
(
  cd -- "$stage"
  sha256sum -- "$dump" "$archive" > "$checksums"
)

for name in "$dump" "$archive" "$checksums"; do
  ln -- "$stage/$name" "$backup_dir/$name"
done
echo "backup $stamp verified"

while IFS= read -r -d '' old_checksums; do
  old_stamp=${old_checksums##*/}
  old_stamp=${old_stamp#backup-}
  old_stamp=${old_stamp%.sha256}
  rm -f -- "$backup_dir/sw-$old_stamp.dump" "$backup_dir/uploads-$old_stamp.tgz" "$old_checksums"
done < <(find "$backup_dir" -maxdepth 1 -type f -name 'backup-????????T??????Z.sha256' -mtime +14 -print0)
