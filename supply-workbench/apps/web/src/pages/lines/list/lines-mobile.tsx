import { Button, Descriptions, Typography, type TableColumnsType } from 'antd';
import type { OrderLineRow } from '@sw/contracts';
import { parseOrderLineId } from '@sw/domain';
import { type LineColumnKey, type LineColumnView, type LineTableLayout } from '../../../features/follow-up/index.js';
import { fontSize, space } from '../../../theme/tokens.js';
import { renderLineCell } from './line-cell.js';
import { closeFollowUpPreview, openFollowUpPreview } from './follow-up-preview-url.js';
import type { OpenParty } from './party-preview.js';

export type LineMobileInput = {
  readonly columns: readonly LineColumnView[];
  readonly shown: readonly LineColumnView[];
  readonly repeatedIdentityIds: ReadonlySet<string>;
  readonly layout: Exclude<LineTableLayout, 'desk'>;
  readonly now: Date;
  readonly search: string;
  readonly setParams: (next: URLSearchParams, options?: { readonly preventScrollReset: boolean }) => void;
  readonly onOpenParty?: (opened: OpenParty) => void;
  readonly onPreviewTrigger?: ((element: HTMLElement) => void) | undefined;
};

export function repeatedMobileIdentityIds(rows: readonly OrderLineRow[]): ReadonlySet<string> {
  const firstBySummary = new Map<string, string>();
  const repeated = new Set<string>();
  for (const row of rows) {
    const code = mobileItemCode(row);
    if (!code) continue;
    const summary = JSON.stringify([row.po.poRaw ?? '无单号', mobileProductName(row), code]);
    const firstId = firstBySummary.get(summary);
    if (firstId === undefined) firstBySummary.set(summary, row.id);
    else {
      repeated.add(firstId);
      repeated.add(row.id);
    }
  }
  return repeated;
}

export function lineMobileIdentifiers(row: OrderLineRow, repeatedIdentityIds: ReadonlySet<string>): readonly [string] | readonly [string, string] {
  const code = mobileItemCode(row);
  const lineLabel = `订单行 ${row.id}`;
  if (!code) return [lineLabel];
  const codeLabel = `商品编码 ${code}`;
  return repeatedIdentityIds.has(row.id) ? [codeLabel, lineLabel] : [codeLabel];
}

export function lineMobileColumns(input: LineMobileInput): TableColumnsType<OrderLineRow> {
  const widths: Partial<Record<LineColumnKey, number>> = input.layout === 'narrow'
    ? { stage: 44, nextDue: 52, daysInStage: 32 }
    : { stage: 48, nextDue: 56, daysInStage: 34 };
  return input.shown.map((column) => {
    if (column.key === 'po') return {
      key: column.key,
      title: '采购单号 / 品名',
      align: 'left',
      colSpan: 2,
      onCell: () => ({ colSpan: 2, style: { paddingInline: space[0] } }),
      render: (_value: unknown, row: OrderLineRow) => <MobileLineIdentity row={row} input={input} />,
    };
    if (column.key === 'name') return { key: column.key, colSpan: 0, onCell: () => ({ colSpan: 0 }) };
    return {
      key: column.key,
      title: mobileTitle(column.key, column.title),
      width: widths[column.key] ?? 72,
      align: column.key === 'daysInStage' ? 'right' as const : 'left' as const,
      onCell: () => ({ style: { overflowWrap: 'anywhere' as const } }),
      render: (_value: unknown, row: OrderLineRow) => renderLineCell({ column: column.key, row, now: input.now, numeric: column.key === 'daysInStage' }),
    };
  });
}

export function lineMobileDetails(row: OrderLineRow, input: LineMobileInput) {
  const core = new Set<LineColumnKey>(input.shown.map((column) => column.key));
  const items = input.columns
    .filter((column) => !core.has(column.key))
    .map((column) => ({
      key: column.key,
      label: column.title,
      children: renderLineCell({
        column: column.key,
        row,
        now: input.now,
        numeric: numericKey(column.key),
        touch: true,
        ...(input.onOpenParty === undefined ? {} : { onOpenParty: input.onOpenParty }),
      }),
    }));
  if (!core.has('nextDue')) {
    const due = input.columns.find((column) => column.key === 'nextDue');
    if (due !== undefined) items.unshift({
      key: due.key,
      label: due.title,
      children: renderLineCell({
        column: due.key,
        row,
        now: input.now,
        touch: true,
        ...(input.onOpenParty === undefined ? {} : { onOpenParty: input.onOpenParty }),
      }),
    });
  }
  return <Descriptions size="small" column={1} items={items} />;
}

function mobileTitle(key: LineColumnKey, title: string): string {
  if (key === 'daysInStage') return '停留';
  if (key === 'nextDue') return '到货';
  return title;
}

function numericKey(key: LineColumnKey): boolean {
  return key === 'qtyOrdered' || key === 'received' || key === 'factoryDelivered' || key === 'daysInStage';
}

function MobileLineIdentity({ row, input }: { readonly row: OrderLineRow; readonly input: LineMobileInput }) {
  const parsed = parseOrderLineId(row.id);
  const [identifier, disambiguator] = lineMobileIdentifiers(row, input.repeatedIdentityIds);
  return <div>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: space[0] }}>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{renderLineCell({ column: 'po', row, now: input.now, search: closeFollowUpPreview(input.search).toString() })}</span>
      {parsed.ok ? <Button type="link" size="small" autoInsertSpace={false} style={{ paddingInline: space[0] }} onClick={(event) => {
        input.onPreviewTrigger?.(event.currentTarget);
        input.setParams(openFollowUpPreview({ search: input.search, lineId: parsed.value }), { preventScrollReset: true });
      }}>预览</Button> : null}
    </div>
    <div className="line-mobile-name" style={{ overflowWrap: 'break-word' }}>{mobileProductName(row)}</div>
    <Typography.Text className="line-mobile-identifier" type="secondary" style={{ fontSize: fontSize.meta, overflowWrap: 'anywhere' }}>
      <span>{identifier}</span>
      {disambiguator === undefined ? null : <span style={{ display: 'block' }}>{disambiguator}</span>}
    </Typography.Text>
  </div>;
}

function mobileItemCode(row: OrderLineRow): string | undefined {
  return row.itemCodeRaw?.trim() || row.barcodeRaw?.trim();
}

function mobileProductName(row: OrderLineRow): string {
  return row.nameRaw || '品名未填写';
}
