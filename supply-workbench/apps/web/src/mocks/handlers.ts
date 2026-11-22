import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/v1/me', () => HttpResponse.json({ id: 'buyer', name: '采购', roles: ['buyer'], devLogin: true })),
  http.get('/api/v1/search', () => HttpResponse.json({
    lines: [{ kind: 'line', id: 'line-1', poRaw: 'PO202609180001', nameRaw: '海葡萄面膜', barcodeRaw: null, itemCodeRaw: null }],
    products: [{ kind: 'product', id: 'product-1', skuName: '海葡萄面膜', barcodeRaw: '6975', filingName: null }],
    parties: [{ kind: 'party', id: 'party-1', displayName: '甲代工厂' }],
  })),
  http.get('/api/v1/meta/freshness', () => HttpResponse.json({
    sources: [{ template: 'po-master-v1', factoryPartyId: null, label: '总表', lastCommittedAt: '2026-10-11T06:02:00.000Z', fileModifiedAt: null }],
  })),
];
