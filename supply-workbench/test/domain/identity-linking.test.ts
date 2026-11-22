import { expect, it } from 'vitest';
import { DomainRuleViolation, confirmNameMerge, isForbiddenPair, linkFactoryRow, orderLineId, resolveApprovedTarget, similarNames, type FactoryLinkLine } from '../../packages/domain/src/index.js';

const PO = 'PO202609180001';

function line(patch: Partial<FactoryLinkLine> = {}): FactoryLinkLine {
  return {
    id: orderLineId('line-1'),
    poNorm: PO,
    itemCodeNorm: '70007023',
    nameRaw: '海葡萄棉片',
    barcodeRaw: '2000000003023',
    codeDecision: 'same_material',
    ...patch,
  };
}

it('采购单号和品号都相同就关联到这一行', () => {
  const result = linkFactoryRow({ row: { poNorm: PO, itemCodeNorm: '70007023', nameRaw: '别的名字', barcodeRaw: null }, lines: [line()], approvedLinks: [] });
  expect(result).toEqual({ status: 'linked', lineId: 'line-1' });
});

it('采购单号不同，品号相同也不关联', () => {
  const result = linkFactoryRow({ row: { poNorm: 'HZSY-20260918', itemCodeNorm: '70007023', nameRaw: '海葡萄棉片', barcodeRaw: null }, lines: [line()], approvedLinks: [] });
  expect(result).toEqual({ status: 'unlinked', reason: '采购单号对不上' });
});

it('空采购单号不和空采购单号互相关联', () => {
  const result = linkFactoryRow({ row: { poNorm: '', itemCodeNorm: '70007023', nameRaw: null, barcodeRaw: null }, lines: [line({ poNorm: '' })], approvedLinks: [] });
  expect(result.status).toBe('unlinked');
});

it('一号多名时，品号相同还要品名规范化后相同', () => {
  const shared = line({ codeDecision: 'shared_spec', nameRaw: '海葡萄 棉片' });
  const row = { poNorm: PO, itemCodeNorm: '70007023', nameRaw: '海葡萄棉片', barcodeRaw: null };
  expect(linkFactoryRow({ row: { ...row, nameRaw: '  海葡萄\n棉片  ' }, lines: [shared], approvedLinks: [] })).toEqual({ status: 'linked', lineId: 'line-1' });
  expect(linkFactoryRow({ row, lines: [shared], approvedLinks: [] }).status).toBe('unlinked');
});

it('还没审核的一号多名，即使标记为假也要品名相同', () => {
  const result = linkFactoryRow({ row: { poNorm: PO, itemCodeNorm: '70007023', nameRaw: '海葡萄棉片', barcodeRaw: null }, lines: [line({ codeDecision: 'undecided', nameRaw: '另一个规格' })], approvedLinks: [] }
  );
  expect(result).toEqual({ status: 'unlinked', reason: '品对不上' });
});

it('一号多名时缺品名不算相同', () => {
  const result = linkFactoryRow({ row: { poNorm: PO, itemCodeNorm: '70007023', nameRaw: null, barcodeRaw: null }, lines: [line({ codeDecision: 'shared_spec', nameRaw: null })], approvedLinks: [] }
  );
  expect(result).toEqual({ status: 'unlinked', reason: '品对不上' });
});

it('69 码原文完全相同才关联，带后缀的不和基础码合并', () => {
  const row = { poNorm: PO, itemCodeNorm: null, nameRaw: null, barcodeRaw: '2000000003023-2' };
  expect(linkFactoryRow({ row, lines: [line({ itemCodeNorm: null, barcodeRaw: '2000000003023-2' })], approvedLinks: [] })).toEqual({ status: 'linked', lineId: 'line-1' });
  expect(linkFactoryRow({ row, lines: [line({ itemCodeNorm: null })], approvedLinks: [] }).status).toBe('unlinked');
});

it('斜杠不是 69 码，两条都空也不算码相同', () => {
  const result = linkFactoryRow({ row: { poNorm: PO, itemCodeNorm: null, nameRaw: null, barcodeRaw: '/' }, lines: [line({ itemCodeNorm: null, barcodeRaw: '/' })], approvedLinks: [] }
  );
  expect(result.status).toBe('unlinked');
});

it('已通过的码对照能把上报行的品号挂到订单行的 69 码', () => {
  const result = linkFactoryRow({ row: { poNorm: PO, itemCodeNorm: '70007023', nameRaw: null, barcodeRaw: null }, lines: [line({ itemCodeNorm: null, barcodeRaw: '2000000003023' })], approvedLinks: [{ leftNorm: '70007023', rightNorm: '2000000003023' }] }
  );
  expect(result).toEqual({ status: 'linked', lineId: 'line-1' });
});

