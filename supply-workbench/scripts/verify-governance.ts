import { spawnSync } from 'node:child_process';

const suites = [
  'test/governance.test.ts',
  'test/application/imports.test.ts',
  'test/application/import-presence.test.ts',
  'test/application/import-state.test.ts',
  'test/application/factory-snapshot-import.test.ts',
  'test/domain/factory-snapshots.test.ts',
  'test/application/concurrency.test.ts',
  'test/application/performance.test.ts',
  'test/application/reporting.test.ts',
  'test/persistence/p02.test.ts',
  'test/persistence/factory-row-migration.test.ts',
  'test/persistence/idempotency.test.ts',
  'test/persistence/settings-concurrency.test.ts',
  'test/web/business-timezone.test.ts',
  'test/server/auth-timezone-boundary.test.ts',
  'test/server/feishu-oauth.test.ts',
  'test/server/import-coverage-attestation.test.ts',
  'test/persistence/oauth-state.test.ts',
] as const;

const snapshot = spawnSync('pnpm', ['verify:factory-snapshots'], { cwd: process.cwd(), stdio: 'inherit' });
if (snapshot.error !== undefined) throw snapshot.error;
const snapshotStatus = snapshot.status ?? 1;

console.log(`治理验收套件：${suites.length} 个文件`);
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...suites, '--sequence.concurrent=false', '--reporter=verbose'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

if (result.error !== undefined) throw result.error;
const testStatus = result.status ?? 1;
process.exitCode = snapshotStatus !== 0 ? snapshotStatus : testStatus;
