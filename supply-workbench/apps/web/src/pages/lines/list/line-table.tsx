import { useSearchParams } from 'react-router';
import { Button, Empty, Table, type TableProps, type TableRef } from 'antd';
import type { OrderLineRow } from '@sw/contracts';
import { parseOrderLineId } from '@sw/domain';
import { lineTableLayout, readDesk, renderedLineColumns, writeDesk, type LineColumnKey } from '../../../features/follow-up/index.js';
import { useShellViewport } from '../../../features/shell/index.js';
import { tablePagination } from '../../../shared/ui/pagination.js';
import { topBar } from '../../../theme/tokens.js';
import { clearFiltersAddress, type Density } from './view-bar.js';
import { previewButtonStyle, renderLineCell } from './line-cell.js';
import { lineMobileColumns, lineMobileDetails, lineMobileIdentifiers, repeatedMobileIdentityIds, type LineMobileInput } from './lines-mobile.js';
import { closeFollowUpPreview, openFollowUpPreview } from './follow-up-preview-url.js';
import type { OpenParty } from './party-preview.js';

type SearchSetter = ReturnType<typeof useSearchParams>[1];
type DeskColumns = ReturnType<typeof readDesk>['columns'];
const scrollRegionClass = 'line-desk-scroll';

export type LineTableProps = {
  readonly columns: DeskColumns;
  readonly rows: readonly OrderLineRow[];
  readonly picked: readonly string[];
  readonly setPicked: (ids: readonly string[]) => void;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly search: string;
  readonly setParams: SearchSetter;
  readonly density: Density;
  readonly hiddenKeys: readonly string[];
  readonly now: Date;
  readonly onOpenParty?: (opened: OpenParty) => void;
  readonly onPreviewTrigger?: ((element: HTMLElement) => void) | undefined;
};

export function LineTable(props: LineTableProps) {
  const layout = lineTableLayout(useShellViewport());
  const shown = renderedLineColumns({ columns: props.columns, hiddenKeys: props.hiddenKeys, layout });
  const mobileInput = layout === 'desk' ? null : mobileOf({ props, layout, shown });
  return (
    <Table<OrderLineRow>
      ref={mobileInput === null ? nameScrollRegion : undefined}
      rowKey="id"
      size={props.density}
      dataSource={[...props.rows]}
      rowSelection={lineSelection(props, mobileInput?.repeatedIdentityIds)}
      {...(mobileInput !== null ? {
        tableLayout: 'fixed' as const,
        expandable: { columnWidth: 32, expandedRowRender: (row: OrderLineRow) => lineMobileDetails(row, mobileInput) },
        styles: { header: { wrapper: { position: 'sticky', top: topBar, zIndex: 4 } } },
      } : {
        scroll: { x: 'max-content' as const },
        classNames: { content: scrollRegionClass },
        styles: {
          content: { maxBlockSize: 'max(18rem, calc(100svh - 18rem))', overflow: 'auto' },
          header: { wrapper: { position: 'sticky', top: 0, zIndex: 4 } },
        },
      })}
      columns={mobileInput !== null ? lineMobileColumns(mobileInput) : desktopColumns(props, shown)}
      locale={{ emptyText: <Empty description="没有符合条件的订单行。下一步：清空筛选。"><Button onClick={() => props.setParams(clearFiltersAddress(props.search))}>清空筛选</Button></Empty> }}
      pagination={deskPagination(props)}
    />
  );
}

function desktopColumns(props: LineTableProps, shown: DeskColumns): NonNullable<TableProps<OrderLineRow>['columns']> {
  const detailSearch = closeFollowUpPreview(props.search).toString();
  return shown.map((column) => ({
    key: column.key,
    title: column.title,
    ...(column.key === 'po' ? { fixed: 'left', rowScope: 'row' } : {}),
    ...(isQtyColumn(column.key) ? { align: 'right' } : {}),
    render: (_value: unknown, row: OrderLineRow) => lineTableCell({
      column: column.key,
      row,
      now: props.now,
      numeric: isQtyColumn(column.key),
      search: props.search,
      detailSearch,
      onPreviewTrigger: props.onPreviewTrigger,
      setParams: props.setParams,
      ...(props.onOpenParty === undefined ? {} : { onOpenParty: props.onOpenParty }),
    }),
  }));
}

