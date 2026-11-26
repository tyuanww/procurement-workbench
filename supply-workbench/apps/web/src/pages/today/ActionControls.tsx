import { Flex, Pagination, Select, Typography, type ModalProps } from 'antd';
import type { TodayPaging, TodaySort, TodayWorkFilter } from '@sw/contracts';
import type { CSSProperties } from 'react';
import { isPriorityBatchSelection, type ChaseScope, type WorkspaceInbox } from './action-query.js';
import type { ChasePreview } from './today-copy.js';

export type ActionPageControls = {
  readonly paging: TodayPaging;
  readonly reasons: readonly string[];
  readonly sort: TodaySort;
  readonly work: TodayWorkFilter | undefined;
  readonly inbox: WorkspaceInbox | undefined;
  readonly calendar: string | undefined;
  readonly isLoading: boolean;
  readonly isFiltered: boolean;
  readonly isSettled: boolean;
  readonly isCopying: boolean;
  readonly copyNotice: string;
  readonly copyPreview?: ChasePreview | null;
  readonly factoryId: string | null;
  readonly loadError: string;
  readonly onPage: (page: number) => void;
  readonly onWork: (work?: TodayWorkFilter) => void;
  readonly onFactory: (id: string) => void;
  readonly onCopyChase: (scope: ChaseScope) => void;
  readonly onConfirmCopy?: () => void;
  readonly onCancelCopy?: () => void;
  readonly onRetry: () => void;
};

export const actionDialogTarget: CSSProperties = { minBlockSize: 44, minInlineSize: 44 };

export const actionDialogStyles: ModalProps['styles'] = {
  close: { inlineSize: 44, blockSize: 44, insetInlineEnd: 12, insetBlockStart: 10 },
  header: { paddingInlineEnd: 44 },
  body: { maxBlockSize: 'min(60dvh, 28rem)', overflowY: 'auto', overscrollBehavior: 'contain' },
  wrapper: { overscrollBehavior: 'contain' },
};

export function SortControls({ sort, units: availableUnits, onSort }: {
  readonly sort: TodaySort;
  readonly units: readonly string[];
  readonly onSort: (sort: TodaySort) => void;
}) {
  const units = sort.kind === 'bulk' ? [...new Set([...availableUnits, sort.unit])] : availableUnits;
  return (
    <Flex gap="small" align="center" wrap>
      <Select<TodaySort['kind']> aria-label="排序" value={sort.kind} virtual={false}
        style={{ ...actionDialogTarget, inlineSize: 194 }}
        options={[
          { value: 'urgency', label: '批次按紧急度' },
          { value: 'bulk', label: '大批优先 · 同单位列表', disabled: units.length === 0 },
        ]}
        onChange={(kind) => {
          if (kind === 'urgency') onSort({ kind });
          else if (units[0] !== undefined) onSort({ kind, unit: units[0] });
        }}
      />
      {sort.kind !== 'bulk' ? null : (
        <Select<string> aria-label="比较单位" value={sort.unit} virtual={units.length > 50}
          style={{ ...actionDialogTarget, inlineSize: 108 }}
          options={units.map((unit) => ({ value: unit, label: unit }))}
          onChange={(unit) => onSort({ kind: 'bulk', unit })}
        />
      )}
    </Flex>
  );
}

export function ActionPagination({ page }: { readonly page: ActionPageControls }) {
  const { paging } = page;
  if (paging.total <= paging.pageSize) return null;
  return (
    <nav aria-label="工作台待办分页">
      <Pagination current={paging.page} pageSize={paging.pageSize} total={paging.total} onChange={page.onPage} size="small" showSizeChanger={false} />
    </nav>
  );
}

export function ActionResult({ page, asOf }: { readonly page: ActionPageControls; readonly asOf?: string | undefined }) {
  const message = actionResultMessage(page, asOf);
  if (message === '') return null;
  return <Typography.Text role="status" type="secondary">{message}</Typography.Text>;
}

function actionResultMessage(page: ActionPageControls, asOf: string | undefined): string {
  if (page.isLoading) return '正在更新待办…';
  if (page.loadError !== '') return '工作台待办更新失败';
  const { paging } = page;
  const hasPages = paging.total > paging.pageSize;
  const day = resultDay(page, asOf);
  const pageLabel = hasPages ? ` · 第 ${paging.page} 页` : '';
  if (day !== undefined) return calendarResultMessage(page, day) + pageLabel;
  if (!page.isFiltered && !hasPages) return '';
  const unit = page.sort.kind === 'bulk' ? `批未发 · 按${page.sort.unit}比较` : resultUnit(page);
  return `${page.isFiltered ? '匹配' : '共'} ${paging.total} ${unit}${pageLabel}`;
}

function calendarResultMessage(page: ActionPageControls, day: string): string {
  const unit = page.inbox === 'scheduled' ? '批' : '项';
  return `${day} · ${page.isFiltered ? '匹配 ' : ''}${page.paging.total} ${unit}`;
}

function resultDay(page: ActionPageControls, asOf: string | undefined): string | undefined {
  if (page.calendar === undefined) return undefined;
  const day = page.calendar === 'today' ? asOf : page.calendar;
  return page.inbox === 'today' && day === asOf ? undefined : day;
}

function resultUnit(page: ActionPageControls): string {
  if (page.work !== undefined) return WORK_RESULT_UNITS[page.work];
  if (page.inbox === 'today' && isPriorityBatchSelection(page.reasons)) return '批';
  return page.inbox === 'scheduled' ? '批已约跟进' : page.isFiltered ? '项' : '项批次与跟进待办';
}

const WORK_RESULT_UNITS: Record<TodayWorkFilter, string> = { factory_chase: '批待催货', internal_note: '批等回单', all_unshipped: '批未发' };

export const workFilterLabels: Readonly<Record<TodayWorkFilter, string>> = {
  factory_chase: '要催货',
  internal_note: '内部等回单',
  all_unshipped: '全部未发',
};
