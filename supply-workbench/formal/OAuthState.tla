---- MODULE OAuthState ----
\* Model of Feishu OAuth state consumption: a state/nonce pair is issued once,
\* consumed at most once, only before expiry, and the nonce must match.
\* Maps to packages/auth/src/index.ts (feishuStart/feishuCallback) and
\* packages/persistence/src/repositories/oauth-states.ts.
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS States, Nonces, TTL, MaxNow

IssuedRecord == [state: States, nonce: Nonces, issuedAt: 0..MaxNow, expiresAt: 0..MaxNow + TTL]
ConsumedRecord == [state: States, nonce: Nonces, at: 0..MaxNow]

VARIABLES issued, consumed, now

vars == <<issued, consumed, now>>

TypeOK ==
  /\ issued \subseteq IssuedRecord
  /\ consumed \subseteq ConsumedRecord
  /\ now \in 0..MaxNow

Init ==
  /\ issued = {}
  /\ consumed = {}
  /\ now = 0

Issue(s, n) ==
  /\ ~\E r \in issued: r.state = s /\ r.nonce = n
  /\ issued' = issued \cup {[state |-> s, nonce |-> n, issuedAt |-> now, expiresAt |-> now + TTL]}
  /\ UNCHANGED <<consumed, now>>

Consume(s, n) ==
  /\ \E r \in issued: r.state = s /\ r.nonce = n /\ r.expiresAt > now
  /\ ~\E c \in consumed: c.state = s /\ c.nonce = n
  /\ consumed' = consumed \cup {[state |-> s, nonce |-> n, at |-> now]}
  /\ UNCHANGED <<issued, now>>

Tick ==
  /\ now < MaxNow
  /\ now' = now + 1
  /\ UNCHANGED <<issued, consumed>>

Next ==
  \/ \E s \in States, n \in Nonces: Issue(s, n)
  \/ \E s \in States, n \in Nonces: Consume(s, n)
  \/ Tick

\* Every consumption maps to a matching issued state/nonce, issued before use and unexpired.
ConsumedImpliesValid ==
  \A c \in consumed:
    \E r \in issued:
      r.state = c.state /\ r.nonce = c.nonce /\ r.issuedAt <= c.at /\ c.at < r.expiresAt

\* A state/nonce pair is consumed at most once.
OneConsumptionPerPair ==
  \A c1 \in consumed:
    \A c2 \in consumed:
      (c1.state = c2.state /\ c1.nonce = c2.nonce) => c1 = c2

\* A state/nonce pair is issued at most once.
IssuedOnce ==
  \A r1 \in issued:
    \A r2 \in issued:
      (r1.state = r2.state /\ r1.nonce = r2.nonce) => r1 = r2

\* An expired pair is never consumed.
ExpiredNeverConsumed ==
  \A c \in consumed:
    \A r \in issued:
      (r.state = c.state /\ r.nonce = c.nonce) => c.at < r.expiresAt

====
