import { createHash } from 'node:crypto';
import { entityId, productId } from '@sw/domain';
import { readXlsx } from '@sw/importers';
import { productWorkbookRepository } from '@sw/persistence';
import { expect, it } from 'vitest';
import { BARCODE, BASE_ROUTE, CATALOG_ROUTE, CHANNEL, KEEP_PART, OTHER_CHANNEL, PART, PNG, ROUTE, open, pack, result } from './helpers/product-workbook.js';

it('从详情更新同一完整渠道条码的两张表，保留省略值并可重读回执', async () => {
  const opened = await open();
  try {
    const bytes = pack([
      ['', CHANNEL, '渠道推荐人', '渠道推荐人', '40g'],
    ], { bom: [
      [CHANNEL, '', 2, '1.5万', PART, '渠道款配件', '渠道子件负责人'],
    ], image: true });
    const draft = await opened.upload(bytes);
    expect(draft).toMatchObject({
      status: 'ready',
      issues: [],
      products: [
        { id: 'workbook-channel', barcode: CHANNEL, changes: expect.arrayContaining([
          { section: 'product', label: '项目推荐人', before: '渠道旧推荐人', after: '渠道推荐人' },
          { section: 'bom', label: '累计数量', before: null, after: '15000' },
          expect.objectContaining({ section: 'image', label: '外包装图片', after: '新增图片' }),
        ]) },
      ],
    });
    expect(await opened.upload(bytes)).toEqual(draft);
    expect(await opened.get(draft.id)).toEqual(draft);
    expect(await opened.read('/api/v1/products/workbook-channel?owners=1')).toMatchObject({ ownerName: '渠道旧推荐人', images: [] });
    const url = draft.products.flatMap(({ changes }) => changes).find((change) => change.afterImageUrl !== undefined)?.afterImageUrl;
    if (url === undefined) throw new Error('预览缺少图片地址');
    expect((await opened.app.inject({ url, headers: { cookie: opened.manager } })).statusCode).toBe(403);
    expect((await opened.app.inject({ url, headers: { cookie: opened.reviewer } })).statusCode).toBe(404);
    const image = await opened.app.inject({ url, headers: { cookie: opened.buyer } });
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.rawPayload).toEqual(PNG);

    const committed = await opened.commit(draft.id);
    expect(committed.status).toBe('committed');
    expect(committed.products).toEqual(draft.products);
    expect(await opened.commit(draft.id)).toEqual(committed);
    expect(await opened.get(draft.id)).toEqual(committed);
    expect((await opened.upload(bytes)).status).toBe('unchanged');
    expect(await opened.read('/api/v1/products/workbook-channel?owners=1')).toMatchObject({
      ownerName: '渠道推荐人', bomHeader: { reorderCount: 2, cumulativeQty: 15000 },
      product: {
        casePack: { value: '12盒/箱' },
        netContent: { value: '40g', provenance: { kind: 'product_workbook', receiptId: draft.id, anchorProductId: 'workbook-channel', rowNo: 2 } },
      },
      images: [{ slot: 'outer', hidden: false }],
    });
    const list = '/api/v1/products?owners=1&q=' + BARCODE;
    expect(await opened.read(list)).toMatchObject({ items: expect.arrayContaining([
      expect.objectContaining({ barcodeRaw: BARCODE, ownerName: '基础款推荐人' }),
      expect.objectContaining({ barcodeRaw: CHANNEL, ownerName: '渠道推荐人' }),
    ]) });
    expect(await opened.read(list + '&cover=packaging')).toMatchObject({ items: expect.arrayContaining([
      expect.objectContaining({ barcodeRaw: BARCODE, packagingImages: [] }),
      expect.objectContaining({ barcodeRaw: CHANNEL, packagingImages: [{ slot: 'outer', fileId: createHash('sha256').update(PNG).digest('hex') }] }),
    ]) });
    expect(await opened.read('/api/v1/products/workbook-base/materials?owners=1')).toMatchObject({ parts: [
      { partCodeRaw: PART, ownerName: '基础款旧负责人' },
      { partCodeRaw: KEEP_PART, ownerName: null },
    ] });
    expect(await opened.read('/api/v1/products/workbook-channel/materials?owners=1')).toMatchObject({ parts: [
      { partCodeRaw: PART, ownerName: '渠道子件负责人' },
    ] });
  } finally {
    await opened.close();
  }
});