function nameScrollRegion(table: TableRef | null) {
  const region = table?.nativeElement.querySelector<HTMLElement>(`.${scrollRegionClass}`);
  if (region === undefined || region === null) return;
  region.tabIndex = 0;
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', '订单明细滚动区');
}

function lineSelection(props: Pick<LineTableProps, 'picked' | 'setPicked'>, repeatedIdentityIds: ReadonlySet<string> | undefined): NonNullable<TableProps<OrderLineRow>['rowSelection']> {
  return {
    selectedRowKeys: [...props.picked],
    onChange: (keys) => props.setPicked(keys.map(String)),
    getTitleCheckboxProps: () => ({ 'aria-label': '勾选本页全部订单行' }),
    getCheckboxProps: (row) => {
      const identifiers = repeatedIdentityIds === undefined ? [row.itemCodeRaw] : lineMobileIdentifiers(row, repeatedIdentityIds);
      const label = [row.nameRaw, row.po.poRaw, ...identifiers].filter(Boolean).join(' ');
      return { 'aria-label': `勾选订单行 ${label || row.id}` };
    },
    ...(repeatedIdentityIds === undefined ? { fixed: true } : { columnWidth: 32 }),
  };
}

type MobileOfInput = {
  readonly props: LineTableProps;
  readonly layout: LineMobileInput['layout'];
  readonly shown: DeskColumns;
};

function mobileOf(input: MobileOfInput): LineMobileInput {
  return {
    columns: input.props.columns,
    shown: input.shown,
    layout: input.layout,
    repeatedIdentityIds: repeatedMobileIdentityIds(input.props.rows),
    now: input.props.now,
    search: input.props.search,
    setParams: input.props.setParams,
    onPreviewTrigger: input.props.onPreviewTrigger,
    ...(input.props.onOpenParty === undefined ? {} : { onOpenParty: input.props.onOpenParty }),
  };
}

function deskPagination(props: Pick<LineTableProps, 'page' | 'pageSize' | 'total' | 'search' | 'setParams'>) {
  return tablePagination({
    page: props.page,
    pageSize: props.pageSize,
    total: props.total,
    onChange: (next) => props.setParams(writeDesk({ search: props.search, change: { kind: 'page', value: next } })),
    onSizeChange: (size) => props.setParams(writeDesk({ search: props.search, change: { kind: 'pageSize', value: size } })),
  });
}

function isQtyColumn(key: string): boolean {
  return key === 'qtyOrdered' || key === 'received' || key === 'factoryDelivered' || key === 'daysInStage';
}

function lineTableCell(input: {
  readonly column: LineColumnKey;
  readonly row: OrderLineRow;
  readonly now: Date;
  readonly numeric: boolean;
  readonly search: string;
  readonly detailSearch: string;
  readonly setParams: SearchSetter;
  readonly onOpenParty?: (opened: OpenParty) => void;
  readonly onPreviewTrigger?: ((element: HTMLElement) => void) | undefined;
}) {
  const body = renderLineCell({
    column: input.column,
    row: input.row,
    now: input.now,
    numeric: input.numeric,
    search: input.detailSearch,
    ...(input.onOpenParty === undefined ? {} : { onOpenParty: input.onOpenParty }),
  });
  if (input.column !== 'po') return body;
  const parsed = parseOrderLineId(input.row.id);
  if (!parsed.ok) return body;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{body}<Button type="link" size="small" style={previewButtonStyle} onClick={(event) => {
    input.onPreviewTrigger?.(event.currentTarget);
    input.setParams(openFollowUpPreview({ search: input.search, lineId: parsed.value }), { preventScrollReset: true });
  }}>预览</Button></span>;
}
