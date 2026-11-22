------------------------------ MODULE ScheduleLink ------------------------------
\* 有限模型，不是 TypeScript 实现。两格可同时关联 L；数量和当前工厂不被排产动作改写。
EXTENDS Integers, FiniteSets

Cells == {"c1", "c2"}
NONE == "NONE"

VARIABLES status, link, qty, lineFactory, warning

Sum(st, ln) ==
  (IF ln["c1"] = "L" /\ st["c1"] \in {"linked", "manual"} THEN qty["c1"] ELSE 0)
  + (IF ln["c2"] = "L" /\ st["c2"] \in {"linked", "manual"} THEN qty["c2"] ELSE 0)

Warn(st, ln) == Sum(st, ln) > 10

Init ==
  /\ status = [c \in Cells |-> "unlinked"]
  /\ link = [c \in Cells |-> NONE]
  /\ qty = [c \in Cells |-> 6]
  /\ lineFactory = "F1"
  /\ warning = FALSE

MatchUnique(c) ==
  /\ status[c] \in {"unlinked", "ambiguous"}
  /\ status' = [status EXCEPT ![c] = "linked"]
  /\ link' = [link EXCEPT ![c] = "L"]
  /\ warning' = Warn(status', link')
  /\ UNCHANGED <<qty, lineFactory>>

MatchAmbiguous(c) ==
  /\ status[c] = "unlinked"
  /\ status' = [status EXCEPT ![c] = "ambiguous"]
  /\ link' = [link EXCEPT ![c] = NONE]
  /\ warning' = Warn(status', link')
  /\ UNCHANGED <<qty, lineFactory>>

Manual(c) ==
  /\ status[c] # "manual"
  /\ status' = [status EXCEPT ![c] = "manual"]
  /\ link' = [link EXCEPT ![c] = "L"]
  /\ warning' = Warn(status', link')
  /\ UNCHANGED <<qty, lineFactory>>

Next ==
  \E c \in Cells : MatchUnique(c) \/ MatchAmbiguous(c) \/ Manual(c)

Spec == Init /\ [][Next]_<<status, link, qty, lineFactory, warning>>

AssocOK ==
  \A c \in Cells :
    \/ (status[c] \in {"linked", "manual"} /\ link[c] = "L")
    \/ (status[c] \in {"unlinked", "ambiguous"} /\ link[c] = NONE)

LineFactoryOK == lineFactory = "F1"
QtyOK == qty["c1"] = 6 /\ qty["c2"] = 6
ManualShape == \A c \in Cells : status[c] = "manual" => link[c] = "L"
OverWarn == warning = Warn(status, link)
Inv == AssocOK /\ LineFactoryOK /\ QtyOK /\ ManualShape /\ OverWarn
UniqueCells == Cardinality({c \in Cells : link[c] = "L" /\ status[c] \in {"linked", "manual"}}) <= 1
=============================================================================