it('校验导入角色、模板、双联系人冲突、显式隐藏和删除影响', async () => {
  const opened = await open();
  try {
    const template = '/api/v1/products/workbook-base/workbook-import-template';
    const templateResponse = await opened.app.inject({ url: template, headers: { cookie: opened.buyer } });
    expect(templateResponse.headers['content-disposition']).toContain('product-archive.xlsx');
    const templateBook = readXlsx({ bytes: templateResponse.rawPayload, fileName: 'template.xlsx' });
    expect(templateBook.sheets.map(({ name }) => name)).toEqual(['产品档案', '组成物料']);
    expect(templateBook.sheets[0]?.cell(1, 10)?.text).toBe('项目推荐人');
    expect(templateBook.sheets[1]?.cell(1, 8)?.text).toBe('操作');
    expect((await opened.app.inject({ url: template })).statusCode).toBe(401);
    expect((await opened.app.inject({ url: template, headers: { cookie: opened.manager } })).statusCode).toBe(403);
    expect((await opened.uploadResponse(pack([['', CHANNEL]]), { cookie: opened.manager })).statusCode).toBe(403);
    const blocked = await opened.upload(pack([['', CHANNEL, '新联系人甲', '新联系人乙', '', '', '替换']]));
    expect(blocked).toMatchObject({ status: 'blocked', issues: [
      { sheet: '产品档案', row: 2, field: '项目推荐人', message: expect.stringContaining('项目对接人') },
      { sheet: '产品档案', row: 2, field: '外包装图片操作', message: expect.stringContaining('嵌入新图片') },
    ] });
    expect((await opened.commitResponse(blocked.id)).statusCode).toBe(409);
    expect((await opened.commitResponse(blocked.id, opened.manager)).statusCode).toBe(403);

    const original = await opened.upload(pack([['', CHANNEL, '', '沿用旧项目对接人']], { image: true, legacy: true }));
    await opened.commit(original.id);
    const bytes = pack([['', CHANNEL, '', '', '', '', '替换']], { image: true, replacement: true });
    const replacement = await opened.upload(bytes);
    expect(replacement.products).toMatchObject([
      { barcode: CHANNEL, changes: [
        expect.objectContaining({ section: 'image', after: '隐藏', beforeImageUrl: expect.any(String) }),
        expect.objectContaining({ section: 'image', after: '新增图片', afterImageUrl: expect.any(String) }),
      ] },
    ]);
    await opened.commit(replacement.id);
    expect((await opened.upload(bytes)).status).toBe('unchanged');
    const hide = await opened.upload(pack([['', CHANNEL, '', '', '', '', '隐藏']]));
    expect(hide.products[0]?.changes).toEqual([expect.objectContaining({ section: 'image', after: '隐藏' })]);
    expect((await opened.commit(hide.id)).status).toBe('committed');
    expect(await opened.read('/api/v1/products/workbook-channel?owners=1')).toMatchObject({ ownerName: '沿用旧项目对接人', images: [{ hidden: true }, { hidden: true }] });

    const bomOnly = result(await opened.uploadResponse(pack([], {
      bom: [[BARCODE, '', '', '', PART, '', '', '删除']],
    }), { url: BASE_ROUTE }));
    expect(bomOnly).toMatchObject({ status: 'ready', products: [
      { barcode: BARCODE, changes: [{ section: 'bom', label: `${PART} · 删除子件`, before: expect.stringContaining('负责人'), after: null }] },
    ] });
    expect(result(await opened.app.inject({
      method: 'POST', url: `${BASE_ROUTE}/${bomOnly.id}/commit`, headers: { cookie: opened.buyer },
    })).status).toBe('committed');
    expect(await opened.read('/api/v1/products/workbook-base/materials?owners=1')).toMatchObject({ parts: [{ partCodeRaw: KEEP_PART }] });
  } finally {
    await opened.close();
  }
});

