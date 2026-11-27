import { CloseOutlined, LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, DatePicker, Flex, Input, type InputRef } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { developmentRollingStart, DEVELOPMENT_WINDOW_DAYS, type DevelopmentPeriod } from './product-development-model.js';

const periods = [
  { label: '未来 14 天', value: 'rolling' },
  { label: '月度节点', value: 'month' },
] satisfies readonly { readonly label: string; readonly value: DevelopmentPeriod['kind'] }[];

export function DevelopmentPeriodControls({ period, write, isPhone, actions }: {
  readonly period: DevelopmentPeriod;
  readonly write: (key: string, value: string | null) => void;
  readonly isPhone: boolean;
  readonly actions: ReactNode;
}) {
  const isMonth = period.kind === 'month';
  const anchor = dayjs(period.from);
  const moveTo = (date: Dayjs) => {
    if (isMonth) write('developmentMonth', date.format('YYYY-MM'));
    else {
      const start = developmentRollingStart(date.format('YYYY-MM-DD'));
      if (start !== null) write('developmentFrom', start);
    }
  };
  const moveBy = (direction: -1 | 1) => moveTo(isMonth ? anchor.add(direction, 'month') : anchor.add(direction * DEVELOPMENT_WINDOW_DAYS, 'day'));
  const previous = isMonth ? '上一个月' : '上一个 14 天';
  const next = isMonth ? '下一个月' : '下一个 14 天';
  const dates = <div className="development-period-navigation" title={`${period.from} 至 ${period.to}`}>
    <Button icon={<LeftOutlined aria-hidden />} title={previous} aria-label={previous} onClick={() => moveBy(-1)} />
    <DatePicker className="development-period-picker" picker={isMonth ? 'month' : 'date'}
      aria-label={isMonth ? '选择月份' : '选择 14 天起始日'} value={anchor} inputReadOnly allowClear={false}
      format={isMonth ? 'YYYY-MM' : rangeLabel} onChange={(date) => { if (date !== null) moveTo(date); }} />
    <Button icon={<RightOutlined aria-hidden />} title={next} aria-label={next} onClick={() => moveBy(1)} />
  </div>;
  return <Flex wrap align="center" className="development-period-controls">
    <ViewSwitch<DevelopmentPeriod['kind']> aria-label="查看周期" options={periods} value={period.kind}
      onChange={(value) => write('developmentPeriod', value)} />
    {isPhone ? null : dates}
    {actions}
    {isPhone ? dates : null}
  </Flex>;
}

function rangeLabel(start: Dayjs): string {
  const end = start.add(DEVELOPMENT_WINDOW_DAYS - 1, 'day');
  return `${start.format('MM-DD')} 至 ${end.format('MM-DD')}`;
}

export function DevelopmentSearch({ value, onSearch }: {
  readonly value: string;
  readonly onSearch: (value: string) => void;
}) {
  const { isOpen, id, input, trigger, composing, draft, setDraft, setExpanded, close, toggle } = useSearchDisclosure({ value, onSearch });
  return <div role="search" aria-label="新品项目搜索" className="development-search" data-open={isOpen}>
    <div id={id} className="development-search-field" hidden={!isOpen}>
      <Input ref={input} aria-label="搜索新品项目或节点" placeholder="项目、节点或 OA" value={draft} allowClear maxLength={120}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(event) => { composing.current = false; onSearch(event.currentTarget.value.trim()); }}
        onChange={(event) => {
          const text = event.target.value;
          setExpanded(true);
          setDraft(text);
          if (!composing.current) onSearch(text.trim());
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            close();
          }
        }} />
    </div>
    <Button ref={trigger} aria-controls={id} aria-expanded={isOpen} aria-label={isOpen ? '收起新品搜索' : '展开新品搜索'}
      title={isOpen ? '清除并收起搜索' : '搜索项目或节点'} icon={isOpen ? <CloseOutlined aria-hidden /> : <SearchOutlined aria-hidden />}
      onClick={toggle} />
  </div>;
}


function useSearchDisclosure({ value, onSearch }: { readonly value: string; readonly onSearch: (value: string) => void }) {
  const [isExpanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(value);
  const isOpen = isExpanded || value !== '';
  const id = useId();
  const composing = useRef(false);
  const input = useRef<InputRef>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const shouldFocus = useRef(false);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!isOpen || !shouldFocus.current) return;
    shouldFocus.current = false;
    input.current?.focus();
  }, [isOpen]);

  function close() {
    setExpanded(false);
    setDraft('');
    onSearch('');
    trigger.current?.focus();
  }

  function toggle() {
    if (isOpen) close();
    else {
      shouldFocus.current = true;
      setExpanded(true);
    }
  }

  return { isOpen, id, input, trigger, composing, draft, setDraft, setExpanded, close, toggle };
}
