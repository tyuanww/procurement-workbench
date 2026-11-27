import { Select } from 'antd';
import type { CSSProperties } from 'react';
import { ProcurementStoreSchema, type ProcurementStore } from '@sw/contracts';
import { progressFilterStyle } from './store-order.js';
import { storeLabels } from './store-query.js';

const STORE_OPTIONS = Object.keys(storeLabels).map((key) => {
  const value = ProcurementStoreSchema.parse(key);
  return { value, label: storeLabels[value] };
});

export function ProgressStorePicker({ value, onChange, includeUnassigned = true, style = progressFilterStyle }: {
  readonly value: ProcurementStore | null;
  readonly onChange: (value: ProcurementStore) => void;
  readonly includeUnassigned?: boolean;
  readonly style?: CSSProperties;
}) {
  return <Select<ProcurementStore>
    aria-label="店铺"
    value={value}
    placeholder="请选择店铺范围"
    options={includeUnassigned ? STORE_OPTIONS : STORE_OPTIONS.filter((option) => option.value !== 'unassigned')}
    style={style}
    onChange={onChange}
  />;
}

export function ProgressOrderScopePicker({ value, onChange }: {
  readonly value: 'all' | 'mine' | null;
  readonly onChange: (value: 'all' | 'mine') => void;
}) {
  return <Select<'all' | 'mine'>
    aria-label="事项范围"
    value={value}
    placeholder="请选择事项范围"
    options={[{ value: 'all', label: '全部事项' }, { value: 'mine', label: '我的事项' }]}
    style={progressFilterStyle}
    onChange={onChange}
  />;
}
