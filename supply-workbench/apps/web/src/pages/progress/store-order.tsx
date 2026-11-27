import { Select, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { DeliveryDetailLink } from './delivery-detail-link.js';
import type { OrderLineRow, ProcurementStore, StoreProgressMaterial } from '@sw/contracts';
import { procurementOaReferences } from '@sw/domain';
import { useCan } from '../../shared/actor.js';
import { space } from '../../theme/tokens.js';
import { storeLabels } from './store-query.js';

const amount = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 12 });
const UNKNOWN_OA = 'unlinked';
export const progressFilterStyle = { width: `min(152px, calc((100% - ${space[2]}px) / 2))`, minWidth: 0 };

export function progressOrderRef(line: OrderLineRow | undefined): string {
  const refs = line?.storeProgress?.sources.flatMap((source) => source.oaRaw === null ? [] : [source.oaRaw]) ?? [];
  return [...new Set(refs)].join(' · ') || '未关联 OA';
}

function oaKeys(line: OrderLineRow | undefined): readonly string[] {
  const sources = line?.storeProgress?.sources ?? [];
  const mains = [...new Set(sources.flatMap((source) => procurementOaReferences(source.oaRaw).map((ref) => ref.main)))];
  return mains.length > 0 ? mains : [UNKNOWN_OA];
}

export function matchingOa(line: OrderLineRow | undefined, oa: string | null): boolean {
  return oa === null || oaKeys(line).includes(oa);
}

export function ProgressOaFilter(props: {
  readonly lines: readonly (OrderLineRow | undefined)[];
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
}) {
  const keys = [...new Set(props.lines.flatMap(oaKeys))].sort();
  return (
    <Select
      aria-label="OA 需求"
      value={props.value ?? ''}
      options={[{ value: '', label: '全部 OA' }, ...keys.map((key) => ({ value: key, label: key === UNKNOWN_OA ? '未关联 OA' : key }))]}
      showSearch={{ optionFilterProp: 'label' }}
      style={progressFilterStyle}
      onChange={(value) => props.onChange(value === '' ? null : value)}
    />
  );
}

export type ProgressOrderOrigin = 'progress' | 'delivery';

export function scopedLineLink(id: string, { search, store, focusLine, focusBatch, origin = 'progress' }: {
  readonly search: string;
  readonly store: ProcurementStore | undefined;
  readonly focusLine?: string;
  readonly focusBatch?: string;
  readonly origin?: ProgressOrderOrigin;
}): string {
  const fromProgress = new URLSearchParams(search);
  if (focusLine !== undefined) fromProgress.set('focusLine', focusLine);
  const params = new URLSearchParams({ [origin === 'delivery' ? 'backToDelivery' : 'backToProgress']: fromProgress.toString() });
  if (store !== undefined) params.set('store', store);
  if (focusBatch !== undefined) params.set('focusBatch', focusBatch);
  return `/lines/${encodeURIComponent(id)}?${params.toString()}`;
}