it('手工改动使预览失效，确认失败回滚两张表，重试返回同一回执', async () => {
  const opened = await open();
  try {
    const bytes = pack([['', CHANNEL, '工作簿联系人']], { bom: [[CHANNEL, '', 3, 15, PART, '工作簿子件']], image: true });
    const initial = await opened.upload(bytes);
    const contacts = await opened.app.inject({
      url: '/api/v1/products/workbook-channel/contacts',
      method: 'PUT',
      headers: { cookie: opened.reviewer },
      payload: { role: 'product_info', people: [{ nameRaw: '手工联系人甲' }, { nameRaw: '手工联系人乙' }] },
    });
    expect(contacts.statusCode).toBe(200);
    expect(await opened.read('/api/v1/products/workbook-channel?owners=1')).toMatchObject({ ownerName: '手工联系人甲、手工联系人乙' });
    expect((await opened.get(initial.id)).status).toBe('stale');
    expect((await opened.commit(initial.id)).status).toBe('stale');
    const ready = await opened.upload(bytes);
    expect(ready.id).not.toBe(initial.id);
    expect(ready.products[0]?.changes).toContainEqual({ section: 'product', label: '项目推荐人', before: '手工联系人甲、手工联系人乙', after: '工作簿联系人' });
    const previewUrl = ready.products[0]?.changes.find((change) => change.afterImageUrl !== undefined)?.afterImageUrl;
    expect(previewUrl).toBeDefined();
    const filePath = '/files/' + createHash('sha256').update(PNG).digest('hex');
    const readImage = () => opened.app.inject({ url: filePath, headers: { cookie: opened.manager } });
    expect((await readImage()).statusCode).toBe(404);

    await opened.handle.exec(`CREATE FUNCTION reject_workbook_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action = 'product.workbook-import' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_workbook_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_workbook_audit()`);
    expect((await opened.commitResponse(ready.id)).statusCode).toBe(500);
    expect((await opened.get(ready.id)).status).toBe('ready');
    expect((await readImage()).statusCode).toBe(404);
    expect(await opened.read('/api/v1/products/workbook-channel?owners=1')).toMatchObject({ ownerName: '手工联系人甲、手工联系人乙' });
    expect(await opened.read('/api/v1/products/workbook-channel/materials')).toEqual({ kind: 'no_bom' });
    await opened.handle.exec('DROP TRIGGER reject_workbook_audit ON audit_log');
    const submitted = await Promise.all([opened.commit(ready.id), opened.commit(ready.id)]);
    expect(submitted).toEqual([expect.objectContaining({ id: ready.id, status: 'committed' }), submitted[0]]);
    const image = await readImage();
    expect(image.statusCode).toBe(200);
    expect(image.rawPayload).toEqual(PNG);
    expect(await opened.read('/api/v1/products/workbook-channel?owners=1')).toMatchObject({ ownerName: '工作簿联系人', bomHeader: { reorderCount: 3, cumulativeQty: 15 } });
    expect(await opened.read('/api/v1/products/workbook-channel/materials')).toMatchObject({ parts: [{ partCodeRaw: PART, partName: '工作簿子件' }] });
  } finally {
    await opened.close();
  }
});

