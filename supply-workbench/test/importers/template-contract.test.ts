import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import type { TemplateId } from '../../packages/domain/src/index.js';
import { TEMPLATE_IDS } from '../../packages/domain/src/index.js';
import type { ParsedImport } from '../../packages/application/src/ports/parsed-rows.js';
import { continuationOf, type ImportContinuationInput } from '../../apps/web/src/features/imports/model/flow.js';

const root = path.resolve(import.meta.dirname, '../..');
const FLOW = 'apps/web/src/features/imports/model/flow.ts';
const TESTKIT = 'packages/testkit/src/contracts/import-template.ts';
const PARSED_ROWS = 'packages/application/src/ports/parsed-rows.ts';

it('flow 不再穷尽列出全部模板', () => {
  expect(mentioned(FLOW)).toEqual(['po-master-v1', 'factory-progress-v1', 'product-archive-v1']);
  expect(read(FLOW).includes('switch (input.template)')).toBe(false);
  expect(read(PARSED_ROWS)).toContain('Exclude<TemplateId');
  expect(read(TESTKIT)).toContain('rowIdentities(parsed)');
});

it('已有模板的提交去向保持不变', () => {
  expect(labels(committed({ template: 'po-master-v1', pendingAliases: 0 }))).toEqual(['查看本次导入订单']);
  expect(continuationOf(committed({ template: 'factory-progress-v1', pendingAliases: 0 }))).toMatchObject({
    steps: [{ to: '/lines', label: '去跟进中心' }],
  });
  expect(labels(committed({ template: 'product-archive-v1', pendingAliases: 2 }))).toEqual(['去审核 2 个新主体', '去产品档案']);
  expect(labels(committed({ template: 'bom-v1', pendingAliases: 0 }))).toEqual([]);
  expect(labels(committed({ template: 'owner-map-v1', pendingAliases: 1 }))).toEqual(['去审核 1 个新主体']);
});

type ParsedCoversTemplateIds = Exclude<TemplateId, ParsedImport['template']> extends never ? true : false;
type FlowAcceptsTemplateIds = TemplateId extends ImportContinuationInput['template'] ? true : false;

const isParsedImportCoveringTemplateIds: ParsedCoversTemplateIds = true;
const isFlowAcceptingTemplateIds: FlowAcceptsTemplateIds = true;

it('解析结果和提交去向覆盖领域里的每一个模板 id', () => {
  expect(isParsedImportCoveringTemplateIds).toBe(true);
  expect(isFlowAcceptingTemplateIds).toBe(true);
});

function committed(input: { readonly template: TemplateId; readonly pendingAliases: number }): ImportContinuationInput {
  return { ...input, importBatchId: 'batch-a', status: 'committed', canReviewAliases: true, unresolvedConflicts: 0, error: null };
}

function labels(input: ImportContinuationInput): readonly string[] {
  const continuation = continuationOf(input);
  if (continuation.kind !== 'committed') throw new Error('不是已提交');
  return continuation.steps.map((step) => step.label);
}

function mentioned(relative: string): readonly TemplateId[] {
  const text = read(relative);
  return TEMPLATE_IDS.filter((id) => text.includes(`'${id}'`));
}

function read(relative: string): string {
  return readFileSync(path.join(root, relative), 'utf8');
}
