import { CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Form, Input, Select, Space, type InputRef } from 'antd';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { LocalDate } from '@sw/domain';
import { statusOptions, type ScheduleOptions, type ScheduleQuery, type ScheduleWindow } from '../../features/progress/index.js';
import { useShellViewport } from '../../features/shell/index.js';
import { isWorkItemStatus, workItemStatusLabel } from '../../features/today/index.js';
import { ScheduleWindowControls } from './schedule-window-controls.js';
import type { PlanningScope } from './planning-rows.js';

export type PlanningToolbarSlots = {
  readonly resultCount: string;
  readonly managementLink: ReactNode;
};

type Filters = PlanningToolbarSlots & {
  readonly scope: PlanningScope;
  readonly storePicker: ReactNode;
  readonly storeLabel: string;
  readonly hasStoreFilter: boolean;
  readonly keyword: string;
  readonly query: ScheduleQuery;
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly options: ScheduleOptions;
  readonly onSearch: (value: string) => void;
  readonly onQuery: (query: ScheduleQuery) => void;
  readonly clear: () => void;
  readonly context?: ReactNode;
};

const filterDefinitions = [
  { key: 'status', label: '状态', isExtra: false },
  { key: 'ownerUserId', label: '负责人', isExtra: false },
  { key: 'supplierPartyId', label: '供应商', isExtra: true },
  { key: 'factoryPartyId', label: '工厂', isExtra: true },
] as const satisfies readonly { readonly key: keyof ScheduleQuery['filters']; readonly label: string; readonly isExtra: boolean }[];

const workItemStatuses = [...statusOptions(), { value: 'done', label: workItemStatusLabel('done') },
  { value: 'cancelled', label: workItemStatusLabel('cancelled') }];

type FilterState = ReturnType<typeof usePlanningFilterState>;
type SearchState = ReturnType<typeof usePlanningSearch>;

export function PlanningFilters(props: Filters): ReactNode {
  const { storeLabel, hasStoreFilter, keyword, query, window, today, onSearch, onQuery, context, managementLink, resultCount } = props;
  const isPhone = useShellViewport().band === 'phone';
  const filters = usePlanningFilterState(props, isPhone);
  const search = usePlanningSearch(keyword);
  const searchToggle = <Button ref={search.trigger} className="planning-search-toggle" htmlType="button" icon={<SearchOutlined aria-hidden="true" />}
    aria-label="搜索排期" aria-controls={search.id} aria-expanded={search.isOpen} onClick={search.toggle}>{isPhone ? '搜索' : '搜索排期'}</Button>;
  const reset = <FilterReset state={filters} clear={props.clear} hasStoreFilter={hasStoreFilter} keyword={keyword} />;
  const summary = <div className="planning-toolbar-summary">
    {managementLink}
    <span className="planning-result-context">{isPhone ? null : <span>{storeLabel}</span>}
      <span className="planning-result-summary" role="status">{resultCount}</span></span>
  </div>;
  const applied = <AppliedFilters state={filters} keyword={keyword} onClearSearch={() => { search.focus(); onSearch(''); }} />;
  return <div className="planning-toolbox" data-compact={isPhone} ref={filters.root}>
    <div className="planning-toolbar-layout">
      <div className="planning-filters">
        <DirectFilters storePicker={props.storePicker} state={filters} search={isPhone ? searchToggle : null} />
        <ScheduleWindowControls className="planning-period" label="排期刻度" scale={query.scale} window={window} today={today}
          onScale={(scale) => onQuery({ ...query, scale })} onAnchor={(anchor) => onQuery({ ...query, anchor })} />
        {isPhone ? null : <>{searchToggle}{reset}</>}
        {context}
      </div>
      {isPhone ? null : summary}
    </div>
    {filters.hasMore ? <ExtraFilters state={filters} reset={isPhone ? reset : null} /> : null}
    <SearchField state={search} onSearch={onSearch} scope={props.scope} />
    {isPhone ? <div className="planning-compact-summary">{applied}{summary}</div> : applied}
  </div>;
}

function FilterReset({ state, clear, hasStoreFilter, keyword }: Pick<Filters, 'clear' | 'hasStoreFilter' | 'keyword'> & {
  readonly state: FilterState;
}) {
  if (!hasStoreFilter && keyword === '' && state.selected.length === 0) return null;
  return <Button type="link" size="small" onClick={() => {
    if (state.isPhone) state.moreTrigger.current?.focus();
    clear();
  }}>清空筛选</Button>;
}

