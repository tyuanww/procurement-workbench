import { expect, it } from 'vitest';
import { BARCODE, BASE_ROUTE, CATALOG_ROUTE, CHANNEL, KEEP_PART, open, pack, PART, result } from './helpers/product-workbook.js';

it('详情可用旧档案的完整短条码更新产品和 BOM，列表及其他旧条码仍被拦截', async () => {
  const opened = await open();
  try {
    const legacyBarcode = '780012';
    const url = '/api/v1/products/workbook-legacy/workbook-imports';
    await opened.handle.exec(`
      INSERT INTO products (id, sku_name, barcode_raw, barcode_base, field_sources, created_at, updated_at)
      VALUES ('workbook-legacy', '合成旧商品', '${legacyBarcode}', '${legacyBarcode}', '{}', now(), now());
    `);
    const file = pack([['合成旧商品修订名', legacyBarcode]], { bom: [[legacyBarcode, '', '', '', PART, '合成子件']] });
    expect(result(await opened.uploadResponse(file, { url: CATALOG_ROUTE }))).toMatchObject({ status: 'blocked' });
    const wrong = pack([['错误更新', '780013']]);
    expect(result(await opened.uploadResponse(wrong, { url }))).toMatchObject({
      status: 'blocked', issues: [{ sheet: '产品档案', row: 2, field: '产品条码' }],
    });
    const preview = result(await opened.uploadResponse(file, { url }));
    expect(preview).toMatchObject({ status: 'ready', issues: [], products: [{ barcode: legacyBarcode }] });
    const committed = result(await opened.app.inject({
      method: 'POST', url: `${url}/${preview.id}/commit`, headers: { cookie: opened.buyer },
    }));
    expect(committed).toMatchObject({ status: 'committed', products: [{ barcode: legacyBarcode }] });
    expect(await opened.read('/api/v1/products/workbook-legacy')).toMatchObject({ product: { skuName: { value: '合成旧商品修订名' } } });
    expect(await opened.read('/api/v1/products/workbook-legacy/materials')).toMatchObject({ parts: [{ partCodeRaw: PART, partName: '合成子件' }] });
  } finally {
    await opened.close();
  }
});

it('删除首个子件时保留首行原有的空翻单次数和空累计数量', async () => {
  const opened = await open();
  try {
    await opened.handle.exec(`
      UPDATE bom_lines SET reorder_count = NULL, cumulative_qty = NULL WHERE part_code_raw = '${PART}';
      UPDATE bom_lines SET reorder_count = 8, cumulative_qty = 20 WHERE part_code_raw = '${KEEP_PART}';
    `);
    const query = '/api/v1/products/workbook-base/materials';
    const details = '/api/v1/products/workbook-base';
    const expected = { bomHeader: { reorderCount: null, cumulativeQty: null } };
    expect(await opened.read(details)).toMatchObject(expected);
    const file = pack([], { bom: [[BARCODE, '', '', '', PART, '', '', '删除']] });
    const preview = result(await opened.uploadResponse(file, { url: BASE_ROUTE }));
    expect(preview).toMatchObject({
      status: 'ready', products: [{ changes: [{ section: 'bom', label: `${PART} · 删除子件` }] }],
    });
    const committed = result(await opened.app.inject({
      method: 'POST', url: `${BASE_ROUTE}/${preview.id}/commit`, headers: { cookie: opened.buyer },
    }));
    expect(committed.status).toBe('committed');
    expect(await opened.read(query)).toMatchObject({ parts: [{ partCodeRaw: KEEP_PART }] });
    expect(await opened.read(details)).toMatchObject(expected);
  } finally {
    await opened.close();
  }
});

it('命中重复旧子件时，更新和删除都要求先整理组成物料', async () => {
  const opened = await open();
  try {
    await opened.handle.exec(`
      INSERT INTO bom_lines (product_barcode_raw, product_name, part_code_raw, part_name, import_batch_id, row_no, merged_fill)
      VALUES ('${BARCODE}', '合成商品', '${PART}', '旧重复子件', 'test', 4, false);
    `);
    for (const operation of ['更新', '删除']) {
      const bytes = pack([], { bom: [[BARCODE, '', '', '', PART, '修订名称', '', operation]] });
      const preview = result(await opened.uploadResponse(bytes, { url: BASE_ROUTE }));
      expect(preview).toMatchObject({
        status: 'blocked',
        issues: [{ sheet: '组成物料', row: 2, field: '子件条码', message: expect.stringContaining('重复') }],
      });
      const commit = await opened.app.inject({
        method: 'POST', url: `${BASE_ROUTE}/${preview.id}/commit`, headers: { cookie: opened.buyer },
      });
      expect(commit.statusCode).toBe(409);
    }
    expect(await opened.read('/api/v1/products/workbook-base/materials')).toMatchObject({
      parts: [{ partCodeRaw: PART, partName: '基础款配件' }, { partCodeRaw: KEEP_PART }, { partCodeRaw: PART, partName: '旧重复子件' }],
    });
  } finally {
    await opened.close();
  }
});

it('预览后只改了推荐人备注，旧预览也失效并保留最新备注', async () => {
  const opened = await open();
  try {
    const preview = await opened.upload(pack([['', CHANNEL, '合成新推荐人']]));
    expect(preview.status).toBe('ready');
    await opened.handle.exec(`
      UPDATE product_contacts SET note = '合成新备注' WHERE product_id = 'workbook-channel' AND role = 'product_info';
    `);
    expect((await opened.commit(preview.id)).status).toBe('stale');
    expect(await opened.read('/api/v1/products/workbook-channel?owners=1')).toMatchObject({
      ownerName: '渠道旧推荐人',
      contacts: expect.arrayContaining([expect.objectContaining({
        role: 'product_info', people: [expect.objectContaining({ name: '渠道旧推荐人', note: '合成新备注' })],
      })]),
    });
  } finally {
    await opened.close();
  }
});
