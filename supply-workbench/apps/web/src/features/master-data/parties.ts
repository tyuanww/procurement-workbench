import { PartyViewSchema, listResponseSchema, type PartyView } from '@sw/contracts';
import { apiGet } from '../../shared/api/client.js';

type PartyRole = 'supplier' | 'factory' | 'own_warehouse';
const PARTY_PAGE_SIZE = 200;
const partyPageSchema = listResponseSchema(PartyViewSchema);

export async function loadPartyOptions(input: {
  readonly role: PartyRole;
}): Promise<{ readonly items: readonly PartyView[]; readonly total: number }> {
  const listed = await partyPage(input.role);
  return { items: listed.items, total: listed.page.total };
}

export async function loadBatchReceivers(): Promise<readonly { readonly id: string; readonly name: string }[]> {
  const [warehouses, factories] = await Promise.all([allParties('own_warehouse'), allParties('factory')]);
  const byId = new Map([...warehouses, ...factories].map((party) => [party.id, { id: party.id, name: party.displayName }]));
  return [...byId.values()];
}

async function allParties(role: PartyRole): Promise<readonly PartyView[]> {
  const first = await partyPage(role);
  const items = [...first.items];
  const lastPage = Math.ceil(first.page.total / first.page.pageSize);
  for (let page = first.page.page + 1; page <= lastPage; page += 1) {
    items.push(...(await partyPage(role, page)).items);
  }
  return items;
}

function partyPage(role: PartyRole, page?: number) {
  const params = new URLSearchParams({ role, pageSize: String(PARTY_PAGE_SIZE) });
  if (page !== undefined) params.set('page', String(page));
  return apiGet(`/api/v1/parties?${params}`, partyPageSchema);
}
