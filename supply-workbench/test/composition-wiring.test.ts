import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const compositionDir = 'apps/server/src/composition';
const allowedThrow = /路由由 buildHttpApp 挂载|上报行视图还没接到查询|定时生成不写文件/;

it('composition 没有业务分支和直接 SQL', () => {
  expect(violations()).toEqual([]);
});

function violations(): string[] {
  return sourceFiles().flatMap((file) => lineProblems(file, stripComments(read(file))));
}

function lineProblems(file: string, source: string): string[] {
  return source.split('\n').flatMap((line, index) => problemOf({ file, lineNo: index + 1, line }));
}

function problemOf(input: { readonly file: string; readonly lineNo: number; readonly line: string }): string[] {
  const found: string[] = [];
  if (/\b(?:if|switch|for|while|try)\b/.test(input.line)) found.push(`${input.file}:${input.lineNo}: 业务分支`);
  if (/\bschema\b|\bsql`|\.(?:insert|select|update|delete|execute)\s*\(/.test(input.line)) found.push(`${input.file}:${input.lineNo}: 直接 SQL`);
  if (input.line.includes('throw ') && !allowedThrow.test(input.line)) found.push(`${input.file}:${input.lineNo}: 业务错误`);
  return found;
}

function sourceFiles(): string[] {
  const base = path.join(root, compositionDir);
  return readdirSync(base)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.posix.join(compositionDir, name))
    .sort();
}

function read(relative: string): string {
  return readFileSync(path.join(root, relative), 'utf8');
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
