
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { Actor } from '../shared/actor.js';
import type { NoInput } from '../shared/refs.js';
import type { FactoryLinkCounts, FactoryLinkQueries, LineFactoryLinkView, RelinkFactoryRowsResult, SetLineFactoryLinkInput, UnmatchedFactoryRowView } from './views.js';

type Write = { readonly uow: UnitOfWork; readonly clock: Clock; readonly ids: IdGenerator };

export type SetLineFactoryLinkDeps = Write;
export type SetLineFactoryLink = (input: SetLineFactoryLinkInput, actor: Actor) => Promise<{ readonly orderLineId: string }>;
export type RelinkFactoryRowsDeps = Write & { readonly links: FactoryLinkQueries };
export type RelinkFactoryRows = (input: { readonly limit?: number | undefined }, actor: Actor) => Promise<RelinkFactoryRowsResult>;
export type RelinkScheduleCellsDeps = Write & { readonly links: FactoryLinkQueries };
export type RelinkScheduleCells = (input: NoInput, actor: Actor) => Promise<{ readonly scheduleCells: number; readonly linked: number; readonly unlinked: number; readonly ambiguous: number; readonly manual: number; readonly review: number }>;
export type GetLineFactoryLinkDeps = { readonly links: FactoryLinkQueries };
export type GetLineFactoryLink = (input: { readonly orderLineId: string }, actor: Actor) => Promise<LineFactoryLinkView | undefined>;
export type ListUnmatchedFactoryRowsDeps = { readonly links: FactoryLinkQueries };
export type ListUnmatchedFactoryRows = (input: { readonly limit?: number | undefined }, actor: Actor) => Promise<{ readonly items: readonly UnmatchedFactoryRowView[] }>;
export type GetFactoryLinkCountsDeps = { readonly links: FactoryLinkQueries };
export type GetFactoryLinkCounts = (input: NoInput, actor: Actor) => Promise<FactoryLinkCounts>;
export type BackfillSupplierPartiesDeps = Write & { readonly links: FactoryLinkQueries };
export type BackfillSupplierParties = (input: NoInput, actor: Actor) => Promise<{ readonly updated: number }>;

export type * from './views.js';
export type { FactoryRef } from './views.js';
export type { LineFactoryLinkRepository } from './repository.js';