it('采购单号对上但品对不上是未关联', () => {
  const result = linkFactoryRow({ row: { poNorm: PO, itemCodeNorm: '70000001', nameRaw: null, barcodeRaw: null }, lines: [line()], approvedLinks: [] });
  expect(result).toEqual({ status: 'unlinked', reason: '品对不上' });
});

it('多于一条订单行同时满足就是含糊，顺序跟输入一致', () => {
  const row = { poNorm: PO, itemCodeNorm: '70007023', nameRaw: null, barcodeRaw: null };
  const result = linkFactoryRow({ row, lines: [line({ id: orderLineId('b') }), line({ id: orderLineId('a') })], approvedLinks: [] });
  expect(result).toEqual({ status: 'ambiguous', lineIds: ['b', 'a'], reason: '多于一条订单行' });
  expect(linkFactoryRow({ row, lines: [line({ id: orderLineId('b') }), line({ id: orderLineId('a') })], approvedLinks: [] })).toEqual(result);
});

it('I-06：主体和编码只有精确匹配到已通过记录才自动关联', () => {
  const aliases = [
    { key: '甲代工厂', status: 'approved' as const, targetId: 'party-1' },
    { key: '甲包装厂', status: 'pending' as const, targetId: 'party-2' },
    { key: '乙包材厂', status: 'approved' as const, targetId: null },
  ];
  expect(resolveApprovedTarget('  甲代工厂  ', aliases)).toBe('party-1');
  expect(resolveApprovedTarget('甲包装厂', aliases)).toBeNull();
  expect(resolveApprovedTarget('乙包材厂', aliases)).toBeNull();
  expect(resolveApprovedTarget('甲代工厂厂', aliases)).toBeNull();
  const codes = [
    { key: '70007023', status: 'approved' as const, targetId: 'item-1' },
    { key: '70000001', status: 'pending' as const, targetId: 'item-2' },
    { key: '70008370', status: 'rejected' as const, targetId: 'item-3' },
  ];
  expect(resolveApprovedTarget('70007023', codes)).toBe('item-1');
  expect(resolveApprovedTarget('70000001', codes)).toBeNull();
  expect(resolveApprovedTarget('70008370', codes)).toBeNull();
});

it('同一键有两条已通过记录时不自动关联', () => {
  const records = [
    { key: '甲代工厂', status: 'approved' as const, targetId: 'party-1' },
    { key: '甲代工厂', status: 'approved' as const, targetId: 'party-2' },
  ];
  expect(resolveApprovedTarget('甲代工厂', records)).toBeNull();
});

it('甲包装厂和甲代工厂是禁止合并组合，不确认就拒绝，确认后可以通过', () => {
  expect(isForbiddenPair('甲包装厂', '甲代工厂')).toBe(true);
  expect(isForbiddenPair('甲代工厂', '  甲包装厂  ')).toBe(true);
  expect(isForbiddenPair('甲包装厂', '乙包材厂')).toBe(false);
  expect(isForbiddenPair('丙代工厂', '丙加工厂')).toBe(true);
  expect(isForbiddenPair('甲包装厂', '甲包装厂')).toBe(false);
  expect(() => confirmNameMerge({ left: '甲包装厂', right: '甲代工厂', confirmed: false })).toThrow(DomainRuleViolation);
  expect(() => confirmNameMerge({ left: '丙包装厂', right: '丙代工厂', confirmed: false })).toThrow(DomainRuleViolation);
  expect(() => confirmNameMerge({ left: '甲包装厂', right: '甲代工厂', confirmed: true })).not.toThrow();
  expect(() => confirmNameMerge({ left: '甲包装厂', right: '乙包材厂', confirmed: false })).not.toThrow();
});

it('禁止合并组合和丁印刷厂不出现在相似候选里', () => {
  const names = ['丙包装厂', '丙加工厂', '丁印刷厂', '店铺丁', '燕麦棉片礼盒', '燕麦'];
  expect(similarNames('丙代工厂', names)).toEqual([]);
  expect(similarNames('甲包装厂', ['甲代工厂', '甲包装厂厂'])).toEqual(['甲包装厂厂']);
  expect(similarNames('丁印刷厂', ['丁印刷厂甲', '甲代工厂'])).toEqual([]);
  expect(similarNames('店铺甲', names)).toEqual(['店铺丁']);
  expect(similarNames('燕麦棉片', names)).toEqual(['燕麦棉片礼盒', '燕麦']);
});

it('相似名不把空字符串和自己算进去', () => {
  expect(similarNames('', ['甲代工厂', '甲包装厂'])).toEqual([]);
  expect(similarNames('甲代工厂', ['甲代工厂', '  甲代工厂  '])).toEqual([]);
});
