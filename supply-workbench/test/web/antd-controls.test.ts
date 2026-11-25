import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { drawerWide, drawerWidth } from '../../apps/web/src/theme/tokens.js';
import { ActionForm, formErrors } from '../../apps/web/src/pages/today/TodayForms.js';

const WEB_ROOT = fileURLToPath(new URL('../../apps/web', import.meta.url));
const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

describe('页面只用 antd 控件', () => {
  it('apps/web/src 里没有原生 h1/h2/table/select/button/form/input/details/dialog', async () => {
    const files = await collectTsx(path.join(WEB_ROOT, 'src'));
    const native = /<(h1|h2|table|select|button|form|input|details|dialog)(\s|>)/;
    const offenders = files.filter((file) => native.test(file.text)).map((file) => file.path.replace(WEB_ROOT, 'apps/web'));
    expect(offenders).toEqual([]);
  });

  it('抽屉宽度只用 480 和 720，宽度来自 token 不是字面量', async () => {
    expect(drawerWidth).toBe(480);
    expect(drawerWide).toBe(720);
    const files = (await collectTsx(path.join(WEB_ROOT, 'src'))).filter((file) => file.text.includes('<Drawer'));
    expect(files.length).toBeGreaterThan(0);
    const tags = files.flatMap((file) => [...file.text.matchAll(/<Drawer[\s\S]*?>/g)].map((match) => match[0]));
    expect(tags.filter((tag) => /size=\{\d+\}/.test(tag))).toEqual([]);
  });

  it('内容页签由共享组件生成，不手写 tab 或 tablist', async () => {
    const files = await collectTsx(path.join(WEB_ROOT, 'src'));
    const handmade = /\srole\s*=\s*(?:\{\s*)?["'](?:tab|tablist|tabpanel)["']/;
    expect(files.filter((file) => handmade.test(file.text)).map((file) => file.path)).toEqual([]);
  });

  it('今日非记录表单也把确认按钮放在抽屉 footer 里', async () => {
    const drawer = await readFile(path.join(WEB_ROOT, 'src/pages/today/TodayDrawer.tsx'), 'utf8');
    const forms = await readFile(path.join(WEB_ROOT, 'src/pages/today/TodayForms.tsx'), 'utf8');
    expect(drawer).toContain('footer={props.draft === null || !canRecord ? null : <RecordFooter');
    expect(forms).not.toContain('>确认</Button>');
    expect(forms).not.toContain('htmlType="submit"');
  });
});

describe('表单失败时已填内容还在', () => {
  it('改确认日时缺原因报错，但已填的日期仍渲染在输入框里', () => {
    const draft = { kind: 'date' as const, date: '2026-11-10', reason: '' };
    expect(formErrors({ draft, hadDate: true, today: '2026-11-03' })).toEqual(['改已有确认日必须写原因']);
    const html = render(ActionForm, { draft, hadDate: true, lane: 'finished', onChange: () => undefined, onSubmit: () => undefined });
    expect(html).toContain('value="2026-11-10"');
    expect(html).toContain('改已有确认日必须写原因');
    expect(html).toContain('ant-input');
    expect(html).toContain('value="2026-11-10"');
  });
});

function render(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(type, props));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

async function collectTsx(dir: string): Promise<{ readonly path: string; readonly text: string }[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: { readonly path: string; readonly text: string }[] = [];
  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsx(next)));
      continue;
    }
    if (!entry.name.endsWith('.tsx')) continue;
    files.push({ path: next, text: await readFile(next, 'utf8') });
  }
  return files;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
