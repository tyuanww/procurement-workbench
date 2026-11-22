import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { canSubmitImport, recommendedTemplate } from '../../apps/web/src/features/imports/index.js';
import { ImportBatchBanner } from '../../apps/web/src/pages/imports/import-batch-banner.js';
import { ImportDetectionDetails, ImportTypeChoices } from '../../apps/web/src/pages/imports/import-type-choice.js';
import type { DetectCandidate, ImportTypeChoice } from '../../apps/web/src/features/imports/index.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

const tied: readonly DetectCandidate[] = [
  { template: 'po-master-v1', score: 100, reasons: ['17 列表头齐全'] },
  { template: 'factory-progress-v1', score: 100, reasons: ['找到 在途订单汇总'] },
];

it('并列或未点选时不能提交第一名，点选后按所选模板决定代工厂', () => {
  expect(canSubmitImport({ choice: { kind: 'unselected' }, candidates: tied, factoryPartyId: null })).toBe(false);
  expect(canSubmitImport({ choice: { kind: 'selected', template: 'po-master-v1' }, candidates: tied, factoryPartyId: null })).toBe(true);
  expect(canSubmitImport({ choice: { kind: 'selected', template: 'factory-progress-v1' }, candidates: tied, factoryPartyId: null })).toBe(false);
  expect(canSubmitImport({ choice: { kind: 'selected', template: 'factory-progress-v1' }, candidates: tied, factoryPartyId: 'factory-1' })).toBe(true);
  const only = [{ template: 'bom-v1' as const, score: 100, reasons: ['BOM 表头齐全'] }];
  expect(canSubmitImport({ choice: { kind: 'unselected' }, candidates: only, factoryPartyId: null })).toBe(false);
  expect(canSubmitImport({ choice: { kind: 'selected', template: 'planner-sheet-v1' }, candidates: only, factoryPartyId: null })).toBe(false);
});

it('只在唯一模板完全命中时自动选中，低分和并列交给采购选择', () => {
  const match: DetectCandidate = { template: 'batch-confirmed-arrival-v1', score: 100, reasons: ['表头齐全'] };
  const nonMatch: DetectCandidate = { template: 'po-master-v1', score: 0, reasons: ['缺少订单表头'] };
  expect(recommendedTemplate([nonMatch, match])).toEqual({ kind: 'selected', template: match.template });
  expect(recommendedTemplate([{ ...match, score: 60 }, nonMatch])).toEqual({ kind: 'unselected' });
  expect(recommendedTemplate(tied)).toEqual({ kind: 'unselected' });
  expect(recommendedTemplate([])).toEqual({ kind: 'unselected' });
});

it('解析设置显示所选模板，候选的诊断说明默认收起', () => {
  const undecided = markup(ImportTypeChoices, { candidates: tied, choice: { kind: 'unselected' }, onChoose: () => undefined });
  expect(undecided).toContain('识别分数并列，请手动选择');
  const chosen: ImportTypeChoice = { kind: 'selected', template: 'factory-progress-v1' };
  const picked = markup(ImportTypeChoices, { candidates: tied, choice: chosen, onChoose: () => undefined });
  expect(picked).toContain('代工厂进度 · 100 分');
  expect(picked).not.toContain('17 列表头齐全');
  const diagnostics = markup(ImportDetectionDetails, { candidates: tied });
  expect(diagnostics).toContain('查看识别说明');
  expect(diagnostics).toContain('aria-expanded="false"');
  expect(diagnostics).not.toContain('17 列表头齐全');
});

it('批次页显示所选导入类型', () => {
  const html = markup(ImportBatchBanner, {
    template: 'factory-progress-v1',
    createdAt: '2026-10-12T00:00:00.000Z',
    committedAt: null,
    coverage: 'full_snapshot',
  });
  expect(html).toContain('代工厂进度');
  expect(html).toContain('完整快照');
  expect(html).not.toContain('采购订单总表');
});

function markup(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(type, props));
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
