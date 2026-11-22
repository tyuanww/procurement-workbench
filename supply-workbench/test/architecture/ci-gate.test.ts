import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const workflows = new URL('../../../.github/workflows/', import.meta.url);
const linux = readFileSync(new URL('verify.yml', workflows), 'utf8');
const windows = readFileSync(new URL('windows-acceptance.yml', workflows), 'utf8');

it('Linux 发布门禁执行工程检查、数据库校验、报表和 Chrome 合成链路', () => {
  for (const command of [
    'pnpm typecheck', 'pnpm lint', 'pnpm verify:pg', 'vitest run test/persistence', 'vitest run test/report-renderers',
    'e2e/native-acceptance.ts', 'ACCEPT_BROWSER: chrome',
  ]) expect(linux).toContain(command);
  expect(linux).toContain('runs-on: ubuntu-latest');
  expect(linux).toContain('refs/remotes/origin/main');
});

it('Windows 门禁使用 Edge 和独立 PostgreSQL 执行合成链路', () => {
  for (const entry of [
    'runs-on: windows-', 'ACCEPT_BROWSER: msedge', 'PGBIN', 'e2e/native-acceptance.ts',
  ]) expect(windows).toContain(entry);
});

it('两个平台均支持指定提交、核对检出以及报告被测 SHA', () => {
  for (const workflow of [linux, windows]) {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('sha:');
    expect(workflow).toContain('[0-9a-f]{40}');
    expect(workflow).toContain('git rev-parse');
    expect(workflow).toContain('HEAD');
    expect(workflow).toContain('Tested SHA');
  }
});

it('PR 模板要求被测 SHA、实际结果和未跑项', () => {
  const template = readFileSync(new URL('../../../.github/PULL_REQUEST_TEMPLATE.md', import.meta.url), 'utf8');
  for (const field of ['被测 SHA', '结果', '未跑']) expect(template).toContain(field);
});
