# TLA+ review: import lifecycle, factory snapshots, OAuth state

Run `sh formal/check.sh`. TLC prints one block per spec.

The tools jar is downloaded into `formal/.tools/tla2tools.jar` and is not committed.

## What each spec checks

| Spec | Models | Invariants checked | Code it maps to |
| --- | --- | --- | --- |
| `ImportLifecycle.tla` | Two actors, two import batches, commands `commit`, `discard`, `rollback`, idempotency keys `actor|batch|command` | `NoDoubleCommit`, `StatusRevision`, `RollbackHasCommit` | `packages/domain/src/imports.ts` `IMPORT_TRANSITIONS`, `packages/application/src/imports/use-cases/commit-import.ts`, `discard-import.ts`, `rollback-import.ts`, `packages/application/src/imports/use-cases/revision.ts` |
| `FactorySnapshot.tla` | Two sources, two fingerprints, four batches; import, duplicate replay, retirement | `NoDuplicateFingerprint`, `AtMostOneActive`, `RetiredNotActive`, `ActiveIsNewest`, `OrderWithinStep` | `packages/persistence/src/migrations/0007_factory_snapshot_sources.sql`, `0009_factory_snapshot_backfill.sql`, `packages/application/src/imports/use-cases/factory-snapshots.ts`, `packages/domain/src/factory-report/snapshots.ts` |
| `OAuthState.tla` | Two states, two nonces, clock ticks, TTL | `ConsumedImpliesValid`, `OneConsumptionPerPair`, `IssuedOnce`, `ExpiredNeverConsumed` | `packages/auth/src/index.ts` `feishuStart`/`feishuCallback`, `packages/persistence/src/repositories/oauth-states.ts` |

## Results (2026-11-09)

| Spec | Distinct states | Result |
| --- | --- | --- |
| `ImportLifecycle` | 81 | no invariant violation |
| `FactorySnapshot` | 897 | no invariant violation |
| `OAuthState` | 184275 | no invariant violation |

The first `FactorySnapshot` run found a real modeling bug in the spec itself, a retired batch could be re-imported. The fix added two guards, a batch may not be reused and retired batches stay retired. The spec now holds those guards as explicit invariants.

## What this does not prove

- TLA+ models the allowed design-level transitions, not a refinement of every line of TypeScript. It does not replace the independent code review or the test suite.
- Database transactions, unique indexes, cookie attributes, HMAC verification and HTTP status codes are assumed to behave as the code and migrations claim. `0012_import_attestation_replay_guard` uniqueness is not modeled here.
- The models use small finite bounds. A larger state space can expose bugs that these bounds miss.
- The spec omits the `decide` transition that stays in `parsed` and only bumps revision. The revision/status invariant covers the transitions that change status.

## Bounds

Configs use `Actors={a1,a2}`, `Batches={b1,b2}` for import lifecycle; two sources, two fingerprints and four batches for factory snapshots; two states, two nonces, TTL 2, `MaxNow=5` for OAuth state.