function usePlanningFilterState({ query, options, scope, onQuery }: Pick<Filters, 'query' | 'options' | 'scope' | 'onQuery'>, isPhone: boolean) {
  const [isMoreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const root = useRef<HTMLDivElement>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const values = query.filters;
  const choices = { status: workItemStatuses, ownerUserId: options.owners, supplierPartyId: options.suppliers, factoryPartyId: options.factories };
  const hasSupplyFilters = scope !== 'development';
  const hasMore = isPhone || hasSupplyFilters;
  const selected = filterDefinitions.flatMap(({ key, label, isExtra }) => {
    const value = values[key];
    if (value === null || !hasSupplyFilters && isExtra) return [];
    const name = choices[key].find((option) => option.value === value)?.label ?? '已选';
    return [{ key, label, name, isExtra: isPhone || isExtra }];
  });
  const extraCount = selected.filter((entry) => entry.isExtra).length;
  const update = (patch: Partial<ScheduleQuery['filters']>) => onQuery({ ...query, filters: { ...values, ...patch } });
  const remove = ({ key, label, isExtra }: (typeof selected)[number]) => {
    if (isExtra && !isMoreOpen) moreTrigger.current?.focus();
    else root.current?.querySelector<HTMLElement>(`[role="combobox"][aria-label="${label}"]`)?.focus();
    update({ [key]: null });
  };
  return { values, choices, selected, root, moreTrigger, moreId, isMoreOpen, hasMore, hasSupplyFilters, isPhone, extraCount, update, remove,
    toggleMore: () => setMoreOpen((open) => !open) };
}

function DirectFilters({ storePicker, state, search }: { readonly storePicker: ReactNode; readonly state: FilterState; readonly search: ReactNode }) {
  const { hasMore, isPhone, moreTrigger, moreId, isMoreOpen, toggleMore, extraCount } = state;
  return <div className="planning-direct-filters" role="group" aria-label="排期筛选">
    {storePicker}
    {isPhone ? search : <CommonFilters state={state} />}
    {hasMore ? <Button ref={moreTrigger} aria-controls={moreId} aria-expanded={isMoreOpen} onClick={toggleMore}>
      更多筛选{extraCount > 0 ? ` · ${extraCount}` : ''}
    </Button> : null}
  </div>;
}

function CommonFilters({ state: { values, choices, update } }: { readonly state: FilterState }) {
  return <>
    <FilterSelect label="状态" value={values.status} options={choices.status}
      onChange={(value) => update({ status: value !== null && isWorkItemStatus(value) ? value : null })} />
    <FilterSelect label="负责人" value={values.ownerUserId} options={choices.ownerUserId} onChange={(value) => update({ ownerUserId: value })} />
  </>;
}

function ExtraFilters({ state, reset }: { readonly state: FilterState; readonly reset: ReactNode }): ReactNode {
  const { values, choices, moreId, isMoreOpen, update, isPhone, hasSupplyFilters } = state;
  return <div id={moreId} className="planning-extra-filters" role="group" aria-label="更多筛选条件" hidden={!isMoreOpen}>
    {isPhone ? <CommonFilters state={state} /> : null}
    {hasSupplyFilters ? <>
      <FilterSelect label="供应商" value={values.supplierPartyId} options={choices.supplierPartyId}
        onChange={(value) => update({ supplierPartyId: value })} />
      <FilterSelect label="工厂" value={values.factoryPartyId} options={choices.factoryPartyId}
        onChange={(value) => update({ factoryPartyId: value })} />
    </> : null}
    {reset}
  </div>;
}

function AppliedFilters({ state, keyword, onClearSearch }: {
  readonly state: FilterState; readonly keyword: string; readonly onClearSearch: () => void;
}): ReactNode {
  if (state.selected.length === 0 && keyword === '') return null;
  return <div className="planning-applied-filters" role="group" aria-label="已用筛选">
    {state.selected.map((filter) => <Button key={filter.key} size="small" icon={<CloseOutlined />}
      aria-label={`清除${filter.label}筛选 ${filter.name}`} onClick={() => state.remove(filter)}>
      {filter.label} · {filter.name}
    </Button>)}
    {keyword !== '' ? <Button size="small" icon={<CloseOutlined />} aria-label={`清除搜索 ${keyword}`} onClick={onClearSearch}>
      搜索 · {keyword}
    </Button> : null}
  </div>;
}

function usePlanningSearch(value: string) {
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const id = useId();
  const input = useRef<InputRef>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (isOpen) input.current?.focus();
  }, [isOpen]);
  const close = () => {
    setDraft(value);
    setOpen(false);
    trigger.current?.focus();
  };
  const toggle = () => { if (isOpen) close(); else setOpen(true); };
  const focus = () => (isOpen ? input.current : trigger.current)?.focus();
  return { id, isOpen, draft, setDraft, input, trigger, close, toggle, focus };
}

function SearchField({ state, onSearch, scope }: {
  readonly state: SearchState; readonly onSearch: (value: string) => void; readonly scope: PlanningScope;
}): ReactNode {
  const { id, isOpen, draft, setDraft, input, close } = state;
  return <Form id={id} role="search" className="planning-search" hidden={!isOpen}
    onFinish={() => onSearch(draft.trim())}
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
      event.preventDefault();
      close();
    }}>
    <Space.Compact block>
      <Input ref={input} name="planSearch" aria-label="搜索排期" value={draft}
        placeholder={scope === 'development' ? '项目、节点、OA 或 PO' : '品名、OA、PO 或任务'}
        allowClear onChange={(event) => setDraft(event.target.value)} onClear={() => onSearch('')} />
      <Button type="primary" htmlType="submit">搜索</Button>
    </Space.Compact>
  </Form>;
}

function FilterSelect({ label, value, options, onChange }: {
  readonly label: string;
  readonly value: string | null;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string | null) => void;
}) {
  const items = [{ value: '', label: `全部${label}` }, ...options];
  if (value !== null && !items.some((entry) => entry.value === value)) items.push({ value, label: `已选${label}` });
  return <Select aria-label={label} value={value ?? ''} options={items} virtual={false}
    classNames={{ popup: { listItem: 'planning-filter-option' } }}
    onChange={(selected) => onChange(selected === '' ? null : selected)} />;
}
