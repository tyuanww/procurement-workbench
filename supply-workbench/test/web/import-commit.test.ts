import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import type { ImportContinuationInput } from '../../apps/web/src/features/imports/index.js';
import { commitFailureText, ImportCommitPanel, type CommitRequest } from '../../apps/web/src/pages/imports/ImportBatchPage.js';
import { ApiError } from '../../apps/web/src/shared/api/client.js';
import { FactorySelect } from '../../apps/web/src/pages/imports/ImportCenter.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const CONFLICT = '还有未处理的冲突行。先处理冲突行，再确认导入。';

const parsed: ImportContinuationInput = {
  template: 'po-master-v1',
  status: 'parsed',
  pendingAliases: 26,
  createdLines: 606,
  unresolvedConflicts: 0,
  error: null,
};

it('同候选键被占用时，提交失败提示重新比对', () => {
  const message = commitFailureText(new ApiError('STATE_CONFLICT', { state: 'candidate_key' }));
  expect(message).toBe('候选键已被另一批提交占用。请重新比对后再提交。');
  expect(commitFailureText(new ApiError('STATE_CONFLICT', { state: 'revision' }))).not.toContain('重新比对');
  const html = markup(ImportCommitPanel, { summary: parsed, request: { kind: 'failed', message: message ?? '' }, onCommit: () => undefined });
  expect(html).toContain('请重新比对后再提交');
});

it('成品预览过期时提示重新上传并核对', () => {
  expect(commitFailureText(new ApiError('STATE_CONFLICT', { state: 'po_master_preview' })))
    .toBe('成品来源已被另一批更新。请重新上传文件并核对后再提交。');
});

it('已提交的汇总直接画出下一步，请求仍是空闲', () => {
  const html = markup(ImportCommitPanel, {
    summary: { ...parsed, status: 'committed' },
    request: idle(),
    onCommit: () => undefined,
  });
  expect(html).toContain('去审核 26 个新主体');
  expect(html).toContain('href="/master"');
  expect(html).toContain('去跟进台看 606 行');
  expect(html).toContain('按总表首批生成待确认批次');
  expect(html).toContain('href="/lines"');
  expect(html).not.toContain('可以确认导入');
  expect(html).not.toContain('确认导入');
});

it('确认返回已提交后，门槛句换成下一步', () => {
  const before = markup(ImportCommitPanel, { summary: parsed, request: idle(), onCommit: () => undefined });
  expect(before).toContain('可以确认导入');
  expect(before).toContain('确认导入');
  expect(before).not.toContain('ant-btn-loading');
  expect(before).not.toContain('去跟进台看 606 行');
  const after = markup(ImportCommitPanel, {
    summary: { ...parsed, status: 'committed' },
    request: idle(),
    onCommit: () => undefined,
  });
  expect(after).toContain('去跟进台看 606 行');
  expect(after).not.toContain('可以确认导入');
});

it('确认进行中按钮在转，接口错误只留下说明', () => {
  const pending = markup(ImportCommitPanel, { summary: parsed, request: { kind: 'pending' }, onCommit: () => undefined });
  expect(pending).toContain('ant-btn-loading');
  expect(pending).toContain('disabled=""');
  expect(pending).toContain('确认导入');
  expect(pending).not.toContain('去跟进台看 606 行');
  const blocked = markup(ImportCommitPanel, {
    summary: { ...parsed, status: 'failed', error: null },
    request: idle(),
    onCommit: () => undefined,
  });
  expect(blocked).toContain('解析失败');
  expect(blocked).not.toContain('去跟进台看 606 行');
  expect(blocked).not.toContain('确认导入');
  const failed = markup(ImportCommitPanel, {
    summary: parsed,
    request: { kind: 'failed', message: CONFLICT },
    onCommit: () => undefined,
  });
  expect(failed).toContain(CONFLICT);
  expect(failed).not.toContain('去跟进台看 606 行');
  expect(failed).toContain('可以确认导入');
});

it('代工厂这一页没列全时给出提示，读失败时不给已选工厂', () => {
  const partial = markup(FactorySelect, {
    factoryPartyId: 'factory-1',
    factories: { kind: 'ready', items: [{ id: 'factory-1', displayName: '宜侬' }], total: 2 },
    onFactory: () => undefined,
  });
  expect(partial).toContain('宜侬');
  expect(partial).toContain('还有代工厂没显示在这页');
  const failed = markup(FactorySelect, {
    factoryPartyId: '',
    factories: { kind: 'failed' },
    onFactory: () => undefined,
  });
  expect(failed).toContain('代工厂没有读出来。');
  expect(failed).toContain('选择代工厂');
  expect(failed).not.toContain('宜侬');
});

function idle(): CommitRequest {
  return { kind: 'idle' };
}

function markup(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  const router = requireWeb('react-router');
  if (!isCreator(react) || !isRenderer(server) || !isRouter(router)) throw new Error('web 渲染模块不齐');
  const page = react.createElement(router.MemoryRouter, { children: react.createElement(type, props) });
  const html = server.renderToStaticMarkup(page);
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRouter(value: unknown): value is { MemoryRouter: unknown } {
  return isRecord(value) && 'MemoryRouter' in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
