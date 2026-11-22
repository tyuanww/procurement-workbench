import { isForbiddenPair } from '@sw/domain';

export function needsForbiddenConfirm(input: { readonly isForbidden: boolean; readonly confirmed: boolean }): boolean {
  return input.isForbidden && !input.confirmed;
}

export function linkNeedsConfirm({ rawName, partyName, confirmed }: { readonly rawName: string; readonly partyName: string; readonly confirmed: boolean }): boolean {
  return needsForbiddenConfirm({ isForbidden: isForbiddenPair(rawName, partyName), confirmed });
}

export function roleChoice(input: { readonly isSupplier: boolean; readonly isFactory: boolean }): { readonly isSupplier: boolean; readonly isFactory: boolean } | null {
  if (!input.isSupplier && !input.isFactory) return null;
  return { isSupplier: input.isSupplier, isFactory: input.isFactory };
}

export function multiNameChoice(mode: 'same_item' | 'shared_code', displayName: string): { readonly mode: 'same_item'; readonly displayName: string } | { readonly mode: 'shared_code' } {
  if (mode === 'shared_code') return { mode: 'shared_code' };
  return { mode: 'same_item', displayName };
}

export const PARTY_TABS = ['aliases', 'orders', 'factory', 'kpis'] as const;
export type PartyTab = (typeof PARTY_TABS)[number];

const PARTY_TAB_LABELS: { readonly [K in PartyTab]: string } = {
  aliases: '别名',
  orders: '订单',
  factory: '代工厂',
  kpis: '指标',
};

export function partyTabLabel(tab: PartyTab): string {
  return PARTY_TAB_LABELS[tab];
}
