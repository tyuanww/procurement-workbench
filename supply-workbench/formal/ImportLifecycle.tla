---- MODULE ImportLifecycle ----
\* Model of import batch lifecycle and idempotent commit/rollback commands.
\* Maps to packages/domain/src/imports.ts IMPORT_TRANSITIONS and
\* packages/application/src/imports/use-cases/{commit,discard,rollback}-import.ts.
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Actors, Batches

Cmd == {"commit", "discard", "rollback"}
Status == {"parsed", "committed", "discarded", "rolled_back"}

VARIABLES status, revision, done, claimed

vars == <<status, revision, done, claimed>>

TypeOK ==
  /\ status \in [Batches -> Status]
  /\ revision \in [Batches -> 0..2]
  /\ done \subseteq {<<a, b, c>> : a \in Actors, b \in Batches, c \in Cmd}
  /\ claimed \subseteq {<<a, b, c>> : a \in Actors, b \in Batches, c \in Cmd}

Init ==
  /\ status = [b \in Batches |-> "parsed"]
  /\ revision = [b \in Batches |-> 0]
  /\ done = {}
  /\ claimed = {}

Commit(a, b) ==
  LET k == <<a, b, "commit">> IN
  /\ k \notin done
  /\ status[b] = "parsed"
  /\ claimed' = claimed \cup {k}
  /\ status' = [status EXCEPT ![b] = "committed"]
  /\ revision' = [revision EXCEPT ![b] = @ + 1]
  /\ done' = done \cup {k}

Discard(a, b) ==
  LET k == <<a, b, "discard">> IN
  /\ k \notin done
  /\ status[b] = "parsed"
  /\ claimed' = claimed \cup {k}
  /\ status' = [status EXCEPT ![b] = "discarded"]
  /\ revision' = [revision EXCEPT ![b] = @ + 1]
  /\ done' = done \cup {k}

Rollback(a, b) ==
  LET k == <<a, b, "rollback">> IN
  /\ k \notin done
  /\ status[b] = "committed"
  /\ claimed' = claimed \cup {k}
  /\ status' = [status EXCEPT ![b] = "rolled_back"]
  /\ revision' = [revision EXCEPT ![b] = @ + 1]
  /\ done' = done \cup {k}

Next ==
  \E a \in Actors, b \in Batches:
    \/ Commit(a, b)
    \/ Discard(a, b)
    \/ Rollback(a, b)

\* A batch can be committed at most once, even with two actors and two keys.
NoDoubleCommit ==
  \A b \in Batches:
    Cardinality({k \in done : k[2] = b /\ k[3] = "commit"}) <= 1

\* Revision and status move together, so a replayed command cannot bump revision.
StatusRevision ==
  \A b \in Batches:
    \/ status[b] = "parsed"     /\ revision[b] = 0
    \/ status[b] = "committed"  /\ revision[b] = 1
    \/ status[b] = "discarded"  /\ revision[b] = 1
    \/ status[b] = "rolled_back" /\ revision[b] = 2

\* Rollback is only reachable after a commit command completed.
RollbackHasCommit ==
  \A b \in Batches:
    status[b] = "rolled_back" =>
      \E a \in Actors: <<a, b, "commit">> \in done

====
