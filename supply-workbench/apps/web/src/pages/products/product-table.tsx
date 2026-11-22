import { Descriptions, Table, type TableColumnsType } from 'antd';
import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import type { ProductCard } from '@sw/contracts';
import { useShellViewport } from '../../features/shell/index.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { border, brand, space } from '../../theme/tokens.js';

export type ProductColumnSpec = {
  readonly key: string;
  readonly title: string;
  readonly width: number;
  readonly minWidth: number;
  readonly isPhoneHidden: boolean;
  readonly isNumeric: boolean;
  readonly cell: (item: ProductCard) => ReactNode;
};

export const MIN_COLUMN_WIDTH = 88;
export const MAX_COLUMN_WIDTH = 480;
export const KEYBOARD_RESIZE_STEP = space[3];

export const PRODUCT_COLUMN_SPECS: readonly ProductColumnSpec[] = [
  { key: 'skuName', title: '品名', width: 240, minWidth: 160, isPhoneHidden: false, isNumeric: false, cell: (item) => <Link to={`/products/${item.id}`}>{item.skuName}</Link> },
  { key: 'barcodeRaw', title: '条码', width: 160, minWidth: 120, isPhoneHidden: false, isNumeric: false, cell: (item) => item.barcodeRaw },
  { key: 'filingName', title: '备案名', width: 200, minWidth: 120, isPhoneHidden: true, isNumeric: false, cell: (item) => item.filingName ?? '未备案' },
  { key: 'netContent', title: '净含量', width: 100, minWidth: 80, isPhoneHidden: true, isNumeric: false, cell: (item) => item.netContent ?? '—' },
  { key: 'casePack', title: '箱规', width: 100, minWidth: 80, isPhoneHidden: true, isNumeric: false, cell: (item) => item.casePack ?? '—' },
  { key: 'reportedInProgress', title: '采购中', width: 88, minWidth: MIN_COLUMN_WIDTH, isPhoneHidden: false, isNumeric: true, cell: (item) => formatQuantity(item.openPurchaseLines.reportedInProgress) },
  { key: 'factoryStock', title: '工厂库存', width: 96, minWidth: MIN_COLUMN_WIDTH, isPhoneHidden: false, isNumeric: true, cell: (item) => formatQuantity(item.factoryStock.value) },
  { key: 'bomPartCount', title: 'BOM 子件', width: 96, minWidth: MIN_COLUMN_WIDTH, isPhoneHidden: true, isNumeric: true, cell: (item) => formatQuantity(item.bomPartCount) },
  { key: 'materialCoverage', title: '物料关联', width: 100, minWidth: MIN_COLUMN_WIDTH, isPhoneHidden: true, isNumeric: true, cell: (item) => materialCoverage(item) },
  { key: 'contactsAssigned', title: '联系人', width: 88, minWidth: MIN_COLUMN_WIDTH, isPhoneHidden: true, isNumeric: true, cell: (item) => formatQuantity(item.contactsAssigned) },
  { key: 'spec', title: '规格', width: 96, minWidth: MIN_COLUMN_WIDTH, isPhoneHidden: true, isNumeric: false, cell: (item) => (item.isChannelVariant ? '渠道规格' : '标准规格') },
];

export function initialColumnWidths(): Readonly<Record<string, number>> {
  return Object.fromEntries(PRODUCT_COLUMN_SPECS.map((spec) => [spec.key, spec.width]));
}

export function widthOf(widths: Readonly<Record<string, number>>, spec: ProductColumnSpec): number {
  return widths[spec.key] ?? spec.width;
}

/** 表格最小宽度，按当前列宽和手机端隐藏列计算。 */
export function tableScrollWidth(input: { readonly widths: Readonly<Record<string, number>>; readonly isPhone: boolean }): number {
  return PRODUCT_COLUMN_SPECS.reduce(
    (total, spec) => (input.isPhone && spec.isPhoneHidden ? total : total + widthOf(input.widths, spec)),
    0,
  );
}

export function nextColumnWidth(input: {
  readonly startWidth: number;
  readonly deltaX: number;
  readonly minWidth: number;
}): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(input.minWidth, Math.round(input.startWidth + input.deltaX)));
}

type ColumnDrag = {
  readonly key: string;
  readonly startX: number;
  readonly startWidth: number;
};

export type ColumnResize = {
  readonly widths: Readonly<Record<string, number>>;
  readonly hoverKey: string | null;
  readonly resizingKey: string | null;
  readonly start: (input: { readonly key: string; readonly width: number; readonly clientX: number }) => void;
  readonly move: (clientX: number) => void;
  readonly end: () => void;
  readonly hover: (key: string | null) => void;
  readonly resizeByKey: (input: { readonly key: string; readonly delta: number }) => void;
};

export function useColumnResize(): ColumnResize {
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>(initialColumnWidths);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const drag = useRef<ColumnDrag | null>(null);
  const start = (input: { readonly key: string; readonly width: number; readonly clientX: number }): void => {
    drag.current = { key: input.key, startX: input.clientX, startWidth: input.width };
    setResizingKey(input.key);
  };
  const move = (clientX: number): void => {
    const current = drag.current;
    if (current === null) return;
    setWidths((previous) => ({ ...previous, [current.key]: dragWidth({ current, clientX }) }));
  };
  const end = (): void => {
    drag.current = null;
    setResizingKey(null);
  };
  const resizeByKey = (input: { readonly key: string; readonly delta: number }): void => {
    const spec = specOf(input.key);
    setWidths((previous) => ({
      ...previous,
      [input.key]: nextColumnWidth({ startWidth: previous[input.key] ?? spec.width, deltaX: input.delta, minWidth: spec.minWidth }),
    }));
  };
  return { widths, hoverKey, resizingKey, start, move, end, hover: setHoverKey, resizeByKey };
}

