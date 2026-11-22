import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST = 'apps/web/src/app/page-manifest.tsx';
const PAGE_DIR = (id: string) => `apps/web/src/pages/${id}`;

const args = process.argv.slice(2);
const id = args[0];
const isDryRun = args.includes('--dry-run');
const isRemove = args.includes('--remove');

if (isDryRun && isRemove) fail('--dry-run 与 --remove 不能同时使用');

if (id === undefined) fail('用法：pnpm new:feature <id> [--dry-run | --remove]');
if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(`页面 id 必须是 kebab-case：${id}`);

const component = componentOf(id);
const pagePath = `/${id}`;
const file = `${PAGE_DIR(id)}/${component}.tsx`;
const manifest = read(MANIFEST);

if (isRemove) {
  removeFeature(id);
  console.log(`REMOVED ${PAGE_DIR(id)}`);
  process.exit(0);
}
if (manifest.includes(`path: '${pagePath}'`) || existsSync(path.join(ROOT, PAGE_DIR(id)))) fail(`页面 ${id} 已经存在`);

const source = `import { Typography } from 'antd';

export function ${component}() {
  return (
    <section aria-label="生成的页面 ${id}">
      <Typography.Title level={2}>生成的页面 ${id}</Typography.Title>
    </section>
  );
}
`;

if (isDryRun) {
  console.log(`WOULD WRITE ${file}`);
  console.log(`WOULD WRITE ${MANIFEST}`);
  process.exit(0);
}

mkdirSync(path.join(ROOT, PAGE_DIR(id)), { recursive: true });
writeFileSync(path.join(ROOT, file), source);
writeFileSync(path.join(ROOT, MANIFEST), withManifest({ text: manifest, id, component, pagePath }));
console.log(`WROTE ${file}`);
console.log(`WROTE ${MANIFEST}`);

function removeFeature(featureId: string): void {
  const target = path.join(ROOT, PAGE_DIR(featureId));
  if (!existsSync(target)) fail(`页面 ${featureId} 不存在`);
  const name = componentOf(featureId);
  const url = `/${featureId}`;
  rmSync(target, { recursive: true, force: true });
  const text = read(MANIFEST)
    .replace(`\nimport { ${name} } from '../pages/${featureId}/${name}.js';`, '')
    .replace(`\n  { path: '${url}', nav: null, element: <${name} /> },`, '');
  writeFileSync(path.join(ROOT, MANIFEST), text);
}

function withManifest(input: { readonly text: string; readonly id: string; readonly component: string; readonly pagePath: string }): string {
  const anchor = "import { TodayPage } from '../pages/today/TodayPage.js';";
  if (!input.text.includes(anchor)) fail('找不到页面 import 锚点');
  const withImport = input.text.replace(anchor, `${anchor}\nimport { ${input.component} } from '../pages/${input.id}/${input.component}.js';`);
  const start = withImport.indexOf('export const PAGE_MANIFEST: readonly PageManifestEntry[] = [');
  if (start < 0) fail('找不到 PAGE_MANIFEST');
  const end = withImport.indexOf('\n];', start);
  if (end < 0) fail('找不到 PAGE_MANIFEST 数组结尾');
  return `${withImport.slice(0, end)}\n  { path: '${input.pagePath}', nav: null, element: <${input.component} /> },${withImport.slice(end)}`;
}

function componentOf(featureId: string): string {
  const pascal = featureId.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  return pascal.endsWith('Page') ? pascal : `${pascal}Page`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}
