import { Button, Flex, Modal, Pagination, Radio, Select, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { TodayPaging, TodaySort, TodayWorkFilter } from '@sw/contracts';
import { useId, type ReactNode } from 'react';
import type { ChaseScope, WorkspaceInbox } from './action-query.js';
import { focusSection } from './today-focus.js';
import type { ChasePreview } from './today-copy.js';

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
  readonly copyPreview?: ChasePreview | null;
  readonly factoryId: string | null;
  readonly loadError: string;
  readonly onPage: (page: number) => void;
  readonly onSort: (sort: TodaySort) => void;
  readonly onWork: (work?: TodayWorkFilter) => void;
  readonly onFactory: (id: string) => void;
  readonly onCopyChase: (scope: ChaseScope) => void;
  readonly onConfirmCopy?: () => void;
  readonly onCancelCopy?: () => void;
  readonly onRetry: () => void;
};

export function ActionControls({ page, utilityLinks }: {
  readonly page: ActionPageControls | undefined;
  readonly utilityLinks: ReactNode;
}) {
  return <Flex className="today-touch" gap="small" align="center" wrap>
    {utilityLinks}
    {page === undefined || page.inbox === 'scheduled' ? null : <SortControls page={page} />}
  </Flex>;
}

export function ChaseControls({ page }: { readonly page: ActionPageControls }) {
  return <Flex className="today-touch" vertical gap="middle">
    <FactoryCopy page={page} />
    <Flex align="center" gap="small" wrap><ChaseCopyButtons page={page} /></Flex>
  </Flex>;
}

export function ChasePreviewDialog({ page }: { readonly page: ActionPageControls }) {
  const preview = page.copyPreview;
  return <Modal open={preview != null} title="预览跨厂催货汇总" okText="复制内部汇总" cancelText="返回"
    onOk={() => page.onConfirmCopy?.()} onCancel={() => page.onCancelCopy?.()} confirmLoading={page.isCopying}
    cancelButtonProps={{ autoFocus: true }} destroyOnHidden mask={{ closable: false }} focusable={{ trap: true, focusTriggerAfterClose: true }}>
    {preview == null ? null : <>
      <Typography.Paragraph>{preview.scope === 'all' ? '今日可催' : '当前筛选'} · {preview.factories.length} 家工厂 · {preview.count} 批</Typography.Paragraph>
      <ul>{preview.factories.map((factory) => <li key={factory.id}>{factory.name} · {factory.count} 批</li>)}</ul>
      <Typography.Paragraph>汇总供内部核对。发给工厂时，请选择对应工厂复制。</Typography.Paragraph>
    </>}
  </Modal>;
}

function ChaseCopyButtons({ page }: { readonly page: ActionPageControls }) {
  const counts = page.paging.chaseCounts;
  const isFiltered = page.isFiltered || page.calendar !== undefined;
  const filteredCount = page.isSettled ? counts?.filtered : undefined;
  const todayCount = page.work === 'all_unshipped' ? undefined : counts?.all;
  return (
    <>
      <ChaseCopyButton copy={page.onCopyChase} scope="all" label="复制全部可催（今日汇总）" count={todayCount} busy={page.isCopying} />
      {isFiltered ? <ChaseCopyButton copy={page.onCopyChase} scope="filtered"
        label="复制当前范围催单汇总" count={filteredCount} busy={page.isCopying} disabled={!page.isSettled} /> : null}
    </>
  );
}

function ChaseCopyButton({ copy, scope, label, count, busy, disabled }: {
  readonly copy: ActionPageControls['onCopyChase'];
  readonly scope: Extract<ChaseScope, { readonly kind: 'all' | 'filtered' }>['kind'];
  readonly label: string;
  readonly count: number | undefined;
  readonly busy: boolean;
  readonly disabled?: boolean;
}) {
  return <Button size="small" icon={<CopyOutlined aria-hidden />} disabled={disabled || count === 0} aria-busy={busy}
    onClick={() => { if (!busy) copy({ kind: scope }); }}>
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
          { value: 'urgency', label: '批次按紧急度' },
          { value: 'bulk', label: '大批优先 · 同单位列表', disabled: units.length === 0 },
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
  const radioName = useId();
  const { factories } = page.paging;
  const selectedId = factories.find((factory) => factory.id === page.factoryId)?.id ?? null;
  const isFiltered = page.isFiltered || page.calendar !== undefined;
  const isDisabled = !page.isSettled || page.isCopying;
  if (factories.length === 0) return <Typography.Text type="secondary">当前范围没有可催货的工厂</Typography.Text>;
  const options = factories.map(({ id, name, count }) => ({
    value: id,
    label: count === undefined ? name : `${name} · ${count} 批`,
  }));
  return <Flex vertical align="start" gap="small">
    {factories.length > 6
      ? <Select<string> aria-label="催单工厂" placeholder="选择催单工厂" value={selectedId}
        showSearch={{ optionFilterProp: 'label' }} virtual={factories.length > 50} disabled={isDisabled}
        options={options} onChange={page.onFactory} />
      : <Radio.Group className="today-factory-choices" aria-label="催单工厂" name={radioName} value={selectedId} disabled={isDisabled}>
        {options.map(({ value, label }) => <Radio key={value} value={value} onChange={() => page.onFactory(value)}>{label}</Radio>)}
      </Radio.Group>}
    <Button icon={<CopyOutlined aria-hidden />} disabled={isDisabled || selectedId === null} onClick={() => {
      if (selectedId !== null) page.onCopyChase({ kind: 'factory', id: selectedId });
    }}>{isFiltered ? '复制该工厂筛选催单' : '复制该工厂催单'}</Button>
  </Flex>;
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
  return page.inbox === 'scheduled' ? '批已约跟进' : page.isFiltered ? '项' : '项批次与跟进待办';
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
  return <>
    {scopes.filter(({ key, count }) => count !== undefined && (count > 0 || page.work === key)).map(({ key, count }) => (
      <Button key={key} size="small" aria-pressed={page.work === key} onClick={() => {
        page.onWork(key);
        focusSection('today-chase');
      }}>{workFilterLabels[key]} {count} 批</Button>
    ))}
  </>;
}
