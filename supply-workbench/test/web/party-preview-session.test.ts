import { describe, expect, it } from 'vitest';
import { entityId, orderLineId } from '../../packages/domain/src/values/ids.js';
import { openFollowUpPreview } from '../../apps/web/src/pages/lines/list/follow-up-preview-url.js';
import {
  closePartyPreview,
  loadingPartyPreview,
  openPartyPreview,
  partyFlagLabel,
  partyKpiLine,
  partyPreviewPhase,
  partyPreviewTarget,
  readPartyPreview,
  type OpenParty,
} from '../../apps/web/src/pages/lines/list/party-preview.js';
import { partyDetail, sampleRow } from './party-preview-fixture.js';

describe('主体预览地址', () => {
  it('打开和关闭只改抽屉参数，筛选还在', () => {
    const opened = openPartyPreview({
      search: 'lane=finished&page=2&q=面膜&supplierPartyId=keep',
      opened: { partyId: entityId('party-supplier'), role: 'supplier' },
    });
    expect(opened.get('lane')).toBe('finished');
    expect(opened.get('page')).toBe('2');
    expect(opened.get('q')).toBe('面膜');
    expect(opened.get('supplierPartyId')).toBe('keep');
    expect(opened.get('drawer')).toBe('party');
    expect(opened.get('partyId')).toBe('party-supplier');
    expect(opened.get('lineId')).toBeNull();
    const closed = closePartyPreview(opened.toString());
    expect(closed.get('lane')).toBe('finished');
    expect(closed.get('page')).toBe('2');
    expect(closed.get('q')).toBe('面膜');
    expect(closed.get('supplierPartyId')).toBe('keep');
    expect(closed.get('drawer')).toBeNull();
    expect(closed.get('partyId')).toBeNull();
  });

  it('拒绝空 id、错角色，以及订单行预览地址', () => {
    expect(readPartyPreview('drawer=party&partyId=&partyRole=supplier')).toBeNull();
    expect(readPartyPreview('drawer=party&partyId=party-1&partyRole=warehouse')).toBeNull();
    expect(readPartyPreview('drawer=preview&lineId=line-1&partyId=party-1&partyRole=supplier')).toBeNull();
  });

  it('打开订单行预览时清掉主体预览参数', () => {
    const party = openPartyPreview({
      search: 'lane=material&page=3',
      opened: { partyId: entityId('party-factory'), role: 'factory' },
    });
    const line = openFollowUpPreview({ search: party.toString(), lineId: orderLineId('line-9') });
    expect(line.get('drawer')).toBe('preview');
    expect(line.get('lineId')).toBe('line-9');
    expect(line.get('partyId')).toBeNull();
    expect(line.get('partyRole')).toBeNull();
    expect(line.get('lane')).toBe('material');
    expect(line.get('page')).toBe('3');
  });
});

describe('主体预览记录', () => {
  it('只在有主体 id 时给出供应商、工厂和收货代工厂', () => {
    const linked = sampleRow({
      supplier: { id: 'party-supplier', displayName: '甲代工厂', rawName: null },
      factory: { id: 'party-factory', displayName: '代工甲' },
      receiver: { id: 'party-receiver', displayName: '收货厂' },
    });
    expect(partyPreviewTarget({ column: 'supplier', row: linked })?.partyId).toBe('party-supplier');
    expect(partyPreviewTarget({ column: 'factory', row: linked })?.role).toBe('factory');
    expect(partyPreviewTarget({ column: 'receiver', row: linked })?.role).toBe('receiver');
    const unlinked = sampleRow({
      supplier: { id: null, displayName: null, rawName: '原始厂' },
      factory: null,
      receiver: { id: '', displayName: '空' },
    });
    expect(partyPreviewTarget({ column: 'supplier', row: unlinked })).toBeNull();
    expect(partyPreviewTarget({ column: 'factory', row: unlinked })).toBeNull();
    expect(partyPreviewTarget({ column: 'receiver', row: unlinked })).toBeNull();
    expect(partyPreviewTarget({ column: 'po', row: linked })).toBeNull();
  });

  it('晚到的另一条记录不能变成当前主体', () => {
    const opened: OpenParty = { partyId: entityId('party-a'), role: 'supplier' };
    const loading = loadingPartyPreview(opened);
    const ignored = partyPreviewPhase(loading, { kind: 'ready', partyId: entityId('party-b'), detail: partyDetail('party-b', '乙厂') });
    expect(ignored).toEqual(loading);
    const mismatched = partyPreviewPhase(loading, { kind: 'ready', partyId: opened.partyId, detail: partyDetail('party-c', '丙厂') });
    expect(mismatched.kind).toBe('failed');
    if (mismatched.kind !== 'failed') return;
    expect(mismatched.message).toBe('读到的主体和打开的记录不一致。');
  });

  it('角色标记和指标句子来自现有主体字段', () => {
    const detail = partyDetail('party-a', '甲厂');
    expect(partyFlagLabel(detail.party)).toBe('供应商、工厂');
    expect(partyKpiLine(detail)).toBe('应到 4 · 准时样本 3 · 近一个月 2026-10-01 至 2026-11-01');
    expect(partyFlagLabel({ ...detail.party, isSupplier: false, isFactory: false, isOwnWarehouse: false })).toBe('未标记角色');
  });
});
