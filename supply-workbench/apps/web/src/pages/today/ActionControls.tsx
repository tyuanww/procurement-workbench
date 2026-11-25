import { Button, Flex, Pagination, Select, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { TodayPaging, TodaySort, TodayWorkFilter } from '@sw/contracts';
import type { ChaseScope } from './action-query.js';
import type { FollowUpFilter } from './action-query.js';

export type ActionPageControls = {
  readonly paging: TodayPaging;
  readonly sort: TodaySort;
  readonly work: TodayWorkFilter | undefined;
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

export function ActionControls({ page }: { readonly page: ActionPageControls }) {
  return <SortControls page={page} />;
}

export function ChaseControls({ page }: { readonly page: ActionPageControls }) {
  const counts = page.paging.chaseCounts;
  return (
    <div>
      <Flex className="today-touch" align="center" gap="small" wrap>
        <Button icon={<CopyOutlined aria-hidden />} disabled={page.isCopying || counts?.all === 0} onClick={() => page.onCopyChase({ kind: 'all' })}>
          复制全部催单{counts === undefined ? '' : `（${counts.all} 批）`}
        </Button>
        {page.isFiltered ? <Button icon={<CopyOutlined aria-hidden />} disabled={!page.isSettled || page.isCopying || page.paging.factories.length === 0}
          onClick={() => page.onCopyChase({ kind: 'filtered' })}>复制筛选催单{counts === undefined || !page.isSettled ? '' : `（${counts.filtered} 批）`}</Button> : null}
        <FactoryCopy page={page} />
      </Flex>
    </div>
  );
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
    <nav aria-label="行动板分页">
      <Pagination current={paging.page} pageSize={paging.pageSize} total={paging.total} onChange={page.onPage} size="small" showSizeChanger={false} />
    </nav>
  );
}

export function ActionResult({ page }: { readonly page: ActionPageControls }) {
  const { paging } = page;
  const unit = page.work === 'factory_chase' ? '批待催货' : page.work === 'internal_note' ? '批等回单' : '条待办';
  return <Typography.Text role="status" type="secondary">
    {page.isLoading ? '正在更新行动板…' : page.loadError === '' ? `共 ${paging.total} ${unit}${paging.total > paging.pageSize ? ` · 第 ${paging.page} 页` : ''}` : '行动板更新失败'}
  </Typography.Text>;
}
