import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CAPABILITIES = 'packages/contracts/src/capabilities.ts';
const DIR = (id: string) => `packages/application/src/${id}`;

const args = process.argv.slice(2);
const id = args[0];
const isDryRun = args.includes('--dry-run');
const isRemove = args.includes('--remove');

if (isDryRun && isRemove) fail('--dry-run 与 --remove 不能同时使用');

if (id === undefined) fail('用法：pnpm new:capability <id> [--dry-run | --remove]');
if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(`能力 id 必须是 kebab-case：${id}`);

const capabilities = read(CAPABILITIES);
if (isRemove) {
  removeCapability(id);
  console.log(`REMOVED ${DIR(id)}`);
  process.exit(0);
}
if (capabilities.includes(`'${id}'`) || existsSync(path.join(ROOT, DIR(id)))) fail(`能力 ${id} 已经存在`);

const file = `${DIR(id)}/index.ts`;
const source = `export const capability = '${id}' as const;\n`;
const next = withManifestEntry({ text: capabilities, id });

if (isDryRun) {
  console.log(`WOULD WRITE ${file}`);
  console.log(`WOULD WRITE ${CAPABILITIES}`);
  process.exit(0);
}
mkdirSync(path.join(ROOT, DIR(id)), { recursive: true });
writeFileSync(path.join(ROOT, file), source);
writeFileSync(path.join(ROOT, CAPABILITIES), next);
console.log(`WROTE ${file}`);
console.log(`WROTE ${CAPABILITIES}`);

function removeCapability(capabilityId: string): void {
  const target = path.join(ROOT, DIR(capabilityId));
  if (!existsSync(target)) fail(`能力 ${capabilityId} 不存在`);
  rmSync(target, { recursive: true, force: true });
  const text = read(CAPABILITIES);
  const withoutId = text.replace(`  '${capabilityId}',\n`, '');
  const block = new RegExp(`\\n  \\{\\n    id: '${capabilityId}',[\\s\\S]*?\\n  \\},`);
  const withoutEntry = withoutId.replace(block, '');
  if (withoutEntry === withoutId) fail('找不到能力清单项');
  writeFileSync(path.join(ROOT, CAPABILITIES), withoutEntry);
}

function withManifestEntry(input: { readonly text: string; readonly id: string }): string {
  const idsStart = input.text.indexOf('export const CAPABILITY_IDS = [');
  if (idsStart < 0) fail('找不到 CAPABILITY_IDS');
  const idsEnd = input.text.indexOf('\n] as const;', idsStart);
  if (idsEnd < 0) fail('找不到 CAPABILITY_IDS 数组结尾');
  const withId = `${input.text.slice(0, idsEnd)}\n  '${input.id}',${input.text.slice(idsEnd)}`;
  const marker = 'export const CAPABILITY_MANIFEST: readonly CapabilityManifestEntry[] = [';
  const start = withId.indexOf(marker);
  if (start < 0) fail('找不到 CAPABILITY_MANIFEST');
  const end = withId.indexOf('\n];', start);
  if (end < 0) fail('找不到 CAPABILITY_MANIFEST 数组结尾');
  const entry = [
    '  {',
    `    id: '${input.id}',`,
    "    readPermissions: ['data.read'],",
    '    writePermissions: [],',
    '    routePrefixes: [],',
    '    webFeature: null,',
    '    navLabel: null,',
    '    dependsOn: [],',
    '  },',
  ].join('\n');
  return `${withId.slice(0, end)}\n${entry}${withId.slice(end)}`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}
