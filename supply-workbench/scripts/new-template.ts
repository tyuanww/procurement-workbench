import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const IMPORTS = 'packages/domain/src/vocabulary/imports.ts';
const REGISTRY = 'packages/importers/src/registry.ts';
const TEMPLATE_DIR = (id: string) => `packages/importers/src/templates/${id}`;

const args = process.argv.slice(2);
const id = args[0];
const isDryRun = args.includes('--dry-run');
const isRemove = args.includes('--remove');

if (isDryRun && isRemove) fail('--dry-run 与 --remove 不能同时使用');

if (id === undefined) fail('用法：pnpm new:template <id> [--dry-run | --remove]');
if (!/^[a-z][a-z0-9-]*-v\d+$/.test(id)) fail(`模板 id 必须是 kebab-case 加 -vN：${id}`);

if (isRemove) {
  removeTemplate(id);
  console.log(`REMOVED ${TEMPLATE_DIR(id)}`);
  process.exit(0);
}

const importsText = read(IMPORTS);
const registryText = read(REGISTRY);
if (importsText.includes(`'${id}'`) || existsSync(path.join(ROOT, TEMPLATE_DIR(id)))) fail(`模板 ${id} 已经存在`);

const variable = variableOf(id);
const label = `生成的模板 ${id}`;
const templateFile = `${TEMPLATE_DIR(id)}/index.ts`;
const nextImports = withDomainEntry({ text: importsText, id, label });
const nextRegistry = withRegistryEntry({ text: registryText, id, variable });
const templateSource = templateOf({ id, variable });

const writes: readonly { readonly file: string; readonly content: string }[] = [
  { file: IMPORTS, content: nextImports },
  { file: REGISTRY, content: nextRegistry },
  { file: templateFile, content: templateSource },
];

if (isDryRun) {
  for (const write of writes) console.log(`WOULD WRITE ${write.file}`);
  process.exit(0);
}
for (const write of writes) {
  mkdirSync(path.dirname(path.join(ROOT, write.file)), { recursive: true });
  writeFileSync(path.join(ROOT, write.file), write.content);
  console.log(`WROTE ${write.file}`);
}

function removeTemplate(templateId: string): void {
  const target = path.join(ROOT, TEMPLATE_DIR(templateId));
  if (!existsSync(target)) fail(`模板 ${templateId} 不存在`);
  rmSync(target, { recursive: true, force: true });
  const imports = read(IMPORTS);
  const registry = read(REGISTRY);
  const nextImports = imports
    .replace(`, '${templateId}'`, '')
    .replace(new RegExp(`\\n {4}'${templateId}': '[^']*',`), '');
  const nextRegistry = registry
    .replace(new RegExp(`\\nimport \\{ manifest as ${variableOf(templateId)} \\} from './templates/${templateId}/index\\.js';`), '')
    .replace(`\n  '${templateId}': ${variableOf(templateId)},`, '');
  writeFileSync(path.join(ROOT, IMPORTS), nextImports);
  writeFileSync(path.join(ROOT, REGISTRY), nextRegistry);
}

function withDomainEntry(input: { readonly text: string; readonly id: string; readonly label: string }): string {
  const array = /\[([^\]]*)\] as const,/.exec(input.text);
  if (array === null || array[1] === undefined) fail('找不到 TEMPLATE_IDS 数组');
  const labels = /(\n {2}\{\n)([\s\S]*?)(\n {2}\},\n\);)/.exec(input.text);
  if (labels === null || labels[1] === undefined || labels[2] === undefined || labels[3] === undefined) fail('找不到 TEMPLATE_ID_LABELS');
  return input.text
    .replace(array[0], `[${array[1]}, '${input.id}'] as const,`)
    .replace(`${labels[1]}${labels[2]}${labels[3]}`, `${labels[1]}${labels[2]}\n    '${input.id}': '${input.label}',${labels[3]}`);
}

function withRegistryEntry(input: { readonly text: string; readonly id: string; readonly variable: string }): string {
  const importLine = `import { manifest as ${input.variable} } from './templates/${input.id}/index.js';`;
  const anchor = "import { manifest as productArchive } from './templates/product-archive-v1/index.js';";
  if (!input.text.includes(anchor)) fail('找不到 registry import 锚点');
  const withImport = input.text.replace(anchor, `${anchor}\n${importLine}`);
  const anchorEnd = '} satisfies Record<TemplateId, TemplateManifest>;';
  if (!withImport.includes(anchorEnd)) fail('找不到 byId 映射');
  return withImport.replace(anchorEnd, `  '${input.id}': ${input.variable},\n${anchorEnd}`);
}

function templateOf(input: { readonly id: string; readonly variable: string }): string {
  return `import type { CommitContext, CommitResult } from '../../../../application/src/imports/commit/context.js';
import type { ImportTemplate } from '../../../../application/src/ports/import-template.js';
import { plainIdentity } from '../plain.js';
import { knownManifest } from '../manifest.js';

const ID = '${input.id}' as const;

type GeneratedParsed = {
  readonly template: typeof ID;
  readonly rows: readonly [];
};

function detect(): { readonly score: number; readonly reasons: readonly string[] } {
  return { score: 0, reasons: ['生成的模板不识别任何文件'] };
}

function parse(): GeneratedParsed {
  return { template: ID, rows: [] };
}

function diff(parsed: GeneratedParsed): GeneratedParsed {
  return parsed;
}

async function commit(ctx: CommitContext): Promise<CommitResult> {
  void ctx;
  return { affectedLineIds: [], presentLineIds: [] };
}

export const template: ImportTemplate<GeneratedParsed> = {
  ...plainIdentity,
  id: ID,
  detect,
  parse,
  diff,
};

export const manifest = knownManifest({ template, columns: ['生成的列'], commit });
`;
}

function variableOf(templateId: string): string {
  return templateId.replace(/-v\d+$/, '').split('-').map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join('') + 'V' + (templateId.match(/-v(\d+)$/)?.[1] ?? '1');
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}
