------------------------------ MODULE ScheduleReview ------------------------------
\* 已自动关联后，重跑不能改订单行，也不能把状态改成未关联。风险是另一个变量。
VARIABLES status, link, review

Init == status = "linked" /\ link = "L" /\ review = FALSE

Disagree == status' = "linked" /\ link' = "L" /\ review' = TRUE

Spec == Init /\ [][Disagree]_<<status, link, review>>

StayLinked == status = "linked" /\ link = "L"
=============================================================================