it('详情两张表逐行报告越界完整条码，混合匹配行也不能提交', async () => {
  const opened = await open();
  try {
    const mixed = await opened.upload(pack([
      ['试图改名', CHANNEL], ['基础合成装', BARCODE], ['三号新渠道装', OTHER_CHANNEL], ['重复基础条码', BARCODE],
    ], { bom: [
      [CHANNEL, '', '', '', PART, '试图新增子件'],
      [BARCODE, '', '', '', PART, '试图改基础款配件'],
      [OTHER_CHANNEL, '', '', '', PART, '试图新增其他渠道配件'],
      [OTHER_CHANNEL, '缺少子件条码'],
    ] }));
    expect(mixed.status).toBe('blocked');
    expect(mixed.products.map(({ barcode }) => barcode)).toEqual([CHANNEL]);
    expect(mixed.issues.filter(({ message }) => message.includes('此处只接受'))).toEqual([
      scopeIssue({ sheet: '产品档案', row: 3, found: BARCODE }), scopeIssue({ sheet: '产品档案', row: 4, found: OTHER_CHANNEL }), scopeIssue({ sheet: '产品档案', row: 5, found: BARCODE }),
      scopeIssue({ sheet: '组成物料', row: 3, found: BARCODE }), scopeIssue({ sheet: '组成物料', row: 4, found: OTHER_CHANNEL }), scopeIssue({ sheet: '组成物料', row: 5, found: OTHER_CHANNEL }),
    ]);
    expect((await opened.commitResponse(mixed.id)).statusCode).toBe(409);
    await expectUnchangedProducts(opened);
  } finally {
    await opened.close();
  }
});

it.each(['get', 'commit'] as const)('旧的越界 ready 在 %s 时失效并返回明细，已提交回执仍可重读', async (action) => {
  const opened = await open();
  try {
    const blocked = await opened.upload(pack([
      ['', CHANNEL, '', '', '40g'], ['三号新渠道装', OTHER_CHANNEL],
    ], { bom: [[OTHER_CHANNEL, '', '', '', PART, '三号配件']] }));
    const repository = productWorkbookRepository(opened.handle.db);
    const previous = await repository.find({
      id: blocked.id, anchorId: productId('workbook-channel'), actorId: entityId('0199f0a0-0000-7000-8000-000000000002'), lock: false,
    });
    if (previous === undefined) throw new Error('预览未保存');
    const productChanges = [
      { id: 'workbook-channel', barcode: CHANNEL, name: '渠道合成装', changes: [{ section: 'product', label: '净含量', before: null, after: '40g' }] },
      { id: null, barcode: OTHER_CHANNEL, name: '三号新渠道装', changes: [
        { section: 'product', label: 'SKU名称', before: null, after: '三号新渠道装' },
        { section: 'bom', label: `${PART} · 子件名称`, before: null, after: '三号配件' },
      ] },
    ] satisfies readonly [typeof blocked.products[number], typeof blocked.products[number]];
    const formerlyReady = { ...previous, workbook: { products: previous.workbook.products, materials: previous.workbook.materials, issues: [] },
      preview: { ...blocked, status: 'ready', issues: [], products: productChanges },
      comparison: createHash('sha256').update(JSON.stringify(productChanges.map((view) => ({ view, hiddenImages: [] })))).digest('hex'),
    } satisfies typeof previous;
    await repository.save(formerlyReady);
    const stale = await opened[action](blocked.id);
    expect(stale).toMatchObject({
      status: 'stale', products: [], issues: [scopeIssue({ sheet: '产品档案', row: 3, found: OTHER_CHANNEL }), scopeIssue({ sheet: '组成物料', row: 2, found: OTHER_CHANNEL })],
    });
    expect(await opened.commit(blocked.id)).toEqual(stale);
    await expectUnchangedProducts(opened);

    const historical = { ...formerlyReady.preview, status: 'committed', products: [
      productChanges[0], { ...productChanges[1], id: 'legacy-created-channel' },
    ] } satisfies typeof blocked;
    await repository.save({ ...formerlyReady, preview: historical });
    expect(await opened.get(blocked.id)).toEqual(historical);
    expect(await opened.commit(blocked.id)).toEqual(historical);
  } finally {
    await opened.close();
  }
});

