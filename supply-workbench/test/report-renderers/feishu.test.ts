import { AppError } from '../../packages/application/src/shared/errors.js';
import { describe, expect, it } from 'vitest';
import type { WeeklyReportData } from '../../packages/application/src/reporting/views.js';
import { feishuPublisher, weeklyBlocks } from '../../packages/report-renderers/src/feishu/index.js';
import { meeting } from './meeting-fixture.js';

const data = sample();

describe('飞书周报', () => {
  it('周报转成标题、段落和表格', () => {
    expect(weeklyBlocks(data)).toEqual([
      { blockType: 'heading', text: '周报' },
      { blockType: 'paragraph', text: '应到 1，逾期 0' },
      { blockType: 'table', text: 'b1 面膜' },
    ]);
  });

  it('保留冻结的采购依据、新品回复和决定完成证据', () => {
    const rendered = weeklyBlocks({ ...data, managementMeeting: [meeting] }).map((block) => block.text).join('\n');
    expect(rendered).toContain('工厂承诺补齐盖子');
    expect(rendered).toContain('周五到工厂');
    expect(rendered).toContain('点收完成回执');
  });

  it('模拟服务成功时返回文档链接', async () => {
    const published = await feishuPublisher({ appId: 'app', appSecret: 'secret', folderToken: 'folder', fetchImpl: okFetch, baseUrl: 'https://feishu.test' }).publish(data);
    expect(published.docUrl).toBe('https://feishu.test/docx/doc-1');
  });

  it('按飞书文档接口发送标题和文本块，并写完所有周会事项', async () => {
    const writes: unknown[] = [];
    const material = meeting.materials[0];
    if (material === undefined) throw new Error('周会样本缺物料');
    const submitted = { ...data, managementMeeting: [{ ...meeting, materials: Array.from({ length: 55 }, (_, index) => ({
      ...material, name: `合成物料 ${index}`,
    })) }] };
    await feishuPublisher({
      appId: 'app', appSecret: 'secret', folderToken: 'folder', baseUrl: 'https://feishu.test',
      fetchImpl: (url, request) => {
        if (url.includes('/children')) writes.push(JSON.parse(request.body));
        return okFetch(url);
      },
    }).publish(submitted);
    expect(writes.length).toBeGreaterThan(1);
    expect(writes[0]).toMatchObject({
      index: -1,
      children: expect.arrayContaining([
        { block_type: 3, heading1: { elements: [{ text_run: { content: '周报' } }] } },
        { block_type: 2, text: { elements: [{ text_run: { content: '应到 1，逾期 0' } }] } },
        { block_type: 2, text: { elements: [{ text_run: { content: 'b1 面膜' } }] } },
      ]),
    });
    expect(JSON.stringify(writes)).toContain('合成物料 54');
  });

  it('HTTP 成功但飞书拒绝写子块时不返回成功文档', async () => {
    const rejection = { code: 1770001, msg: 'invalid block' };
    const publish = feishuPublisher({
      appId: 'app', appSecret: 'secret', folderToken: 'folder', baseUrl: 'https://feishu.test',
      fetchImpl: (url) => url.includes('/children') ? json(true, rejection) : okFetch(url),
    });
    await expect(publish.publish(data)).rejects.toMatchObject({ cause: rejection });
  });

  it('令牌失败和写入失败都包成带 cause 的 AppError', async () => {
    await expect(feishuPublisher({ appId: 'app', appSecret: 'secret', folderToken: 'folder', fetchImpl: failFetch('token'), baseUrl: 'https://feishu.test' }).publish(data)).rejects.toBeInstanceOf(AppError);
    await expect(feishuPublisher({ appId: 'app', appSecret: 'secret', folderToken: 'folder', fetchImpl: failFetch('write'), baseUrl: 'https://feishu.test' }).publish(data)).rejects.toMatchObject({ cause: { step: 'write' } });
  });
});

function okFetch(url: string): Promise<{ readonly ok: boolean; readonly status: number; readonly json: () => Promise<unknown> }> {
  if (url.includes('tenant_access_token')) return json(true, { code: 0, tenant_access_token: 'token' });
  if (url.endsWith('/documents')) return json(true, { code: 0, data: { document: { document_id: 'doc-1' } } });
  return json(true, { code: 0 });
}

function failFetch(step: 'token' | 'write') {
  return (url: string) => {
    if (url.includes('tenant_access_token') && step === 'token') return json(false, { step: 'token' });
    if (url.includes('/children')) return json(false, { step: 'write' });
    return okFetch(url);
  };
}

function json(ok: boolean, body: unknown) {
  return Promise.resolve({ ok, status: ok ? 200 : 401, json: () => Promise.resolve(body) });
}

function sample(): WeeklyReportData {
  return {
    overview: { dueBatches: { value: 1, previous: null }, onTime: { value: { rate: null, n: 0 }, previous: null }, overdue: { value: 0, previous: null }, exceptionsOpened: 0, exceptionsClosed: 0, missingDateRate: null },
    risks: [{ batchId: 'b1', orderLineId: 'l1', overdueDays: 1, nameRaw: '面膜' }],
    stuck: [],
    suppliers: [],
    buyers: [],
    exceptions: { opened: 0, closed: 0 },
    dueNextWeek: [],
    notes: { sources: [], basedOnWorkbenchRecords: true },
  };
}
