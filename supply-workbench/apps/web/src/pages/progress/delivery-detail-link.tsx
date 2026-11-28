import type { ProcurementStore } from '@sw/contracts';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { deliveryBackAddress } from '../../features/follow-up/index.js';
import { useDetailFocusLink } from '../../shared/hooks/detail-return-focus.js';

export function DeliveryDetailLink({ id, search, store, focusKey, focusBatch, children }: {
  readonly id: string;
  readonly search: string;
  readonly store: ProcurementStore;
  readonly focusKey: string;
  readonly focusBatch?: string | undefined;
  readonly children: ReactNode;
}) {
  const source = new URLSearchParams(search);
  source.delete('focusLine');
  const href = new URLSearchParams({ store, backToDelivery: source.toString() });
  if (focusBatch !== undefined) href.set('focusBatch', focusBatch);
  const link = useDetailFocusLink(deliveryBackAddress(source.toString()), focusKey);
  return <Link to={`/lines/${encodeURIComponent(id)}?${href}`} {...link}>{children}</Link>;
}
