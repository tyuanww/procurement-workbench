import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { directorBrands } from '@sw/persistence';
import { ImportBatchSummarySchema } from '@sw/contracts';
import { must, openProcurementImport, procurementImportClient } from './helpers/procurement-import.js';

const original = readFileSync(new URL('../../../fixtures/synthetic/po-master-procurement.xlsx', import.meta.url));
const XLSX = createRequire(new URL('../../../packages/importers/package.json', import.meta.url))('xlsx');
const master = '采购订单总表';
const project = '达肤妍项目进度表';
const updatedDate = '2026-11-18';
type Api = Awaited<ReturnType<typeof procurementImportClient>>;

withProcurementImport('新增品牌工作表使首页能筛到对应的成品与关联物料', async ({ api, handle }) => {
  const book = XLSX.read(original);
  const newSheet = '合成第三品牌项目进度表';
  book.Sheets[newSheet] = book.Sheets[project];
  delete book.Sheets[project];
  book.SheetNames = book.SheetNames.map((name: string) => name === project ? newSheet : name);
  const batch = await api.upload('third-brand.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  expect((await api.commit(batch)).statusCode).toBe(200);
  const finished = must((await api.preview(batch)).submission?.finished.find((row) => row.rowNo === 2)?.orderLineId);
  const component = must((await api.detail(finished, 'all')).line.storeProgress?.materials[0]?.id);
  const members = await directorBrands(handle.db);
  expect(members).toEqual(expect.arrayContaining([finished, component].map((lineId) => ({ lineId, brand: '合成第三品牌' }))));
});

withProcurementImport('重传决定不能进入当前成品和总排期来源', async ({ api, handle }) => {
  const { first, lineId } = await commitFirst(api);
  const second = await api.upload('b.xlsx', version({ quantity: 200, date: updatedDate }));
  expect((await api.commit(second)).statusCode).toBe(200);
  const replay = await api.upload('a-copy.xlsx', version({ quantity: 100 }));
  const revision = await chooseFinishedRow({ api, batch: replay, lineId });
  const reused = await api.commit(replay, { revision });
  expect(reused.statusCode, reused.body).toBe(200);
  expect(ImportBatchSummarySchema.parse(reused.json())).toMatchObject({ status: 'discarded', procurementReplayOf: first.id });
  expect((await api.preview(replay)).submission?.originalBatchId).toBe(first.id);
  await verifySource({ api, lineId, batchId: second.id });

  // 兼容旧版本曾标为普通 committed 的重传批次。
  await handle.exec(`update import_batches set status = 'committed', committed_at = '2026-12-01T00:00:00Z' where id = '${replay.id}'`);
  await verifySource({ api, lineId, batchId: second.id });
  const restored = await api.upload('restored.xlsx', version({ quantity: 100, memo: '再次更新成品' }));
  expect((await finishedRow(api, restored.id)).action).toBe('update');
  expect((await api.commit(restored)).statusCode).toBe(200);
  expect((await api.detail(lineId)).line.qtyOrdered).toBe(100);
});

withProcurementImport('过期的无变化预览不能覆盖成品来源和日期', async ({ api }) => {
  const { lineId } = await commitFirst(api);
  const staleBytes = version({ quantity: 100, memo: '另一份成品无变化的工作簿' });
  const newer = await api.upload('newer.xlsx', version({ quantity: 200, date: updatedDate }));
  const stale = await api.upload('stale.xlsx', staleBytes);
  expect((await finishedRow(api, stale.id)).action).toBe('unchanged');
  expect((await api.commit(newer)).statusCode).toBe(200);
  const result = await api.commit(stale);
  expect(result.statusCode, result.body).toBe(409);
  expect(result.json()).toMatchObject({ error: { code: 'STATE_CONFLICT', details: { state: 'po_master_preview' } } });
  expect((await api.preview(stale)).submission).toBeUndefined();
  await verifySource({ api, lineId, batchId: newer.id });

  const compared = await api.upload('stale-compared.xlsx', staleBytes);
  expect((await finishedRow(api, compared.id)).action).toBe('update');
  expect((await api.commit(compared)).statusCode).toBe(200);
  expect((await api.detail(lineId)).line.qtyOrdered).toBe(100);
});

withProcurementImport('单独的成品日期变化也会让旧的无变化预览失效', async ({ api }) => {
  const { lineId } = await commitFirst(api);
  const newer = await api.upload('newer.xlsx', version({ quantity: 100, date: updatedDate }));
  const stale = await api.upload('stale.xlsx', version({ quantity: 100, memo: '待重新核对的日期' }));
  expect((await finishedRow(api, stale.id)).action).toBe('unchanged');
  expect((await api.commit(newer)).statusCode).toBe(200);
  const result = await api.commit(stale);
  expect(result.statusCode, result.body).toBe(409);
  expect((await api.detail(lineId)).procurementSchedule?.submittedOn).toBe(updatedDate);
});

withProcurementImport('成品数量四位小数存储和合法手工单位调整不让新预览过期', async ({ api }) => {
  const first = await api.upload('precision.xlsx', version({ quantity: 100.123456 }));
  expect((await api.commit(first)).statusCode).toBe(200);
  const lineId = must((await api.preview(first)).submission?.finished.find((row) => row.rowNo === 2)?.orderLineId);
  expect((await api.detail(lineId)).line.qtyOrdered).toBe(100.1235);
  const path = `/api/v1/lines/${encodeURIComponent(lineId)}`;
  const imported = await api.app.inject({ method: 'PATCH', url: path, headers: { cookie: api.cookie }, payload: { qtyOrdered: 200 } });
  expect(imported.statusCode, imported.body).toBe(409);
  expect(imported.json()).toMatchObject({ error: { code: 'FIELD_OWNED_BY_IMPORT' } });
  const manual = await api.app.inject({ method: 'PATCH', url: path, headers: { cookie: api.cookie }, payload: { unit: '件' } });
  expect(manual.statusCode, manual.body).toBe(200);
  const revision = await api.upload('precision-revision.xlsx', version({ quantity: 100.123456, memo: '成品来源未变' }));
  expect((await finishedRow(api, revision.id)).action).toBe('unchanged');
  const result = await api.commit(revision);
  expect(result.statusCode, result.body).toBe(200);
  expect((await api.detail(lineId)).line).toMatchObject({ qtyOrdered: 100.1235, unit: '件' });
});

withProcurementImport('更新预览的成品来源被其他批次改动后须重新比对', async ({ api }) => {
  const { lineId } = await commitFirst(api);
  const updated = version({ quantity: 200, memo: '先预览下单量变化' });
  const pending = await api.upload('pending-update.xlsx', updated);
  expect((await finishedRow(api, pending.id)).action).toBe('update');
  const newDates = await api.upload('newer-dates.xlsx', version({ quantity: 100, date: updatedDate }));
  expect((await api.commit(newDates)).statusCode).toBe(200);
  const stale = await api.commit(pending);
  expect(stale.statusCode, stale.body).toBe(409);
  expect((await api.detail(lineId)).procurementSchedule?.submittedOn).toBe(updatedDate);

  const previewedAgain = await api.upload('reviewed-update.xlsx', updated);
  expect((await finishedRow(api, previewedAgain.id)).action).toBe('update');
  expect((await api.commit(previewedAgain)).statusCode).toBe(200);
  expect((await api.detail(lineId)).line.qtyOrdered).toBe(200);
});

withProcurementImport('没有比较基准的旧版更新保留当前已应用来源', async ({ api, handle }) => {
  const first = await api.upload('legacy-first.xlsx', version({ quantity: 100 }));
  await removeComparison(handle, first.id);
  expect((await finishedRow(api, first.id)).action).toBe('create');
  expect((await api.commit(first)).statusCode).toBe(200);
  const lineId = must((await api.preview(first)).submission?.finished.find((row) => row.rowNo === 2)?.orderLineId);

  const pending = await api.upload('legacy-update.xlsx', version({ quantity: 150 }));
  expect((await finishedRow(api, pending.id)).action).toBe('update');
  await removeComparison(handle, pending.id);
  const newer = await api.upload('newer.xlsx', version({ quantity: 200, date: updatedDate }));
  expect((await api.commit(newer)).statusCode).toBe(200);
  const stale = await api.commit(pending);
  expect(stale.statusCode, stale.body).toBe(409);
  expect(stale.json()).toMatchObject({ error: { code: 'STATE_CONFLICT', details: { state: 'po_master_preview' } } });
  await verifySource({ api, lineId, batchId: newer.id });
  const revision = await chooseFinishedRow({ api, batch: pending, lineId });
  const manual = await api.commit(pending, { revision, key: `manual-${pending.id}` });
  expect(manual.statusCode, manual.body).toBe(200);
  expect((await api.detail(lineId)).line.qtyOrdered).toBe(150);
});

withProcurementImport('旧版新建如果遇到同一已有成品，只能提交相同的成品来源', async ({ api, handle }) => {
  const pending = await api.upload('legacy-new.xlsx', version({ quantity: 150 }));
  const matching = await api.upload('legacy-matching.xlsx', version({ quantity: 200, date: updatedDate, memo: '不同文件，相同成品' }));
  for (const old of [pending, matching]) {
    expect((await finishedRow(api, old.id)).action).toBe('create');
    await removeComparison(handle, old.id);
  }
  const newer = await api.upload('newer.xlsx', version({ quantity: 200, date: updatedDate }));
  expect((await api.commit(newer)).statusCode).toBe(200);
  const lineId = must((await api.preview(newer)).submission?.finished.find((row) => row.rowNo === 2)?.orderLineId);
  const stale = await api.commit(pending);
  expect(stale.statusCode, stale.body).toBe(409);
  await verifySource({ api, lineId, batchId: newer.id });
  const same = await api.commit(matching);
  expect(same.statusCode, same.body).toBe(200);
  expect((await api.preview(matching)).submission?.finished.find((row) => row.rowNo === 2)?.orderLineId).toBe(lineId);
  expect((await api.detail(lineId)).line.qtyOrdered).toBe(200);
});

async function removeComparison(handle: Awaited<ReturnType<typeof openProcurementImport>>['handle'], batchId: string) {
  await handle.exec(`update import_batches set file_meta = file_meta - 'procurementComparison' where id = '${batchId}'`);
}

function withProcurementImport(name: string, run: (input: { readonly api: Api; readonly handle: Awaited<ReturnType<typeof openProcurementImport>>['handle'] }) => Promise<void>) {
  it(name, async () => {
    const { app, handle, close } = await openProcurementImport({ isLocal: true });
    try {
      await run({ api: await procurementImportClient(app, handle), handle });
    } finally {
      await close();
    }
  });
}

async function commitFirst(api: Api) {
  const first = await api.upload('a.xlsx', version({ quantity: 100 }));
  expect((await api.commit(first)).statusCode).toBe(200);
  const lineId = must((await api.preview(first)).submission?.finished.find((row) => row.rowNo === 2)?.orderLineId);
  return { first, lineId };
}

async function chooseFinishedRow({ api, batch, lineId }: { readonly api: Api; readonly batch: { readonly id: string; readonly revision: number }; readonly lineId: string }) {
  const row = await finishedRow(api, batch.id);
  const decision = await api.app.inject({
    method: 'PUT', url: `/api/v1/imports/${batch.id}/decisions`,
    headers: { cookie: api.cookie, 'idempotency-key': `choose-row-${batch.id}` },
    payload: { expectedRevision: batch.revision, issueDecisions: {}, rowSkips: [], conflictResolutions: [{ rowId: row.id, targetOrderLineId: lineId }] },
  });
  expect(decision.statusCode, decision.body).toBe(200);
  return ImportBatchSummarySchema.parse(decision.json()).revision;
}

async function finishedRow(api: Api, batchId: string) {
  const response = await api.app.inject({ url: `/api/v1/imports/${batchId}/rows`, headers: { cookie: api.cookie } });
  expect(response.statusCode, response.body).toBe(200);
  return must(response.json<{ readonly items: readonly { readonly id: string; readonly rowNo: number; readonly action: string }[] }>().items.find((row) => row.rowNo === 2));
}

async function verifySource({ api, lineId, batchId }: { readonly api: Api; readonly lineId: string; readonly batchId: string }) {
  const current = await api.detail(lineId, 'all');
  expect(current.line.qtyOrdered).toBe(200);
  expect(current.line.storeProgress?.sources).toEqual([expect.objectContaining({ importBatchId: batchId })]);
  expect(current.procurementSchedule?.submittedOn).toBe(updatedDate);
  expect(current.procurementSchedule?.observations.filter((entry) => entry.field === 'submittedOn').at(-1)).toMatchObject({ importBatchId: batchId, value: updatedDate });
}

function version({ quantity, date, memo }: { readonly quantity: number; readonly date?: string; readonly memo?: string }): Buffer {
  const book = XLSX.read(original);
  book.Sheets[master].E2 = { t: 'n', v: quantity };
  if (date !== undefined) book.Sheets[master].F2 = { t: 's', v: date };
  if (memo !== undefined) book.Sheets[project].R5 = { t: 's', v: memo };
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}
