import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { ArrivalTag } from '../../apps/web/src/pages/progress/ProgressPage.js';
import type { ProgressArrival } from '../../apps/web/src/features/progress/model/rows.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

it('状态列里，没日期和有日期看起来不一样，逾期仍写逾期未到', () => {
  const overdue = markup({ kind: 'overdue', dateText: '2026-10-01' });
  const missing = markup({ kind: 'missing', dateText: '—' });
  const dated = markup({ kind: 'dated', dateText: '2026-12-01' });
  expect(overdue).toContain('逾期未到');
  expect(missing).toContain('未填写');
  expect(dated).toContain('已确认');
  expect(missing).not.toBe(dated);
  expect(dated.includes('逾期未到')).toBe(false);
  expect(missing.includes('已确认')).toBe(false);
});

function markup(arrival: ProgressArrival): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(ArrivalTag, { arrival }));
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
