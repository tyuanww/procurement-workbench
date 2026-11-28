import { ProcurementCutoff } from '../../../shared/ui/procurement-cutoff.js';
import { useId, useState, type ReactNode } from 'react';
import { Button, Card, Checkbox, Flex, Input, Select } from 'antd';
import type { useSearchParams } from 'react-router';
import { readDesk, writeDesk } from '../../../features/follow-up/index.js';
import { IMPORT_RETURN_PARAM } from '../../../features/imports/index.js';
import { ViewSwitch } from '../../../shared/ui/view-switch.js';
import { space } from '../../../theme/tokens.js';

type SearchSetter = ReturnType<typeof useSearchParams>[1];
type Desk = ReturnType<typeof readDesk>;

export function LineFilters(props: { readonly search: string; readonly desk: Desk; readonly setParams: SearchSetter; readonly isPhone: boolean; readonly arrivalAction: ReactNode; readonly onResults: () => void }) {
  const [isFilterOpen, setFilterOpen] = useState(false);
  const filterId = useId();
  const activeFilterCount = Number(props.desk.stage.kind !== 'all') + Number(props.desk.isOverdue);
  return (
    <search aria-label="跟进中心筛选">
      <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: 12 } }}>
        <Flex align="center" wrap gap={space[2]}>
          <Flex align="center" gap={space[1]} style={{ flex: props.isPhone ? '1 0 100%' : '1 1 320px', minWidth: 0, maxWidth: 420 }}>
            <SearchTerm applied={props.desk.q} onSearch={(value) => props.setParams(writeDesk({ search: props.search, change: { kind: 'text', value } }))} />
            {props.desk.q === '' ? null : <Button type="link" aria-controls="line-search-results" onClick={props.onResults} style={{ paddingInline: space[1] }}>查看结果</Button>}
          </Flex>
          <Flex align="center" wrap gap={space[1]}>
            <ViewSwitch
              aria-label="订单线别"
              value={props.desk.lane}
              options={[{ label: '成品线', value: 'finished' }, { label: '物料线', value: 'material' }, { label: '全部线', value: 'all' }]}
              onChange={(value) => props.setParams(writeDesk({ search: props.search, change: { kind: 'lane', value } }))}
            />
            {props.isPhone ? <Button aria-expanded={isFilterOpen} aria-controls={filterId} onClick={() => setFilterOpen(!isFilterOpen)}>
              {activeFilterCount === 0 ? '筛选' : `筛选（${activeFilterCount}）`}
            </Button> : null}
          </Flex>
          <div id={filterId} hidden={props.isPhone && !isFilterOpen}>
            <Flex align="center" wrap gap={space[2]}>
              <div style={{ width: 152, maxWidth: '100%' }}><StageFilter search={props.search} desk={props.desk} setParams={props.setParams} /></div>
              <OverdueFilter search={props.search} isOverdue={props.desk.isOverdue} setParams={props.setParams} />
            </Flex>
          </div>
          <Flex align="center" wrap gap={space[1]} style={{ marginInlineStart: 'auto' }}>
            <ImportScopeAction search={props.search} setParams={props.setParams} />
            {props.arrivalAction}
          </Flex>
          <ProcurementCutoff />
        </Flex>
      </Card>
    </search>
  );
}

function SearchTerm({ applied, onSearch }: { readonly applied: string; readonly onSearch: (value: string) => void }) {
  const [draft, setDraft] = useState({ applied, value: applied });
  if (draft.applied !== applied) setDraft({ applied, value: applied });
  return <Input.Search
    aria-label="搜索单号、品名或编码"
    placeholder="搜索单号 / 品名 / 编码"
    value={draft.applied === applied ? draft.value : applied}
    onChange={(event) => setDraft({ applied, value: event.target.value })}
    onSearch={onSearch}
    enterButton="搜索"
    allowClear
  />;
}

function ImportScopeAction({ search, setParams }: { readonly search: string; readonly setParams: SearchSetter }) {
  const params = new URLSearchParams(search);
  if (!params.has('importBatchId')) return null;
  return <Button onClick={() => {
    params.delete('importBatchId');
    params.delete(IMPORT_RETURN_PARAM);
    params.delete('page');
    setParams(params);
  }}>退出本次导入范围</Button>;
}

function StageFilter(props: { readonly search: string; readonly desk: Desk; readonly setParams: SearchSetter }) {
  const inputId = useId();
  const selected = props.desk.stageChoices.find((choice) => choice.value === props.desk.stage.value)?.label ?? props.desk.stage.value;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <label htmlFor={inputId} style={{ flexShrink: 0 }}>阶段</label>
    <Select<string>
      id={inputId}
      aria-describedby={`${inputId}-value`}
      value={props.desk.stage.value}
      options={props.desk.stageChoices.map((choice) => ({ value: choice.value, label: choice.label }))}
      onChange={(value) => props.setParams(writeDesk({ search: props.search, change: { kind: 'stage', value } }))}
      style={{ flex: 1, minWidth: 0 }}
    />
    <span id={`${inputId}-value`} hidden>{selected}</span>
  </div>;
}

function OverdueFilter(props: { readonly search: string; readonly isOverdue: boolean; readonly setParams: SearchSetter }) {
  const description = useId();
  return (
    <>
      <Checkbox aria-describedby={description}
        checked={props.isOverdue}
        onChange={(event) => props.setParams(writeDesk({ search: props.search, change: { kind: 'overdue', value: event.target.checked } }))}
      >
        只看逾期
      </Checkbox>
      <span id={description} hidden>只显示含逾期开放批次的订单行</span>
    </>
  );
}
