import { Button, Flex, Pagination, Select, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { TodayPaging, TodaySort, TodayWorkFilter } from '@sw/contracts';
import type { ReactNode } from 'react';
import type { ChaseScope, WorkspaceInbox } from './action-query.js';
import type { FollowUpFilter } from './action-query.js';
import { focusSection } from './today-focus.js';

export type ActionPageControls = {
  readonly paging: TodayPaging;
  readonly sort: TodaySort;
  readonly work: TodayWorkFilter | undefined;
  readonly inbox: WorkspaceInbox | undefined;
  readonly calendar: string | undefined;
  readonly isLoading: boolean;
  readonly isFiltered: boolean;
  readonly isSettled: boolean;
  readonly isCopying: boolean;
  readonly copyNotice: string;
  readonly factoryId: string | null;
  readonly loadError: string;
  readonly onPage: (page: number) => void;
  readonly onSort: (sort: TodaySort) => void;
  readonly onWork: (work?: TodayWorkFilter) => void;
  readonly onFactory: (id: string) => void;
  readonly onFollowUp: (reason: FollowUpFilter) => void;
  readonly onCopyChase: (scope: ChaseScope) => void;
  readonly onRetry: () => void;
};

export function ActionControls({ page, utilityLinks, isNarrow = false }: {
  readonly page: ActionPageControls | undefined;
  readonly utilityLinks: ReactNode;
  readonly isNarrow?: boolean;
}) {
  const canFilterBatch = isNarrow && page?.inbox === 'today' && page.work !== 'all_unshipped';
  return <div className={isNarrow ? 'today-controls-narrow' : 'today-controls-wide'}>
    <Flex className="today-touch" gap="small" align="center" wrap>
      {utilityLinks}
      {page === undefined || page.inbox === 'scheduled' ? null : <SortControls page={page} />}
      {canFilterBatch ? <BatchLinks page={page} /> : null}
    </Flex>
  </div>;
}

export function ChaseControls({ page }: { readonly page: ActionPageControls }) {
  return <Flex className="today-touch" align="center" gap="small" wrap>
    <ChaseCopyButtons page={page} />
    <FactoryCopy page={page} />
  </Flex>;
}

function ChaseCopyButtons({ page }: { readonly page: ActionPageControls }) {
  const counts = page.paging.chaseCounts;
  const isFiltered = page.isFiltered || page.calendar !== undefined;
  const filteredCount = page.isSettled ? counts?.filtered : undefined;
  const todayCount = page.work === 'all_unshipped' ? undefined : counts?.all;
  return (
    <>
      <ChaseCopyButton copy={page.onCopyChase} scope="all" label="复制全部可催（今日）" count={todayCount} disabled={page.isCopying} />
      {isFiltered ? <ChaseCopyButton copy={page.onCopyChase} scope="filtered"
        label="复制当前范围催单" count={filteredCount} disabled={page.isCopying || !page.isSettled} /> : null}
    </>
  );
}

function ChaseCopyButton({ copy, scope, label, count, disabled }: {
  readonly copy: ActionPageControls['onCopyChase'];
  readonly scope: Extract<ChaseScope, { readonly kind: 'all' | 'filtered' }>['kind'];
  readonly label: string;
  readonly count: number | undefined;
  readonly disabled: boolean;
}) {
  return <Button icon={<CopyOutlined aria-hidden />} disabled={disabled || count === 0} onClick={() => copy({ kind: scope })}>
    {label}{count === undefined ? '' : `（${count} 批）`}
  </Button>;
}

function SortControls({ page }: { readonly page: ActionPageControls }) {
  const { sort, paging, onSort } = page;
  const selected = sort.kind === 'bulk' ? sort.unit : undefined;
  const units = selected === undefined ? paging.units : [...new Set([...paging.units, selected])];
  return (
    <>
      <Select<TodaySort['kind']> aria-label="排序" size="small" value={sort.kind} virtual={false}
        options={[
          { value: 'urgency', label: '紧急优先' },
          { value: 'bulk', label: '大批优先', disabled: units.length === 0 },
        ]}
        onChange={(kind) => {
          if (kind === 'urgency') onSort({ kind });
          else if (units[0] !== undefined) onSort({ kind, unit: units[0] });
        }}
      />
      {sort.kind !== 'bulk' ? null : (
        <Select<string> aria-label="比较单位" size="small" value={sort.unit} virtual={units.length > 50}
          options={units.map((unit) => ({ value: unit, label: unit }))}
          onChange={(unit) => onSort({ kind: 'bulk', unit })}
        />
      )}
    </>
  );
}

function FactoryCopy({ page }: { readonly page: ActionPageControls }) {
  const { factories } = page.paging;
  const selected = factories.find((factory) => factory.id === page.factoryId) ?? (factories.length === 1 ? factories[0] : undefined);
  const isDisabled = !page.isSettled || page.isCopying;
  return (
    <>
      <Select<string> aria-label="催单工厂" placeholder="选择催单工厂" value={selected?.id ?? null} size="small" virtual={factories.length > 50}
        disabled={factories.length === 0 || isDisabled} options={factories.map(({ id, name }) => ({ value: id, label: name }))}
        onChange={page.onFactory}
      />
      <Button size="small" icon={<CopyOutlined aria-hidden />} disabled={isDisabled || selected === undefined} onClick={() => { if (selected !== undefined) page.onCopyChase({ kind: 'factory', id: selected.id }); }}>
        {page.isFiltered ? '复制该工厂筛选催单' : '复制该工厂催单'}
      </Button>
    </>
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

export function ActionResult({ page }: { readonly page: ActionPageControls }) {
  const message = actionResultMessage(page);
  if (message === '') return null;
  return <Typography.Text role="status" type="secondary">{message}</Typography.Text>;
}

function actionResultMessage(page: ActionPageControls): string {
  if (page.isLoading) return '正在更新待办…';
  if (page.loadError !== '') return '工作台待办更新失败';
  const { paging } = page;
  const hasPages = paging.total > paging.pageSize;
  if (!page.isFiltered && !hasPages) return '';
  const unit = page.work === undefined ? (page.inbox === 'scheduled' ? '批已约跟进' : '项批次与跟进待办') : WORK_RESULT_UNITS[page.work];
  return `共 ${paging.total} ${unit}${hasPages ? ` · 第 ${paging.page} 页` : ''}`;
}

const WORK_RESULT_UNITS: Record<TodayWorkFilter, string> = { factory_chase: '批待催货', internal_note: '批等回单', all_unshipped: '批未发' };

export const workFilterLabels: Readonly<Record<TodayWorkFilter, string>> = {
  factory_chase: '要催货',
  internal_note: '内部等回单',
  all_unshipped: '全部未发',
};

export function BatchLinks({ page }: { readonly page: ActionPageControls }) {
  const scopes: readonly { key: TodayWorkFilter; count: number | undefined }[] = [
    { key: 'factory_chase', count: page.paging.chaseCounts?.all },
    { key: 'internal_note', count: page.paging.internalNoteCount },
  ];
  const due = page.paging.followUpCounts?.due ?? 0;
  return <>
    {scopes.filter(({ key, count }) => count !== undefined && (count > 0 || page.work === key)).map(({ key, count }) => (
      <Button key={key} size="small" aria-pressed={page.work === key} onClick={() => {
        page.onWork(key);
        focusSection('today-chase');
      }}>{workFilterLabels[key]} {count} 批</Button>
    ))}
    {due === 0 ? null : <Button size="small" onClick={() => {
      page.onFollowUp('follow_up_due');
      focusSection('today-chase');
    }}>到时跟进 {due} 批</Button>}
  </>;
}
