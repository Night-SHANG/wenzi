# SDD ledger — plan: docs/superpowers/plans/2026-11-07-settlement.md

Baseline cb414feef8ede9f7486e1be68cc90c1160cd2134; branch feat/settlement-economy; records use Beijing (UTC+08), 2026-11-07. Full v0.8 baseline just delivered and independently verified; public fetch still exact baseline.

## Rulings

- Ruling: User's repeated continuous-batch instruction opts out of repeated design/method/project menus; complete this coherent economy slice through existing authorized publication — risk is reviewable scope rework, so design and boundaries remain explicit.
- Ruling: Keep dedicated clean checkout/new feature branch and existing fixed dependencies; do not duplicate worktrees or rerun unchanged383-test baseline — final exact-content gates cover changes; wrong baseline assumption would invalidate evidence, mitigated by clean public-fetch equality.
- Ruling: Three disjoint implementation lanes run in parallel; Root alone stages/commits and owns shared integration — avoids unnecessary serial waiting; wrong ownership could hide/overwrite files, so review packets and explicit owned paths are required.
- Ruling: Expand noncombat economy using existing crafting/planting/inventory; do not add an automatic production loop or transfer oldmarket private coins — avoids duplicate authorities and step-size-dependent catchup; cost is explicit start/collect operations and a new world identity instead of automatic old-world migration.
- Ruling: Make zero-XP quests usable without progression, while retaining current and frozen nonzero promises — removes a concrete unwanted RPG dependency; a wrong missing-dependency check would lose earned XP, so both catalog and accepted snapshots are tested.

## Preflight conflict scan

| Pair/task | Produced/consumed or internal check | Resolution |
| --- | --- | --- |
|1/2|wallet returns account+coins, price echoes side/item/quantity, shop rules define prices direction.|Use exact contract readers; commerce checks returned and actual before/after values; prices never move funds.|
|3/2|availability query with periodic half-open windows vs trade eligibility.|No events/free replenishment; normal closed quote is unavailable, not invalid world.|
|1/4|Integer wallet vs legacy fractional private market coins.|Newworld initializes explicit accounts/containers; no implicit cross-instance migration.|
|2/4|quote availability vs inventory capacity and binding hints.|View states quote preconditions; actual trade remains authority for capacity/late errors.|
|3/4|Calendar/time pure projection vs ongoing crafting/planting.|Clock belongs to existing time; changing hours never pauses/orders/refunds; exactclock swaps preserve jobs.|
|1|Stock batches crossing target; safe integer price.|Constant-time BigInt arithmetic, no unit loop or fractional currency.|
|2|Only trade counter owned; current catalog always live.|No frozen quotation or duplicate stock/coins; output readbacks/rollback before counter/event commit.|
|3|Unsorted/adjacent windows and week boundary vs closesInSeconds.|Sort/merge valid adjacent windows; reject overlap; wholecycle open returns null; no elapsed-day enumeration.|
|4|Two views/workshops and optional XP migration.|Chain normal text-view wrappers; progression required only where current/frozen nonzero terms promise it; exact1.0/1.1 saves.|

## Work state

Initial design record: primary-code research/recon and hand calculation complete; branch clean before this batch. Builder check, dispatch, implementation and later verification are recorded chronologically below.

Builder check 2026-11-07T13:29:03+08:00: nothing important left; exact existing producers/consumers and boundaries checked. Source research copied to docs/settlement-source-research.md. Three lanes ready; no unresolved interface question.

Ruling: Commerce validates all catalog list/get term consistency but resource references only for its selected shop — other shops may intentionally use separate bound inventory/wallet domains — checking all references would falsely reject valid multi-instance composition.
Dispatch e3ee6ba: Task1 implement_economy_rules_v09; Task2 implement_commerce_v09; Task3 implement_calendar_v09. Root owns Task4; all worker paths disjoint.

Ruling: Once the three implementation lanes finish, split Task4's two world files, integration test and compiled CLI smoke into a disjoint integration lane while Root owns quests, views, registration and docs. Add a small shared text-view-data reader file rather than duplicate reader blocks. Root still owns the index and all aggregate gates. Cost if wrong: interface/binding mismatch; exact public contracts, whole-world tests and independent review cover it.

2026-11-07 13:42 Beijing: Task1 committed 1c60a2e (14 focused tests, scoped types passed); Task3 84276df (13 focused tests); Task2 61d9bdc (28 focused tests, scoped types passed). Three independent task reviews are spec-compliant/quality-approved, no Critical/Important/Minor findings. Calendar review defers paid-job/hour-change composition to Task4; commerce review's host rollback/replay claim is covered by its reported real-host snapshots and will also be exercised by the final full suite. Neither reviewer requested a speculative rerun.

Root zero-XP consumer RED: 7 tests, 2 passed/5 failed before implementation. Combined consumers/quests/party check after implementation: 33/34, sole failure was legacy assertion still expecting journal1.1; corrected to1.2 and exact focused legacy test passed1/1. New text-view tests initial RED was missing-module import (not a behavior assertion); implemented view checks passed5/5. Final Root focused and global evidence follows in reports/progress, without claiming completed external delivery.

2026-11-07 13:50 Beijing: Root consumer/view commit980d889 independently spec/quality approved; world/CLI lane focused9/9 and source syntax check passed, integratede2ff44f. Real world test closes calendar paid-order/opening-hours cannot-verify item. Root view crossscope items are covered by actual21-instance/32-command worlds, parsed bound hints, both clock outcomes and final aggregate gates. Preflight6/6 with459/459 tests and16world runs/restores passed13:49:13; buildexit0; compiled33/33 passed13:50:11. Source/runtime fingerprints archived in settlement-verification.json; no engine/contracts/old14world/dependency changes. Final fresh wholebranch review next. All five implementation reports and four scoped review records are archived in docs/tasks. npm emits existing environment http-proxy warning; no diagnostics from project types or failed behavior tests.
