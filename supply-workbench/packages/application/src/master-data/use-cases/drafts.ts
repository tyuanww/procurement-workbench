import type { EntityId, Item, ItemKind, Party } from '@sw/domain';

type PartyDraft = {
  readonly displayName: string;
  readonly isSupplier: boolean;
  readonly isFactory: boolean;
  readonly note?: string;
};

export function partyDraft({ id, at, input }: { readonly id: EntityId; readonly at: string; readonly input: PartyDraft }): Party {
  return {
    id,
    createdAt: at,
    updatedAt: at,
    displayName: input.displayName,
    isSupplier: input.isSupplier,
    isFactory: input.isFactory,
    isOwnWarehouse: false,
    note: input.note ?? null,
  };
}

export function itemDraft(input: { readonly id: EntityId; readonly at: string; readonly displayName: string; readonly kind: ItemKind }): Item {
  return { id: input.id, createdAt: input.at, updatedAt: input.at, displayName: input.displayName, kind: input.kind, spec: null, sharedCodeFlag: false };
}
