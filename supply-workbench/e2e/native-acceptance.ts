import assert from 'node:assert/strict';
import { execFileSync, fork, type ChildProcess, type ExecFileSyncOptions } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { acceptanceSummary, failureMessage, type AcceptanceSummary } from './acceptance-diagnostics.ts';
import { runAcceptanceProcess } from './acceptance-process.ts';

const [sha, output] = process.argv.slice(2);
assert.ok(sha && /^[0-9a-f]{40}$/.test(sha), 'Provide the full Git SHA');
assert.equal(commandOutput('git', ['rev-parse', 'HEAD']), sha, 'Checkout does not match the requested SHA');
assert.ok(output, 'Provide an evidence directory');
assert.match(process.version, /^v24\./, 'Run with Node.js 24');
const pnpm = process.env.npm_execpath;
assert.ok(pnpm, 'Run via pnpm exec node');
const productionLoader = './docker/register.mts';
const browserChannel = process.env.ACCEPT_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chrome');
const evidenceDir = resolve(output);
await mkdir(dirname(evidenceDir), { recursive: true });
await mkdir(evidenceDir);
type SuiteOutcome = {
  suite: string;
  status: number | null;
  signal: ChildProcess['signalCode'];
  error: string | undefined;
};

type RunEvidence = {
  sha: string;
  platform: string;
  osRelease: string;
  arch: string;
  runnerImage: string | undefined;
  runnerImageVersion: string | undefined;
  node: string;
  pnpm: string;
  browserChannel: string;
  fixtureMode: 'procurement';
  suites: SuiteOutcome[];
  fixtures?: [Awaited<ReturnType<typeof verifyProcurementFixture>>];
  entry?: Awaited<ReturnType<typeof webEntry>>;
  postgres?: string;
  browser?: string;
  health?: Readonly<Record<string, unknown>>;
  result?: 'pass' | 'fail';
  error?: string;
  failureStage?: string;
  cleanupError?: string;
};

