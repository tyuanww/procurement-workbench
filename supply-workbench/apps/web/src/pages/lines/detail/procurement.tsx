import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert, Button, Collapse, Descriptions, Form, Input, Typography } from 'antd';
import { BatchViewSchema, FollowUpViewSchema, type OrderLineDetail } from '@sw/contracts';
import { isNotProvided } from '@sw/domain';
import { useCanWrite } from '../../../shared/actor.js';
import { apiErrorMessage, apiSend } from '../../../shared/api/client.js';

const quantityFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 12 });

export function ProcurementSection({ detail }: { readonly detail: OrderLineDetail }) {
  const [params] = useSearchParams();
  const relatedQuery = procurementDetailQuery(params);
  const procurement = detail.procurement;
  const progress = detail.line.storeProgress;
  if (procurement === undefined && progress === undefined) return null;
  const isComponent = detail.line.origin === 'import_procurement_component';
  return (
    <section aria-label={isComponent ? '采购事项来源' : '关联采购事项'}>
      {isComponent ? <ComponentFields line={detail.line} /> : null}
      <ProcurementOa progress={progress} />
      <Typography.Title level={2}>{isComponent ? '关联成品' : '关联采购事项'}</Typography.Title>
      <RelatedProcurementLines lines={procurement?.relatedLines ?? []} query={relatedQuery} />
      {procurement === undefined || procurement.sources.length === 0 ? null : <ProcurementSources sources={procurement.sources} />}

    </section>
  );
}

function procurementDetailQuery(params: URLSearchParams): string {
  const related = new URLSearchParams();
  for (const key of ['store', 'backToProgress']) {
    const value = params.get(key);
    if (value !== null) related.set(key, value);
  }
  return related.size === 0 ? '' : `?${related.toString()}`;
}

function ProcurementOa({ progress }: { readonly progress: OrderLineDetail['line']['storeProgress'] }) {
  if (progress === undefined) return null;
  const refs = progress.sources.flatMap((source) => source.oaRaw ?? []);
  return <p>OA 需求 {[...new Set(refs)].join(' · ') || '未关联 OA'}</p>;
}

type RelatedLine = NonNullable<OrderLineDetail['procurement']>['relatedLines'][number];

function RelatedProcurementLines({ lines, query }: { readonly lines: readonly RelatedLine[]; readonly query: string }) {
  return (
    <ul>{lines.map((line) => (
      <li key={line.id}>
        <Link to={`/lines/${encodeURIComponent(line.id)}${query}`}>{[line.nameRaw, line.codeRaw, line.poRaw].filter(Boolean).join(' · ') || '打开订单行'}</Link>
      </li>
    ))}</ul>
  );
}

type ProcurementSourcesList = NonNullable<OrderLineDetail['procurement']>['sources'];

function ProcurementSources({ sources }: { readonly sources: ProcurementSourcesList }) {
  const canReadImport = useCanWrite('imports.write');
  return (
    <Collapse items={[{
      key: 'procurement-source',
      label: `来源版本（${sources.length}）`,
      children: <ul>{sources.map((entry) => (
        <ProcurementSource key={JSON.stringify([entry.importBatchId, entry.fact.source.sheetName, entry.fact.source.rowNo])} entry={entry} canReadImport={canReadImport} />
      ))}</ul>,
    }]} />
  );
}

function ProcurementSource({ entry, canReadImport }: { readonly entry: ProcurementSourcesList[number]; readonly canReadImport: boolean }) {
  const { fact } = entry;
  const source = `${fact.source.sheetName} 第 ${fact.source.rowNo} 行`;
  return (
    <li>
      {canReadImport ? <Link to={`/imports/${encodeURIComponent(entry.importBatchId)}`}>{source}</Link> : source}
      {' · '}{entry.fileName ?? entry.importBatchId}
      {' · '}{fact.status === 'completed' ? '源表标为已完结' : '项目表'}
      {' · '}{fact.quantityRaw ?? '采购量未填'}{fact.quantityRaw === null || fact.unitRaw === null ? '' : `（单位原文 ${fact.unitRaw}）`}
      {' · '}{fact.buyerRaw ?? '采购员未填'}
      {' · '}{fact.supplierRaw ?? '供应商未填'}
      {fact.deliveryProgressRaw == null ? null : ` · 源表交付原文 ${fact.deliveryProgressRaw}`}
    </li>
  );
}

