import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { FeishuPublish, publishWeekly } from '../../apps/web/src/pages/reports/ReportPages.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

it('没配置时按钮不可用，也不会发出写入请求', async () => {
  const html = markup(FeishuPublish, { configured: false, isPending: false, onPublish: () => undefined });
  expect(html).toContain('没配置飞书应用');
  expect(html).toContain('disabled=""');
  const previous = globalThis.fetch;
  let isCalled = false;
  globalThis.fetch = async () => {
    isCalled = true;
    throw new Error('不该写入');
  };
  try {
    expect(await publishWeekly({ id: 'report-1', configured: false })).toBeNull();
    expect(isCalled).toBe(false);
  } finally {
    globalThis.fetch = previous;
  }
});

it('配置了就写入，并显示文档链接', async () => {
  const html = markup(FeishuPublish, { configured: true, isPending: false, onPublish: () => undefined });
  expect(html).not.toContain('没配置飞书应用');
  expect(html).not.toContain('disabled=""');
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ docUrl: 'https://open.feishu.cn/docx/doc-1' });
  try {
    expect(await publishWeekly({ id: 'report-1', configured: true })).toBe('https://open.feishu.cn/docx/doc-1');
  } finally {
    globalThis.fetch = previous;
  }
});

function markup(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const node = react.createElement(ActorRoles, { roles: ['manager'], children: react.createElement(type, props) });
  const html = server.renderToStaticMarkup(node);
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
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
