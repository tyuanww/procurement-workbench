---- MODULE FactorySnapshot ----
\* Model of factory snapshot sources: one active snapshot per source, duplicate
\* fingerprint replay is a no-op, a newer snapshot retires the previous one.
\* Maps to packages/persistence/src/migrations/0007_factory_snapshot_sources.sql,
\* 0009_factory_snapshot_backfill.sql and
\* packages/application/src/imports/use-cases/factory-snapshots.ts.
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Sources, Fingerprints, Batches

Record == [source: Sources, fingerprint: Fingerprints, batch: Batches, active: BOOLEAN, order: Nat]

VARIABLES records, retired, step

vars == <<records, retired, step>>

TypeOK ==
  /\ records \subseteq Record
  /\ retired \subseteq Batches
  /\ step \in Nat

Init ==
  /\ records = {}
  /\ retired = {}
  /\ step = 0

Import(s, f, b) ==
  LET duplicate == \E r \in records: r.source = s /\ r.fingerprint = f
      previous == {r.batch : r \in {r \in records : r.source = s /\ r.active}}
  IN
    /\ ~duplicate
    /\ b \notin {r.batch : r \in records}
    /\ b \notin retired
    /\ records' =
        {r \in records : ~(r.source = s /\ r.active)}
          \cup {[source |-> s, fingerprint |-> f, batch |-> b, active |-> TRUE, order |-> step + 1]}
    /\ retired' = retired \cup previous
    /\ step' = step + 1

Replay(s, f) ==
  /\ \E r \in records: r.source = s /\ r.fingerprint = f
  /\ UNCHANGED vars

Next ==
  \/ \E s \in Sources, f \in Fingerprints, b \in Batches: Import(s, f, b)
  \/ \E s \in Sources, f \in Fingerprints: Replay(s, f)

\* A given source+fingerprint is imported at most once.
NoDuplicateFingerprint ==
  \A r1 \in records:
    \A r2 \in records:
      (r1.source = r2.source /\ r1.fingerprint = r2.fingerprint) => r1 = r2

\* Each source has at most one active snapshot.
AtMostOneActive ==
  \A s \in Sources:
    Cardinality({r \in records : r.source = s /\ r.active}) <= 1

\* Retired batches never become active again.
RetiredNotActive ==
  \A b \in retired:
    ~\E r \in records: r.batch = b /\ r.active

\* The active snapshot is the newest imported snapshot for its source.
ActiveIsNewest ==
  \A s \in Sources:
    \A r \in records:
      (r.source = s /\ r.active) =>
        \A r2 \in records: r2.source = s => r2.order <= r.order

\* Orders stay within the global step counter.
OrderWithinStep ==
  \A r \in records: r.order <= step

====
