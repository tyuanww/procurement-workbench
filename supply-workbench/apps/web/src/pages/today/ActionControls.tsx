import { Button, Flex, Pagination, Select, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { TodayPaging, TodaySort } from '@sw/contracts';

export type ActionPageControls = {
  readonly paging: TodayPaging;
  readonly sort: TodaySort;
  readonly isLoading: boolean;
  readonly isSettled: boolean;
  readonly isCopying: boolean;
  readonly copyNotice: string;
  readonly factoryId: string | null;
  readonly loadError: string;
  readonly onPage: (page: number) => void;
  readonly onSort: (sort: TodaySort) => void;
  readonly onFactory: (id: string) => void;
  readonly onCopyChase: (factoryId?: string) => void;
  readonly onRetry: () => void;
};

export function ActionControls({ page }: { readonly page: ActionPageControls }) {
  return (
    <div>
      <Flex align="center" gap="small" wrap>
        <SortControls page={page} />
        <CopyControls page={page} />
      </Flex>
      <Typography.Text role="status">{page.copyNotice}</Typography.Text>
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

function CopyControls({ page }: { readonly page: ActionPageControls }) {
  const { factories } = page.paging;
  const selected = factories.find((factory) => factory.id === page.factoryId) ?? (factories.length === 1 ? factories[0] : undefined);
  const isDisabled = !page.isSettled || page.isCopying;
  return (
    <>
      <Button size="small" icon={<CopyOutlined aria-hidden />} disabled={isDisabled || factories.length === 0} onClick={() => page.onCopyChase()}>
        复制全部催单
      </Button>
      <Select<string> aria-label="催单工厂" placeholder="选择催单工厂" value={selected?.id ?? null} size="small" virtual={factories.length > 50}
        disabled={factories.length === 0 || page.isCopying} options={factories.map(({ id, name }) => ({ value: id, label: name }))}
        onChange={page.onFactory}
      />
      <Button size="small" icon={<CopyOutlined aria-hidden />} disabled={isDisabled || selected === undefined} onClick={() => { if (selected !== undefined) page.onCopyChase(selected.id); }}>
        复制该工厂催单
      </Button>
    </>
  );
}

export function ActionPagination({ page }: { readonly page: ActionPageControls }) {
  const { paging } = page;
  return (
    <Flex align="center" justify="space-between" gap="small" wrap>
      <Typography.Text role="status">
        {page.isLoading ? '正在更新行动板…' : page.loadError === '' ? `共 ${paging.total} 条 · 第 ${paging.page} 页` : '行动板更新失败'}
      </Typography.Text>
      <nav aria-label="行动板分页">
        <Pagination current={paging.page} pageSize={paging.pageSize} total={paging.total} onChange={page.onPage} size="small" showSizeChanger={false} hideOnSinglePage />
      </nav>
    </Flex>
  );
}
