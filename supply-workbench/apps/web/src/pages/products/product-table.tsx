import { Descriptions, Table, type TableColumnsType } from 'antd';
import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { ProductCard } from '@sw/contracts';
import { useShellViewport } from '../../features/shell/index.js';
import { border, brand, space } from '../../theme/tokens.js';
import { CatalogProductLink, filingNameText } from './product-cards.js';

export type ProductColumnSpec = {
  readonly key: string;
  readonly title: string;
  readonly width: number;
  readonly minWidth: number;
  readonly isPhoneHidden: boolean;
  readonly cell: (item: ProductCard) => ReactNode;
};

export const MIN_COLUMN_WIDTH = 88;
export const MAX_COLUMN_WIDTH = 480;
export const KEYBOARD_RESIZE_STEP = space[3];

export const PRODUCT_COLUMN_SPECS: readonly ProductColumnSpec[] = [
  { key: 'skuName', title: '品名', width: 240, minWidth: 160, isPhoneHidden: false, cell: (item) => <CatalogProductLink id={item.id}>{item.skuName}</CatalogProductLink> },
  { key: 'barcodeRaw', title: '条码', width: 160, minWidth: 120, isPhoneHidden: false, cell: (item) => item.barcodeRaw },
  { key: 'filingName', title: '备案名', width: 200, minWidth: 120, isPhoneHidden: true, cell: (item) => filingNameText(item.filingName) },
  { key: 'netContent', title: '净含量', width: 100, minWidth: 80, isPhoneHidden: true, cell: (item) => item.netContent ?? '—' },
  { key: 'casePack', title: '箱规', width: 100, minWidth: 80, isPhoneHidden: true, cell: (item) => item.casePack ?? '—' },
  { key: 'spec', title: '规格', width: 96, minWidth: MIN_COLUMN_WIDTH, isPhoneHidden: true, cell: (item) => (item.isChannelVariant ? '渠道规格' : '标准规格') },
];

export function initialColumnWidths(): Readonly<Record<string, number>> {
  return Object.fromEntries(PRODUCT_COLUMN_SPECS.map((spec) => [spec.key, spec.width]));
}

export function widthOf(widths: Readonly<Record<string, number>>, spec: ProductColumnSpec): number {
  return widths[spec.key] ?? spec.width;
}

export function tableScrollWidth(widths: Readonly<Record<string, number>>): number {
  return PRODUCT_COLUMN_SPECS.reduce((total, spec) => total + widthOf(widths, spec), 0);
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
      styles={{ body: { cell: { overflowWrap: 'anywhere' } } }}
      {...(isPhone ? { expandable: { expandedRowRender: productMobileDetails } } : { scroll: { x: tableScrollWidth(resize.widths) } })}
      columns={columnDefs({ isPhone, resize })}
    />
  );
}

function columnDefs(input: { readonly isPhone: boolean; readonly resize: ColumnResize }): TableColumnsType<ProductCard> {
  const specs = input.isPhone ? PRODUCT_COLUMN_SPECS.filter((spec) => !spec.isPhoneHidden) : PRODUCT_COLUMN_SPECS;
  return specs.map((spec) => ({
    key: spec.key,
    title: input.isPhone ? spec.title : <HeaderTitle spec={spec} resize={input.resize} />,
    ...(input.isPhone ? {} : { width: widthOf(input.resize.widths, spec) }),
    render: (_value: unknown, item: ProductCard) => spec.cell(item),
  }));
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

function productMobileDetails(item: ProductCard): ReactNode {
  const items = PRODUCT_COLUMN_SPECS.filter((spec) => spec.isPhoneHidden)
    .map((spec) => ({ key: spec.key, label: spec.title, children: spec.cell(item) }));
  return <Descriptions size="small" column={1} items={items} />;
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
