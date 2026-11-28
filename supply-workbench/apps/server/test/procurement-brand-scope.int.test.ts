import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { OrderLineRowSchema, listResponseSchema } from '@sw/contracts';
import { directorBrands } from '@sw/persistence';
import { expect, it } from 'vitest';
import { must, openProcurementImport, procurementImportClient } from './helpers/procurement-import.js';

const original = readFileSync(new URL('../../../fixtures/synthetic/po-master-procurement.xlsx', import.meta.url));
const requireImporter = createRequire(new URL('../../../packages/importers/package.json', import.meta.url));
const { unzipSync, zipSync } = requireImporter('fflate');

it('项目表后缀前有空格时，首页、店铺结果和订单详情使用同一个店铺归属', async () => {
  const opened = await openProcurementImport({ isLocal: true });
  try {
    const api = await procurementImportClient(opened.app, opened.handle);
    const rawSheet = '达肤妍 项目进度表';
    const files: Record<string, Uint8Array> = unzipSync(original);
    const workbookPath = 'xl/workbook.xml';
    const xml = Buffer.from(must(files[workbookPath])).toString();
    files[workbookPath] = Buffer.from(xml.replace(`name="达肤妍项目进度表"`, `name="${rawSheet}"`));
    const batch = await api.upload('原始表名有空格.xlsx', Buffer.from(zipSync(files)));
    const committed = await api.commit(batch);
    expect(committed.statusCode, committed.body).toBe(200);

    const preview = await api.preview(batch);
    const observation = must(preview.submission?.observations.find((row) => row.sheetName === rawSheet && row.rowNo === 5));
    const material = must(observation.materialLineId);
    const finished = must(preview.submission?.finished.find((row) => row.rowNo === 2)?.orderLineId);
    const ids = [material, finished];
    expect(await directorBrands(opened.handle.db)).toEqual(expect.arrayContaining(ids.map((lineId) => ({ lineId, brand: '达肤妍' }))));
    const query = new URLSearchParams({ store: 'dafuyan' });
    for (const id of ids) query.append('lineIds', id);
    expect(listResponseSchema(OrderLineRowSchema).parse(await api.lines(query.toString())).items.map(({ id }) => id).sort()).toEqual(ids.sort());
    expect((await api.detail(finished, 'dafuyan')).line.id).toBe(finished);
    expect((await api.detail(material, 'dafuyan')).procurement?.sources.map((source) => source.fact.source.sheetName)).toContain(rawSheet);
  } finally {
    await opened.close();
  }
}, 90_000);