export function StoreOrderDetails({ line, search, origin = 'progress' }: {
  readonly line: OrderLineRow | undefined;
  readonly search: string;
  readonly origin?: ProgressOrderOrigin;
}) {
  const canReadImport = useCan('imports.read');
  const progress = line?.storeProgress;
  if (line === undefined || progress === undefined) return null;
  const detail = (id: string, children: ReactNode) => origin === 'delivery'
    ? <DeliveryDetailLink id={id} search={search} store={progress.store} focusKey={`delivery:${line.id}:${id}`}>{children}</DeliveryDetailLink>
    : <Link to={scopedLineLink(id, { search, store: progress.store, focusLine: line.id })}>{children}</Link>;
  return (
    <section aria-label="成品与关联采购事项" style={{ overflowWrap: 'anywhere' }}>
      <p>
        {detail(line.id, '成品订单行详情')}
        {' · '}{progressOrderRef(line)}{' · '}{storeLabels[progress.store]}
        {' · '}{line.qtyOrdered === null ? '订单数量未填' : `订单数量 ${amount.format(line.qtyOrdered)}`}
      </p>
      {progress.sources.map((source) => (
        <p key={JSON.stringify([source.importBatchId, source.sheetName, source.rowNo])}>
          成品来源 {canReadImport
            ? <Link to={`/imports/${encodeURIComponent(source.importBatchId)}`}>{sourceText(source)}</Link>
            : sourceText(source)}
        </p>
      ))}
      <Typography.Text strong>关联采购事项（{progress.materials.length}）</Typography.Text>
      {progress.materials.length === 0 ? null : <ul>{progress.materials.map((entry) => (
        <li key={entry.id}>
          {detail(entry.id, [entry.nameRaw, entry.codeRaw, entry.poRaw].filter(Boolean).join(' · ') || '打开采购事项')}
          {' · '}{sourceText(entry.source)}
          {' · '}{materialQuantity(entry)}
          {entry.deliveryProgressRaw === null ? null : ` · 源表交付原文 ${entry.deliveryProgressRaw}`}
        </li>
      ))}</ul>}
    </section>
  );
}

function sourceText(source: StoreProgressMaterial['source']): string {
  return `${source.sheetName} 第 ${source.rowNo} 行`;
}

function materialQuantity(entry: StoreProgressMaterial): string {
  const ordered = entry.quantity === null ? '采购量未填' : `采购量 ${amount.format(entry.quantity)}`;
  const unit = entry.unit ?? '单位未填';
  if (entry.completed) return `${ordered} ${unit} · 源表标为已完结`;
  if (entry.reportedGap !== null) return `${ordered} ${unit} · 源表报告差额 ${amount.format(entry.reportedGap)} ${unit}`;
  return `${ordered} ${unit} · 源表报告差额待核对`;
}

type GapSummary = {
  readonly totals: ReadonlyMap<string, number>;
  readonly pending: number;
  readonly count: number;
};

function groupMaterials(lines: readonly (OrderLineRow | undefined)[]): ReadonlyMap<string, readonly StoreProgressMaterial[]> {
  const byId = new Map<string, StoreProgressMaterial[]>();
  for (const line of lines) for (const item of line?.storeProgress?.materials ?? []) {
    const entries = byId.get(item.id) ?? [];
    entries.push(item);
    byId.set(item.id, entries);
  }
  return byId;
}

export function procurementGapSummary(lines: readonly (OrderLineRow | undefined)[]): GapSummary {
  const byId = groupMaterials(lines);
  const totals = new Map<string, number>();
  let pending = 0;
  for (const entries of byId.values()) {
    const first = entries[0];
    if (first === undefined || entries.every((item) => item.completed)) continue;
    const gap = consistentGap(first, entries);
    if (gap === null) {
      pending++;
      continue;
    }
    totals.set(gap.unit, (totals.get(gap.unit) ?? 0) + gap.quantity);
  }
  return { totals, pending, count: byId.size };
}

function consistentGap(first: StoreProgressMaterial, entries: readonly StoreProgressMaterial[]): { readonly unit: string; readonly quantity: number } | null {
  const { unit, reportedGap } = first;
  if (unit === null || reportedGap === null) return null;
  if (entries.some((item) => item.unit !== unit || item.reportedGap !== reportedGap)) return null;
  return { unit, quantity: reportedGap };
}

export function StoreGapSummary({ lines }: { readonly lines: readonly (OrderLineRow | undefined)[] }) {
  const summary = procurementGapSummary(lines);
  if (summary.count === 0) return null;
  const totals = [...summary.totals].map(([unit, quantity]) => `${amount.format(quantity)} ${unit}`);
  return (
    <Typography.Paragraph aria-label="采购事项汇总" type="secondary" style={{ marginBlock: space[2] }}>
      采购事项 {summary.count} 条
      {totals.length === 0 ? null : ` · 源表报告差额 ${totals.join('、')}`}
      {summary.pending === 0 ? null : ` · 差额待核对 ${summary.pending} 条`}
    </Typography.Paragraph>
  );
}
