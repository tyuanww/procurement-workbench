import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

await walk('packages');
await walk('apps');
await rewriteCompiled('packages');
await rewriteCompiled('apps');

async function walk(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    if (entry.name === 'package.json') await rewrite(next);
    else if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') await walk(next);
  }
}

async function rewrite(file: string): Promise<void> {
  const pkg: { exports?: unknown } = JSON.parse(await readFile(file, 'utf8'));
  if (pkg.exports === undefined) return;
  pkg.exports = mapExports(pkg.exports);
  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

async function rewriteCompiled(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') await rewriteCompiled(next);
    else if (entry.name.endsWith('.js') && next.includes(`${path.sep}dist${path.sep}`)) await rewriteJs(next);
  }
}

async function rewriteJs(file: string): Promise<void> {
  const text = await readFile(file, 'utf8');
  const replaced = text.replaceAll('/application/src/', '/application/dist/').replaceAll('/domain/src/', '/domain/dist/');
  if (replaced !== text) await writeFile(file, replaced);
}

function mapExports(value: unknown): unknown {
  if (typeof value === 'string') return value.replaceAll('./src/', './dist/').replace(/\.ts$/, '.js');
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapExports(item)]));
}