export function ProductTable({ items }: { readonly items: readonly ProductCard[] }): ReactNode {
  const isPhone = useShellViewport().band === 'phone';
  const resize = useColumnResize();
  return (
    <Table<ProductCard>
      rowKey="id"
      size="small"
      tableLayout="fixed"
      dataSource={[...items]}
      pagination={false}
      scroll={{ x: tableScrollWidth({ widths: resize.widths, isPhone }) }}
      {...(isPhone ? { expandable: { expandedRowRender: productMobileDetails } } : {})}
      columns={columnDefs({ isPhone, resize })}
    />
  );
}

function columnDefs(input: { readonly isPhone: boolean; readonly resize: ColumnResize }): TableColumnsType<ProductCard> {
  const columns: TableColumnsType<ProductCard> = PRODUCT_COLUMN_SPECS.map((spec) => ({
    key: spec.key,
    title: input.isPhone ? spec.title : <HeaderTitle spec={spec} resize={input.resize} />,
    width: widthOf(input.resize.widths, spec),
    align: spec.isNumeric ? 'right' : 'left',
    ...(input.isPhone && spec.isPhoneHidden ? { responsive: phoneColumnBreakpoints } : {}),
    render: (_value: unknown, item: ProductCard) => spec.cell(item),
  }));
  return columns;
}

function HeaderTitle(input: { readonly spec: ProductColumnSpec; readonly resize: ColumnResize }): ReactNode {
  return (
    <span style={headerTitleStyle()}>
      <span>{input.spec.title}</span>
      <ResizeHandle spec={input.spec} resize={input.resize} />
    </span>
  );
}

function ResizeHandle(input: { readonly spec: ProductColumnSpec; readonly resize: ColumnResize }): ReactNode {
  const isActive = input.resize.hoverKey === input.spec.key || input.resize.resizingKey === input.spec.key;
  const width = widthOf(input.resize.widths, input.spec);
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`调整${input.spec.title}列宽`}
      aria-valuemin={input.spec.minWidth}
      aria-valuemax={MAX_COLUMN_WIDTH}
      aria-valuenow={width}
      aria-valuetext={`${width} 像素`}
      tabIndex={0}
      style={handleHitStyle(isActive)}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        input.resize.start({ key: input.spec.key, width, clientX: event.clientX });
      }}
      onPointerMove={(event) => input.resize.move(event.clientX)}
      onPointerUp={() => input.resize.end()}
      onPointerCancel={() => input.resize.end()}
      onPointerEnter={() => input.resize.hover(input.spec.key)}
      onPointerLeave={() => input.resize.hover(null)}
      onFocus={() => input.resize.hover(input.spec.key)}
      onBlur={() => input.resize.hover(null)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        input.resize.resizeByKey({
          key: input.spec.key,
          delta: event.key === 'ArrowLeft' ? -KEYBOARD_RESIZE_STEP : KEYBOARD_RESIZE_STEP,
        });
      }}
    >
      <span style={handleBarStyle(isActive)} />
    </span>
  );
}

function dragWidth(input: { readonly current: ColumnDrag; readonly clientX: number }): number {
  const spec = specOf(input.current.key);
  return nextColumnWidth({
    startWidth: input.current.startWidth,
    deltaX: input.clientX - input.current.startX,
    minWidth: spec.minWidth,
  });
}

function specOf(key: string): ProductColumnSpec {
  const found = PRODUCT_COLUMN_SPECS.find((spec) => spec.key === key);
  if (found === undefined) throw new Error(`没有这一列：${key}`);
  return found;
}

function materialCoverage(item: ProductCard): string {
  if (item.materialLinkCoverage === null) return '—';
  return `${item.materialLinkCoverage.linked}/${item.materialLinkCoverage.total}`;
}

const phoneColumnBreakpoints: ('xxl')[] = ['xxl'];

function productMobileDetails(item: ProductCard): ReactNode {
  return (
    <Descriptions size="small" column={1} items={[
      { key: 'filing', label: '备案名', children: item.filingName ?? '未备案' },
      { key: 'net', label: '净含量', children: item.netContent ?? '—' },
      { key: 'case', label: '箱规', children: item.casePack ?? '—' },
      { key: 'bom', label: 'BOM 子件', children: formatQuantity(item.bomPartCount) },
      { key: 'coverage', label: '物料关联', children: materialCoverage(item) },
      { key: 'contacts', label: '联系人', children: formatQuantity(item.contactsAssigned) },
    ]} />
  );
}

function headerTitleStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[1], userSelect: 'none' };
}

function handleHitStyle(isActive: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    width: 12,
    minHeight: 16,
    cursor: 'col-resize',
    touchAction: 'none',
    borderRadius: 2,
    outline: isActive ? `2px solid ${brand[600]}` : 'none',
    outlineOffset: -2,
  };
}

function handleBarStyle(isActive: boolean): CSSProperties {
  return { width: 2, height: 16, borderRadius: 1, background: isActive ? brand[600] : border };
}
