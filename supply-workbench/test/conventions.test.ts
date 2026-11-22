import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { bannedJavaScript } from '../scripts/check-conventions.js';

const root = path.resolve(import.meta.dirname, '..');
const eslint = path.join(root, 'node_modules/eslint/bin/eslint.js');
const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
const checker = path.join(root, 'scripts/check-conventions.ts');

function fails(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stdout + result.stderr).not.toBe(0);
  return `${result.stdout}\n${result.stderr}`;
}

it('41 行的函数、4 个位置参数、any 会被 eslint 拦住', () => {
  const output = fails(process.execPath, [eslint,
    '--no-ignore',
    'test/architecture/conventions/long-function.ts',
    'test/architecture/conventions/many-params.ts',
    'test/architecture/conventions/uses-any.ts',
  ]);
  expect(output).toContain('max-lines-per-function');
  expect(output).toContain('max-params');
  expect(output).toContain('no-explicit-any');
});

it('页面里直接 fetch 会被 eslint 拦住', () => {
  const output = fails(process.execPath, [eslint,'--no-ignore', 'apps/web/src/pages/direct-fetch.violation.ts']);
  expect(output).toContain('no-restricted-syntax');
  expect(output).toContain('页面里不要直接 fetch');
});

it('产品 id 不能当成订单行 id', () => {
  const output = fails(process.execPath, [tsc,
    '-p',
    'test/architecture/id-brand/tsconfig.json',
    '--pretty',
    'false',
    '--noEmit',
  ]);
  expect(output).toContain(
    "Argument of type 'ProductId' is not assignable to parameter of type 'OrderLineId'",
  );
  expect(
    output.match(/Argument of type 'ProductId' is not assignable to parameter of type 'never'/g),
  ).toHaveLength(2);
});

it('类型断言和非空断言会被 eslint 拦住', () => {
  const output = fails(process.execPath, [eslint,'--no-ignore', 'packages/domain/src/type-assertion.violation.ts']);
  expect(output).toContain('consistent-type-assertions');
  expect(output).toContain('no-non-null-assertion');
});

it('domain 里的 ?? 0 和 application 里的 Date.now 会被 eslint 拦住', () => {
  const output = fails(process.execPath, [eslint,
    '--no-ignore',
    'packages/domain/src/nullish-zero.violation.ts',
    'packages/application/src/reads-clock.violation.ts',
  ]);
  expect(output).toContain('no-restricted-syntax');
});

it('名单外的 JavaScript 会被 check-conventions 拦住', () => {
  expect(bannedJavaScript('.agents/skills/example.js')).toBeUndefined();
  expect(bannedJavaScript('.agents/skills/example.jsx')).toBeUndefined();
  expect(bannedJavaScript('supply-workbench/dist/app.js')).toBeUndefined();
  expect(bannedJavaScript('node_modules/pkg/index.js')).toBeUndefined();
  expect(bannedJavaScript('supply-workbench/coverage/out.js')).toBeUndefined();
  expect(bannedJavaScript('supply-workbench/docker/loader.mjs')).toContain('禁止 JavaScript');
  expect(bannedJavaScript('supply-workbench/docker/register.mjs')).toContain('禁止 JavaScript');
  expect(bannedJavaScript('supply-workbench/tools/reconcile/loader.mjs')).toContain(
    '禁止 JavaScript',
  );
  expect(bannedJavaScript('supply-workbench/tools/reconcile/register.mjs')).toContain(
    '禁止 JavaScript',
  );
  expect(bannedJavaScript('.agents/example.js')).toContain('禁止 JavaScript');
  expect(bannedJavaScript('supply-workbench/eslint.config.js')).toContain('禁止 JavaScript');
  expect(bannedJavaScript('supply-workbench/docker/start.mjs')).toContain('禁止 JavaScript');
  expect(bannedJavaScript('supply-workbench/fixtures/sample.js')).toContain('禁止 JavaScript');
  expect(bannedJavaScript('supply-workbench/scripts/check-conventions.ts')).toBeUndefined();
});

it('仓库里新增的 JavaScript 会被 check-conventions 拦住', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'js-ban-'));
  try {
    expect(spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
    mkdirSync(path.join(dir, '.agents/skills'), { recursive: true });
    mkdirSync(path.join(dir, 'node_modules/pkg'), { recursive: true });
    mkdirSync(path.join(dir, 'apps'), { recursive: true });
    writeFileSync(path.join(dir, '.agents/skills/ok.js'), '');
    writeFileSync(path.join(dir, 'node_modules/pkg/index.js'), '');
    writeFileSync(path.join(dir, 'apps/new.js'), 'export {}\n');
    expect(spawnSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
    const scanned = spawnSync(process.execPath, ['--experimental-strip-types', checker], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(scanned.status, scanned.stdout + scanned.stderr).not.toBe(0);
    const text = `${scanned.stdout}\n${scanned.stderr}`;
    expect(text).toContain('apps/new.js');
    expect(text).toContain('禁止 JavaScript');
    expect(text).not.toContain('.agents/skills/ok.js');
    expect(text).not.toContain('node_modules/pkg/index.js');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('禁止的文件名和没编号的 TODO 会被 check-conventions 拦住', () => {
  const output = fails(process.execPath, [
    '--experimental-strip-types',
    checker,
    'test/architecture/conventions/utils.ts',
    'test/architecture/conventions/bare-todo.ts',
  ]);
  expect(output).toContain('禁止的文件名');
  expect(output).toContain('TODO');
});
