import { expect, it } from 'vitest';
import { CATALOG_ROUTE, CHANNEL, OTHER_CHANNEL, PART, ROUTE, open, pack, result } from './helpers/product-workbook.js';

it('格式错误的工作簿上传返回可修正的请求错误', async () => {
  const opened = await open();
  try {
    const response = await opened.app.inject({
      method: 'POST', url: ROUTE,
      headers: { cookie: opened.buyer, 'content-type': 'multipart/form-data' },
      payload: Buffer.from('synthetic missing multipart boundary'),
    });
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  } finally {
    await opened.close();
  }
});

it('档案改动后重新读取原本一致的 Excel 预览时提示过期', async () => {
  const opened = await open();
  try {
    const file = pack([['渠道合成装', CHANNEL]]);
    const unchanged = await opened.upload(file);
    expect(unchanged.status).toBe('unchanged');
    expect((await opened.get(unchanged.id)).status).toBe('unchanged');
    const changed = await opened.app.inject({
      url: '/api/v1/products/workbook-channel', method: 'PATCH', headers: { cookie: opened.reviewer },
      payload: { skuName: '新版渠道装' },
    });
    expect(changed.statusCode).toBe(200);
    expect((await opened.get(unchanged.id)).status).toBe('stale');
    expect((await opened.upload(file)).status).toBe('ready');
  } finally {
    await opened.close();
  }
});

it('旧版 GIF 可在隐藏图片的核对预览中读取', async () => {
  const opened = await open();
  try {
    const bytes = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const gif = await opened.files.put({ bytes, mime: 'image/gif', originalName: 'synthetic.gif' });
    await opened.handle.exec(`
      INSERT INTO product_images(id, product_id, slot, file_id, "order", source)
      VALUES ('workbook-legacy-gif', 'workbook-channel', 'outer', '${gif.sha256}', 0, 'import');
    `);
    const hiding = await opened.upload(pack([['', CHANNEL, '', '', '', '', '隐藏']]));
    expect(hiding.status).toBe('ready');
    const url = hiding.products[0]?.changes[0]?.beforeImageUrl;
    if (url === undefined) throw new Error('预览缺少图片地址');
    const image = await opened.app.inject({ url, headers: { cookie: opened.buyer } });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/gif');
    expect(image.rawPayload).toEqual(bytes);
  } finally {
    await opened.close();
  }
});

it('重传同一工作簿优先返回已确认的较早回执', async () => {
  const opened = await open();
  try {
    await opened.handle.exec(`
      INSERT INTO bom_lines (product_barcode_raw, product_name, part_code_raw, part_name, import_batch_id, row_no, merged_fill)
      VALUES ('${OTHER_CHANNEL}', '未建档渠道装', '${PART}', '原包材', 'synthetic', 2, false);
    `);
    const file = pack([['三号新渠道装', OTHER_CHANNEL]], { bom: [[OTHER_CHANNEL, '', '', '', PART, '更新包材']] });
    const upload = async () => result(await opened.uploadResponse(file, { url: CATALOG_ROUTE }));
    const first = await upload();
    expect(first.status).toBe('ready');
    await opened.handle.exec(`UPDATE bom_lines SET part_name = '换版包材' WHERE product_barcode_raw = '${OTHER_CHANNEL}'`);
    const latest = await upload();
    expect(latest.status).toBe('ready');
    expect(latest.id).not.toBe(first.id);
    await opened.handle.exec(`UPDATE bom_lines SET part_name = '原包材' WHERE product_barcode_raw = '${OTHER_CHANNEL}'`);
    const receipt = result(await opened.app.inject({ method: 'POST', url: `${CATALOG_ROUTE}/${first.id}/commit`, headers: { cookie: opened.buyer } }));
    expect(receipt.status).toBe('committed');
    expect(await upload()).toEqual(receipt);
  } finally {
    await opened.close();
  }
});

it('确认和重传同一份新建工作簿时保留同一批次', async () => {
  const opened = await open();
  try {
    const file = pack([['三号新渠道装', OTHER_CHANNEL]]);
    const upload = async () => result(await opened.uploadResponse(file, { url: CATALOG_ROUTE }));
    const preview = await upload();
    const commit = async () => result(await opened.app.inject({
      method: 'POST', url: `${CATALOG_ROUTE}/${preview.id}/commit`, headers: { cookie: opened.buyer },
    }));
    const [receipt, repeated] = await Promise.all([commit(), upload()]);
    expect(receipt).toMatchObject({ id: preview.id, status: 'committed' });
    expect(repeated.id).toBe(preview.id);
    expect(await upload()).toEqual(receipt);
  } finally {
    await opened.close();
  }
});
