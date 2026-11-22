#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"

pnpm build
pnpm --filter @sw/web build
evidence_parent=$(mktemp -d "${TMPDIR:-/tmp}/sw-e2e-evidence.XXXXXX")
printf 'Acceptance evidence directory: %s\n' "$evidence_parent/run"
pnpm exec node --experimental-strip-types e2e/native-acceptance.ts "$(git rev-parse HEAD)" "$evidence_parent/run"
