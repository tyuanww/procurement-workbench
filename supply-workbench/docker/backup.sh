#!/bin/bash
set -euo pipefail
mkdir -p /backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump -Fc -f "/backups/sw-${stamp}.dump"
tar -C /uploads -czf "/backups/uploads-${stamp}.tgz" . || true
find /backups -type f -mtime +14 -delete
echo "backup ${stamp}"
