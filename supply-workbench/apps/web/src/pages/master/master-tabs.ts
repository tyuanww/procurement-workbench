import { writeUrlState } from '../../shared/hooks/url-state.js';

export const MASTER_TABS = [
  { key: 'aliases', label: '别名审核' },
  { key: 'multi', label: '一号多名' },
  { key: 'owner-map', label: '负责人映射' },
  { key: 'factory-link', label: '工厂关联' },
] as const;

export type MasterTabKey = (typeof MASTER_TABS)[number]['key'];

export function masterTabOf(value: string | null): MasterTabKey {
  if (value === 'unlinked') return 'factory-link';
  const found = MASTER_TABS.find((item) => item.key === value);
  return found === undefined ? 'aliases' : found.key;
}

export function writeMasterTab(search: string, key: MasterTabKey): URLSearchParams {
  return new URLSearchParams(writeUrlState(search, { tab: key === 'aliases' ? null : key }));
}
