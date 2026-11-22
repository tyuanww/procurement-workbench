import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { Actor } from '../shared/actor.js';
import type { NoInput } from '../shared/refs.js';
import type { AssignOwnerInput, OwnerCoverage, OwnerCoverageQueries, OwnerCoverageQuery, PendingOwnerView, ResolvePendingOwnerInput } from './views.js';

type Write = { readonly uow: UnitOfWork; readonly clock: Clock; readonly ids: IdGenerator };

export type AssignOwnerDeps = Write;
export type AssignOwner = (input: AssignOwnerInput, actor: Actor) => Promise<{ readonly updated: number }>;
export type ResolvePendingOwnerDeps = Write;
export type ResolvePendingOwner = (input: ResolvePendingOwnerInput, actor: Actor) => Promise<{ readonly updated: number }>;
export type GetOwnerCoverageDeps = { readonly owners: OwnerCoverageQueries };
export type GetOwnerCoverage = (query: OwnerCoverageQuery, actor: Actor) => Promise<OwnerCoverage>;
export type ListPendingOwnersDeps = { readonly owners: OwnerCoverageQueries };
export type ListPendingOwners = (input: NoInput, actor: Actor) => Promise<{ readonly items: readonly PendingOwnerView[] }>;

export type * from './views.js';
export type { OwnerAssignmentRepository, OwnerRef } from './repository.js';