function scopeIssue({ sheet, row, found }: { readonly sheet: string; readonly row: number; readonly found: string }) {
  return { sheet, row, field: '产品条码', message: `这一行的完整条码是 ${found}，此处只接受 ${CHANNEL}。` };
}

async function expectUnchangedProducts(opened: Awaited<ReturnType<typeof open>>) {
  const list = await opened.read(`/api/v1/products?q=${BARCODE}`);
  expect(list.items.map(({ barcodeRaw }: { readonly barcodeRaw: string }) => barcodeRaw).sort()).toEqual([BARCODE, CHANNEL]);
  expect(await opened.read('/api/v1/products/workbook-channel')).toMatchObject({
    product: { skuName: { value: '渠道合成装' }, netContent: { value: null } },
  });
  expect(await opened.read('/api/v1/products/workbook-channel/materials')).toEqual({ kind: 'no_bom' });
  expect(await opened.read('/api/v1/products/workbook-base/materials')).toMatchObject({
    parts: [{ partCodeRaw: PART, partName: '基础款配件' }, { partCodeRaw: KEEP_PART }],
  });
}

it('列表导入只新增完整条码，混合重复行整批拦截，并可恢复已提交回执', async () => {
  const opened = await open();
  try {
    const template = await opened.app.inject({ url: '/api/v1/products/workbook-import-template', headers: { cookie: opened.buyer } });
    expect(template.statusCode).toBe(200);
    const bytes = pack([['三号新渠道装', OTHER_CHANNEL, '合成推荐人', '', '40g']], {
      bom: [[OTHER_CHANNEL, '', '', '', PART, '新增组成物料', '合成子件负责人']],
    });
    const upload = async (file: Buffer) => result(await opened.uploadResponse(file, { url: CATALOG_ROUTE }));
    const commit = async (id: string) => result(await opened.app.inject({
      method: 'POST', url: `${CATALOG_ROUTE}/${id}/commit`, headers: { cookie: opened.buyer },
    }));
    expect((await opened.uploadResponse(bytes, { cookie: opened.manager, url: CATALOG_ROUTE })).statusCode).toBe(403);
    const mixed = await upload(pack([['意外改名', CHANNEL], ['三号新渠道装', OTHER_CHANNEL]]));
    expect(mixed).toMatchObject({ status: 'blocked', issues: [{ sheet: '产品档案', row: 2, field: '产品条码', message: expect.stringContaining(CHANNEL) }] });
    const refused = await opened.app.inject({ method: 'POST', url: `${CATALOG_ROUTE}/${mixed.id}/commit`, headers: { cookie: opened.buyer } });
    expect(refused.statusCode).toBe(409);
    expect(await opened.read('/api/v1/products/workbook-channel')).toMatchObject({ product: { skuName: { value: '渠道合成装' } } });

    const first = await upload(bytes);
    const concurrent = await upload(pack([['同码另一份表', OTHER_CHANNEL]]));
    expect(first).toMatchObject({ status: 'ready', products: [{ id: null, barcode: OTHER_CHANNEL }] });
    expect((await opened.app.inject({ url: `${ROUTE}/${first.id}`, headers: { cookie: opened.buyer } })).statusCode).toBe(404);
    const committed = await commit(first.id);
    expect(committed.status).toBe('committed');
    expect(await upload(bytes)).toEqual(committed);
    expect(await commit(first.id)).toEqual(committed);
    expect((await commit(concurrent.id)).status).toBe('stale');
    const product = committed.products[0];
    expect(await opened.read(`/api/v1/products/${product?.id}?owners=1`)).toMatchObject({
      ownerName: '合成推荐人',
      product: { skuName: { provenance: { kind: 'product_workbook', receiptId: committed.id, anchorProductId: null, rowNo: 2 } } },
    });
    expect(await opened.read(`/api/v1/products/${product?.id}/materials?owners=1`)).toMatchObject({ parts: [{ partCodeRaw: PART, ownerName: '合成子件负责人' }] });
  } finally {
    await opened.close();
  }
});
