import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const forbiddenStems = new Set(['utils', 'helpers', 'misc', 'common', 'manager', 'stuff']);
const todoOk = /TODO\((?:[A-Z]\d{2}|B-\d+)\)/;
const skipDirs = new Set(['node_modules', 'dist', 'fixtures', 'coverage']);
const ignoredJsDirs = new Set(['node_modules', 'dist', 'coverage']);
const jsExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs']);

export function bannedJavaScript(file: string): string | undefined {
  if (!jsExtensions.has(path.posix.extname(file))) return undefined;
  if (file.split('/').some((segment) => ignoredJsDirs.has(segment))) return undefined;
  if (file.startsWith('.agents/skills/')) return undefined;
  return `${file}: 禁止 JavaScript，请改成 TypeScript`;
}

function commentText(line: string): string | undefined {
  const slash = line.indexOf('//');
  if (slash >= 0) return line.slice(slash + 2);
  const block = line.indexOf('/*');
  if (block >= 0) return line.slice(block + 2);
  return undefined;
}

function hasBareTodo(file: string, line: string): boolean {
  const text = file.endsWith('.md') ? line : commentText(line);
  if (text === undefined || !text.includes('TODO')) return false;
  return !todoOk.test(text);
}

function walk(dir: string, problems: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const full = path.join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (entry === 'architecture' && path.basename(dir) === 'test') continue;
      walk(full, problems);
      continue;
    }
    collect(full, problems);
  }
}

function collect(file: string, problems: string[]): void {
  if (file.endsWith('.violation.ts')) return;
  const stem = path.basename(file, path.extname(file));
  if (forbiddenStems.has(stem)) problems.push(`${file}: 禁止的文件名 ${stem}`);
  if (!/\.(ts|tsx|js|mjs|cjs|md)$/.test(file)) return;
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (hasBareTodo(file, line)) {
      problems.push(`${file}:${index + 1}: TODO 必须写成 TODO(卡号) 或 TODO(B-编号)`);
    }
  }
}

function trackedFiles(): string[] {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const listed = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return listed.split('\0').filter((file) => file.length > 0);
}

function collectTrackedJavaScript(problems: string[]): void {
  for (const file of trackedFiles()) {
    const ban = bannedJavaScript(file);
    if (ban !== undefined) problems.push(ban);
  }
}

function main(): void {
  const problems: string[] = [];
  const roots = process.argv.slice(2);
  if (roots.length === 0) walk(process.cwd(), problems);
  else roots.forEach((item) => collect(path.resolve(item), problems));
  collectTrackedJavaScript(problems);
  if (problems.length === 0) return;
  problems.forEach((item) => console.error(item));
  process.exit(1);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) main();
