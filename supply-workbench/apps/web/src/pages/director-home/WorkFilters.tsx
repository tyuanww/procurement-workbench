import { CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Flex, Input, Select, type InputRef } from 'antd';
import { useEffect, useRef } from 'react';
import { space } from '../../theme/tokens.js';
import { SIGNALS, VIEWS, type OwnerLoad, type Signal, type View, type WorkFilter } from './work-register.js';

export function WorkFilters({ owners, filter, onFilter, isSearchOpen, onSearchOpen }: {
  readonly owners: readonly OwnerLoad[]; readonly filter: WorkFilter; readonly onFilter: (filter: WorkFilter) => void;
  readonly isSearchOpen: boolean; readonly onSearchOpen: (open: boolean) => void;
}) {
  return <Flex className="director-filters" wrap align="center" justify="end" gap={space[0]}>
    <Select<View> aria-label="事项范围" value={filter.view} options={Object.entries(VIEWS).map(([value, label]) => ({ value, label }))}
      onChange={(view) => onFilter({ ...filter, view, signal: undefined })} />
    <Select aria-label="筛选采购负责人" placeholder="全部负责人" allowClear value={filter.owner}
      options={owners.map((owner) => ({ value: owner.id, label: owner.name }))}
      onChange={(owner: string | undefined) => onFilter({ ...filter, owner })} />
    <Select aria-label="筛选关注原因" placeholder="全部原因" allowClear value={filter.signal}
      options={Object.entries(SIGNALS).map(([value, label]) => ({ value, label }))}
      onChange={(signal: Signal | undefined) => onFilter({ ...filter, signal, view: signal === undefined ? filter.view : 'watch' })} />
    <WorkSearch value={filter.search} isOpen={isSearchOpen} onOpen={onSearchOpen}
      onChange={(search) => onFilter({ ...filter, search })} />
  </Flex>;
}

function WorkSearch({ value, onChange, isOpen, onOpen }: {
  readonly value: string; readonly onChange: (query: string) => void; readonly isOpen: boolean; readonly onOpen: (open: boolean) => void;
}) {
  const input = useRef<InputRef>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusOnOpen = useRef(false);
  useEffect(() => {
    if (!isOpen || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    input.current?.focus();
  }, [isOpen]);
  const close = () => {
    onOpen(false);
    trigger.current?.focus();
  };
  return <div className="director-work-search" data-open={isOpen}>
    {isOpen && <Input ref={input} aria-label="搜索事项" placeholder="产品、单号、负责人" value={value} allowClear
      onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') close(); }} />}
    <Button ref={trigger} aria-expanded={isOpen} aria-label={isOpen ? '收起事项搜索' : '展开事项搜索'}
      title={isOpen ? '清除并收起搜索' : '搜索事项'} icon={isOpen ? <CloseOutlined /> : <SearchOutlined />}
      onClick={() => {
        if (isOpen) close();
        else { focusOnOpen.current = true; onOpen(true); }
      }} />
  </div>;
}