function ComponentFields({ line }: { readonly line: OrderLineDetail['line'] }) {
  const ordered = line.qtyOrdered === null ? '采购量未填' : quantityFormat.format(line.qtyOrdered);
  return <Descriptions items={[
    { key: 'item', label: '子件', children: [line.nameRaw, line.itemCodeRaw].filter(Boolean).join(' · ') },
    { key: 'qty', label: '采购量 / 单位', children: `${ordered} · ${line.unit ?? '单位未填'}` },
    { key: 'buyer', label: '采购员', children: line.buyer?.name ?? '采购员未分派' },
    { key: 'supplier', label: '供应商', children: line.supplier.displayName ?? line.supplier.rawName ?? '供应商未填' },
  ]} />;
}

export function ProcurementFollowUp({ lineId, batchId, onReload }: { readonly lineId: string; readonly batchId?: string; readonly onReload: () => void }) {
  const [draft, setDraft] = useState('');
  const label = batchId === undefined ? '跟进记录' : '工厂承诺';
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    const text = draft.trim();
    if (text === '' || isSaving) return;
    setSaving(true);
    setError('');
    try {
      await apiSend({ path: '/api/v1/follow-ups', method: 'POST', body: { orderLineId: lineId, text, ...(batchId === undefined ? { kind: 'note' } : { batchId, kind: 'promise' }) }, schema: FollowUpViewSchema });
      setDraft('');
      onReload();
    } catch (caught) {
      setError(apiErrorMessage(caught) ?? '跟进没有记上');
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Form layout="inline" onFinish={() => { void submit(); }}>
        <Input aria-label={label} placeholder={batchId === undefined ? '填写跟进记录' : '例如周五发 5,000 件'} value={draft} disabled={isSaving} onChange={(event) => setDraft(event.target.value)} style={{ maxWidth: 420 }} />
        <Button htmlType="submit" disabled={draft.trim() === ''} loading={isSaving}>{batchId === undefined ? '记跟进' : '记工厂承诺'}</Button>
      </Form>
      {error === '' ? null : <Alert type="error" showIcon title={error} />}
    </>
  );
}

export function BatchUnitCorrection({ batchId, onReload }: { readonly batchId: string; readonly onReload: () => void }) {
  const [plannedUnit, setPlannedUnit] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canSubmit = !isSaving && !isNotProvided(plannedUnit) && !isNotProvided(reason);
  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      await apiSend({ path: `/api/v1/batches/${encodeURIComponent(batchId)}`, method: 'PATCH', body: { plannedUnit: plannedUnit.trim(), reason: reason.trim() }, schema: BatchViewSchema });
      setPlannedUnit('');
      setReason('');
      onReload();
    } catch (caught) {
      setError(apiErrorMessage(caught) ?? '计划单位未保存');
    } finally {
      setSaving(false);
    }
  }
  return <>
    <Form layout="inline" onFinish={() => { void submit(); }}>
      <Input aria-label="计划单位" placeholder="计划单位" maxLength={64} value={plannedUnit} disabled={isSaving} onChange={(event) => setPlannedUnit(event.target.value)} style={{ width: 110 }} />
      <Input aria-label="计划单位依据" placeholder="可回查的采购或仓库依据" value={reason} disabled={isSaving} onChange={(event) => setReason(event.target.value)} style={{ width: 220 }} />
      <Button htmlType="submit" disabled={!canSubmit} loading={isSaving}>补录计划单位</Button>
    </Form>
    {error === '' ? null : <Alert type="error" showIcon title={error} />}
  </>;
}
