import type { ProcurementStore } from '@sw/contracts';
import { useState, type ReactNode, type RefObject } from 'react';
import { Link, useLocation, type LinkProps } from 'react-router';
import { deliveryBackAddress, followUpAddress } from '../../features/follow-up/index.js';
import { useDetailFocusLinks, useDetailReturnFocus } from '../../shared/hooks/detail-return-focus.js';

type DeliveryLinkInput = {
  readonly id: string;
  readonly search: string;
  readonly store: ProcurementStore | undefined;
  readonly focusKey: string;
  readonly focusBatch?: string | undefined;
};

export type ProgressOrderLinkProps = Pick<LinkProps, 'to' | 'id' | 'onClick' | 'state'>;

export function DeliveryDetailLink({ children, ...input }: DeliveryLinkInput & { readonly children: ReactNode }) {
  const detailLink = useDeliveryDetailLinks();
  return <Link {...detailLink(input)}>{children}</Link>;
}

export function useDeliveryDetailLinks() {
  const focusLink = useDetailFocusLinks();
  return ({ id, search, store, focusKey, focusBatch }: DeliveryLinkInput): ProgressOrderLinkProps => {
    const source = deliverySourceParams(search);
    const href = new URLSearchParams();
    if (store !== undefined) href.set('store', store);
    href.set('backToDelivery', source.toString());
    href.set('deliveryEntry', focusKey);
    if (focusBatch !== undefined) href.set('focusBatch', focusBatch);
    return { to: followUpAddress(`/lines/${encodeURIComponent(id)}`, href), ...focusLink(deliveryBackAddress(source.toString()), focusKey) };
  };
}

export function useDeliveryReturnFocus({ search, isReady, region }: {
  readonly search: string;
  readonly isReady: boolean;
  readonly region: RefObject<HTMLElement | null>;
}) {
  const { key } = useLocation();
  const [missingAt, setMissingAt] = useState<string | null>(null);
  useDetailReturnFocus(isReady, {
    sourcePath: deliveryBackAddress(deliverySourceParams(search).toString()),
    fallback: { heading: region, onMissing: () => setMissingAt(key) },
  });
  return missingAt === key;
}

function deliverySourceParams(search: string) {
  const source = new URLSearchParams(search);
  source.delete('focusLine');
  return source;
}