const evidence: RunEvidence = {
  sha,
  platform: process.platform,
  osRelease: release(),
  arch: process.arch,
  runnerImage: process.env.ImageOS,
  runnerImageVersion: process.env.ImageVersion,
  node: process.version,
  pnpm: commandOutput(process.execPath, [pnpm, '--version']),
  browserChannel,
  fixtureMode: 'procurement',
  suites: [],
};
const isolatedEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const working = await mkdtemp(join(tmpdir(), 'sw-accept-'));
const pgData = join(working, 'pgdata');
const pgLog = join(working, 'postgres.log');
const appLog = join(working, 'app.log');
let pgStarted = false;
let app: ReturnType<typeof fork> | undefined;
const browserAcceptanceStage = '执行采购浏览器验收';
const cleanupStage = '清理隔离服务与数据库';
let stage = '准备合成样本与浏览器';
let failure: { readonly stage: string; readonly error: unknown } | undefined;
let browserCleanupErrors: readonly unknown[] = [];
try {
  const webDir = resolve('apps/web/dist/app');
  evidence.fixtures = [await verifyProcurementFixture()];
  evidence.entry = await webEntry(webDir);
  evidence.postgres = commandOutput(pgTool('pg_ctl'), ['--version']);
  evidence.browser = await browserVersion();
  stage = '初始化隔离 PostgreSQL';
  const appPort = await availablePort(appPortFromEnv());
  const pgPort = await availablePort();
  assert.notEqual(pgPort, appPort, 'PostgreSQL and the application need separate ports');
  const database = 'sw_accept_' + randomBytes(4).toString('hex');
  const origin = `http://127.0.0.1:${appPort}`;
  run(pgTool('initdb'), ['-D', pgData, '-U', 'sw_accept', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  await appendFile(join(pgData, 'postgresql.conf'), "\nunix_socket_directories = ''\n");
  run(pgTool('pg_ctl'), ['-D', pgData, '-l', pgLog, '-o', `-h 127.0.0.1 -p ${pgPort}`, '-w', 'start']);
  pgStarted = true;
  run(pgTool('createdb'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'sw_accept', '--no-password', database]);

  const env: typeof process.env = {
    ...isolatedEnv,
    DATABASE_URL: `postgresql://sw_accept@127.0.0.1:${pgPort}/${database}`,
    NODE_ENV: 'production',
    AUTH_MODE: 'dev',
    ALLOW_DEV_LOGIN: 'enabled',
    DEV_ACCESS_CODE: randomBytes(24).toString('hex'),
    SESSION_SECRET: randomBytes(32).toString('hex'),
    PORT: String(appPort),
    TZ_BUSINESS: 'Asia/Shanghai',
    UPLOAD_DIR: join(working, 'uploads'),
    SERVE_WEB_DIR: webDir,
    DEVELOPMENT_SCHEDULE_DIR: resolve('fixtures/synthetic/director-schedule'),
    E2E_ALLOW_MUTATION: '1',
    ACCEPT_API: origin,
    ACCEPT_BROWSER: browserChannel,
    PREACCEPT_OUT: join(evidenceDir, 'preaccept'),
  };
  for (const key of ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_REDIRECT_URI', 'FEISHU_REPORT_FOLDER_TOKEN', 'WEEKLY_REPORT_CRON']) delete env[key];
  for (const task of ['migrate', 'seed']) run(process.execPath, ['--experimental-strip-types', '--import', productionLoader, 'scripts/db-lifecycle.ts', task], { env });

  stage = '启动并检查构建后的应用';
  app = fork('docker/start.ts', [], {
    env,
    execArgv: ['--experimental-strip-types', '--import', productionLoader, '--import', './e2e/native-server.ts'],
    silent: true,
  });
  const appExit = once(app, 'exit');
  assert.ok(app.stdout && app.stderr, 'Application log pipes are unavailable');
  const log = createWriteStream(appLog);
  app.stdout.pipe(log, { end: false });
  app.stderr.pipe(log, { end: false });
  app.once('close', () => log.end());
  const listening = once(app, 'message', { signal: globalThis.AbortSignal.timeout(60_000) });
  const [ready] = await Promise.race([listening, appExit]);
  assert.equal(ready, 'listening', 'Built app failed to start');
  const response = await globalThis.fetch(`${origin}/api/v1/health`, { signal: globalThis.AbortSignal.timeout(8000) });
  assert.equal(response.status, 200);
  const health: unknown = await response.json();
  assert.ok(isRecord(health), 'Health response must be a JSON object');
  evidence.health = health;
  assert.equal(health.ok, true);

  stage = browserAcceptanceStage;
  const result = await runAcceptanceProcess({ ...env, PGBIN: process.env.PGBIN });
  evidence.suites.push({ suite: 'procurement', status: result.status, signal: result.signal, error: result.error?.message });
  browserCleanupErrors = result.cleanupErrors ?? [];
  if (result.error) throw result.error;
  const outcome = result.signal ?? `exit status ${result.status}`;
  assert.equal(result.status, 0, `Procurement browser acceptance failed (${outcome})`);
  stage = '核对浏览器实际加载的入口';
  await verifyServedEntry(evidence.entry);
} catch (error) {
  failure = { stage, error };
}

const cleanupErrors: string[] = [];
function recordCleanup(error: unknown): void {
  const message = failureMessage(error);
  cleanupErrors.push(message);
  console.error('Unable to clean up isolated acceptance:', message);
  failure ??= { stage: cleanupStage, error };
}
for (const error of browserCleanupErrors) recordCleanup(error);
if (app !== undefined) {
  try {
    await stopApplication(app, 'SIGTERM', 15_000);
  } catch (error) {
    recordCleanup(new Error('隔离应用关闭失败', { cause: error }));
    try {
      await stopApplication(app, 'SIGKILL', 5_000);
    } catch (forceError) {
      recordCleanup(new Error('无法强制关闭隔离应用', { cause: forceError }));
    }
  }
}
try {
  if (pgStarted) run(pgTool('pg_ctl'), ['-D', pgData, '-m', 'fast', '-w', 'stop']);
} catch (error) {
  recordCleanup(error);
}
if (failure !== undefined) {
  for (const file of [pgLog, appLog]) {
    const log = await readFile(file, 'utf8').catch(() => '');
    if (log.trim()) console.error(log.split('\n').slice(-25).join('\n').trim());
  }
}
if (!cleanupErrors.length) {
  try {
    await rm(working, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    recordCleanup(error);
  }
}
if (cleanupErrors.length) evidence.cleanupError = cleanupErrors.join('\n');

if (failure !== undefined) {
  const error = failureMessage(failure.error);
  evidence.result = 'fail';
  evidence.error = error;
  evidence.failureStage = failure.stage;
  await writeEvidence().catch((error: unknown) => console.error('Unable to save acceptance evidence:', failureMessage(error)));
  const browser: unknown = process.env.GITHUB_STEP_SUMMARY && failure.stage === browserAcceptanceStage
    ? await readFile(join(evidenceDir, 'preaccept', 'result.json'), 'utf8').then(JSON.parse).catch(() => undefined)
    : undefined;
  const additionalCleanup = failure.stage === cleanupStage ? cleanupErrors.slice(1) : cleanupErrors;
  const cleanup = additionalCleanup.length ? { cleanupErrors: additionalCleanup } : {};
  await writeSummary({ sha, result: 'fail', stage: failure.stage, browser, error, ...cleanup });
  throw failure.error;
}
evidence.result = 'pass';
try {
  await writeEvidence();
} catch (error) {
  await writeSummary({ sha, result: 'fail', stage: '保存验收证据', browser: undefined, error: failureMessage(error) });
  throw error;
}
await writeSummary({ sha, result: 'pass' });

async function stopApplication(app: ReturnType<typeof fork>, signal: 'SIGTERM' | 'SIGKILL', timeout: number): Promise<void> {
  if (app.exitCode === null && app.signalCode === null) {
    await Promise.all([
      once(app, 'exit', { signal: globalThis.AbortSignal.timeout(timeout) }),
      Promise.resolve().then(() => app.kill(signal)),
    ]);
  }
  if (signal === 'SIGTERM' && app.exitCode !== 0 && app.signalCode !== signal) {
    throw new Error(`隔离应用退出状态异常：${app.signalCode ?? app.exitCode}`);
  }
}

async function writeSummary(summary: AcceptanceSummary): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) await appendFile(path, acceptanceSummary(summary)).catch(() => console.error('Unable to write the browser acceptance summary.'));
}

function run(command: string, args: readonly string[], options: ExecFileSyncOptions = {}): void {
  execFileSync(command, args, { env: isolatedEnv, stdio: 'inherit', timeout: 60_000, windowsHide: true, ...options });
}

function commandOutput(command: string, args: readonly string[]): string {
  return execFileSync(command, args, { encoding: 'utf8', timeout: 10_000, windowsHide: true }).trim();
}

function pgTool(name: string): string {
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  return process.env.PGBIN ? join(process.env.PGBIN, executable) : executable;
}

function appPortFromEnv(): number {
  const raw = process.env.ACCEPT_PORT;
  if (raw === undefined) return 0;
  assert.match(raw, /^\d{1,5}$/, 'ACCEPT_PORT must be a TCP port');
  const port = Number(raw);
  assert.ok(port > 0 && port <= 65535, 'ACCEPT_PORT must be between 1 and 65535');
  return port;
}

async function availablePort(port = 0): Promise<number> {
  const listener = createServer().listen(port, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  assert.ok(address && typeof address !== 'string', 'Expected a TCP port');
  return address.port;
}

async function webEntry(directory: string) {
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  const file = /<script\b[^>]*\bsrc="\/(assets\/[a-zA-Z0-9_.-]+\.js)"/.exec(html)?.[1];
  assert.ok(file, 'Built HTML is missing its JavaScript entry');
  const bytes = await readFile(join(directory, file));
  return { file, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function verifyServedEntry(entry: Awaited<ReturnType<typeof webEntry>>): Promise<void> {
  const result: unknown = JSON.parse(await readFile(join(evidenceDir, 'preaccept', 'result.json'), 'utf8'));
  assert.ok(isRecord(result) && isRecord(result.checks) && isRecord(result.checks.shell), 'Preaccept shell evidence is missing');
  const { asset, sha256 } = result.checks.shell;
  assert.equal(asset, `/${entry.file}`, 'HTTP entry path differs from the built entry');
  assert.equal(sha256, entry.sha256, 'HTTP entry SHA-256 differs from the built entry');
}

async function verifyProcurementFixture() {
  const file = 'fixtures/synthetic/po-master-procurement.xlsx';
  const committed = execFileSync('git', ['cat-file', 'blob', `HEAD:./${file}`], { timeout: 10_000, windowsHide: true });
  const bytes = await readFile(file);
  assert.ok(bytes.equals(committed), 'Synthetic acceptance fixture differs from checked-out Git blob');
  return { file, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

async function browserVersion(): Promise<string> {
  const require = createRequire(new URL('../packages/report-renderers/package.json', import.meta.url));
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, channel: browserChannel });
  try {
    return browser.version();
  } finally {
    await browser.close();
  }
}

async function writeEvidence(): Promise<void> {
  await writeFile(join(evidenceDir, 'run.json'), JSON.stringify(evidence, null, 2) + '\n');
}
