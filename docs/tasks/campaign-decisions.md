# SDD ledger — plan: docs/superpowers/plans/2026-11-07-campaign.md

Recorded 2026-11-07 00:57 Beijing (UTC+08:00). Branch feat/campaign-loop, base e3b09d81c5edb1d5cae87f91a02db25be51c0848. Latest user steering: continue a substantial parallel batch, do not stop for tiny progress handoffs.

## Rulings

Ruling: The user's explicit continuation and request for AI parallel execution authorizes this cohesive campaign batch without repeated plan/design/execution confirmation — the work is reversible and follows the selected project's goals — changes remain reviewable in branch/spec/history.
Ruling: Three implementers own disjoint new files and root alone stages/commits — user/developer parallelism overrides the skill's sequential-worker default; interfaces are frozen before dispatch — possible cross-contract disagreements are resolved by the spec and actual integration.
Ruling: The existing dedicated checkout plus fresh feature branch provides isolation — main was clean, publicly fetched and matched the exact v0.5 verified tree — do not duplicate dependencies or user history in another linked worktree.
Ruling: Keep v0.5's matching 154-test/6-check/13-runtime baseline evidence; do not re-run the same suite before any change — published source tree was compared exactly — new v0.5 CI remains unqueried, not presumed passing.
Ruling: Reuse shared inventory/location/time/transactions; implement repeatable duel as a separate rule module rather than secretly resetting tactics.grid's immutable roster — direct lifecycle reuse is incompatible — tactical world remains a separate interchangeable gameplay sample.
Ruling: Reference verified Wesnoth/CDDA semantics, independently adapt to TypeScript and the existing host — direct C++ port would import global engine/asset/licensing responsibilities — no copied upstream code/data or added dependencies.
Ruling: Victory rewards remain pending until explicit atomic claim; wins counts claimed completed encounters — prevents full bags from rolling back the killing attack and gives quests a durable single-award counter — quest language must describe completed encounters consistently.
Ruling: Quest requirements freeze at acceptance; delivery checks current bag and victory targets use acceptance baselines — old gains cannot auto-complete repeatable quests — frozen removed encounter targets may require abandon if no further wins are possible.
Ruling: Correct generic CLI/view minors in this batch, with explicit frontier view patch migration — author IDs stay legal across modules instead of adding game-specific restrictions — saved v0.5 empty views must remain restorable.
Ruling: Root integration task's independent spec/quality gate is combined with the fresh whole-branch review; other three tasks retain scoped reviews — avoids duplicate review of identical integration diffs — final reviewer must state both verdicts.
Ruling: Only one full integrated check after all owners and review fixes; focused checks during development — shared evidence files must not race — re-run affected full gates only when their inputs actually change.
Ruling: Existing tested-publication authorization applies; expected main e3b09d8 and force=false; immediately report push and do not poll new CI — user explicitly wants continuous execution, not repeated permission menus — any lease mismatch requires reconciling actual remote changes.

## Preflight conflict scan

| Pair/task | Produced / consumed or internal agreement | Resolution |
| --- | --- | --- |
| 1/2 | progression status/gain and vitals status/damage; values attack/defense/maxHp | Exact fields in spec; Task2 tests valid ordinary contract fixtures until root uses actual providers. |
| 1/3 | progression gain amount and independent derived level | No duplicated XP ledger; rewards call gain only for positive XP. |
| 2/3 | records {wins}; describe current encounter | Counts increment only on successful claim; acceptance baselines and rewind checks explicit. |
| 1,2,3/4 | module exports and all query/command shapes | Root alone owns registry, composed view, world content, CLI and smoke script. |
| 1 | threshold rules, health clamp, item recovery and rollback tests | No auto-heal; lower maxHp rejects, full-heal consumes no item. |
| 2 | terminal battle, movement veto, loot retry, cooldown/frozen catalog tests | Phase and source filtering explicit; victory can travel and return to claim. |
| 3 | state union, prerequisites, repeated quest baselines, frozen terms | Current catalogs validated independently; removed frozen encounters can be abandoned. |
| 4 | JSON command transport, migration, two clocks, numeric final outcome | General parser keeps legacy syntax; composed views consume real providers; no host edits. |

## Tasks

- Task1 progression/vitals/recovery: queued, base initial-spec commit.
- Task2 encounters/combat: queued, base initial-spec commit.
- Task3 quests: queued, base initial-spec commit.
- Task4 root integration: queued; tests/source ownership disjoint.

## Integrated review updates

Task1 implemented at 4901eb7; focused20/20. Task2 implemented at d076e1b; focused15/15 and corrected retreat assertion1/1. Task3 implemented at f4ddc06; focused17/17. Root actual-provider integration7/7 before adding foreign-view regression. Full v0.6 gates remain outstanding.

Task1: fix round1/5 (1 addressed,0 open — manual Unicode ID bounds now agree with idSchema; commits4901eb7..84b7de9). Scoped re-review PASS, with3 focused RED/GREEN regressions.
Task2: initial review PASS; controller identified same concrete manual ID mismatch at encounter-rules.ts:7 and requested a scoped addendum before accepting.
Task3: review FAIL/P2 Unicode code-point mismatch; original implementer resumed for fixround1/5 with local catalog and unrelated inventory-ID regressions.

Ruling: The same manual UTF-16 bound exists in already-published gathering.cooldown/crafting.single, and campaign composition consumes both. Fix the proven shared interoperability defect in a bounded additional task, not a host refactor; preserve public contracts, bump affected module definitions1.0.0→1.0.1 with explicit validated state migration. Add focused actual-provider Unicode and existing-job/cooldown restore regression; do not broaden gameplay scope. Root owns the two view checks separately in Task4.
Ruling: Replace release-evidence tests' giant fake gameplay protocol with explicitly labeled synthetic test-only gate evidence. The unit test isolates stale/missing/failed fingerprint enforcement; actual built-smoke remains the only runtime-release evidence and must execute all18 groups. No production gate is weakened.

Task2: fix round1/5 (1 addressed,0 open — encounter/location/loot Unicode bounds; commitsd076e1b..8204f63). Scoped rereview PASS;7 focused regressions observedRED6fail/1pass→GREEN7/7.
Task3: fix round1/5 (1 addressed,0 open — quest/count/inventory Unicode bounds; commitsf4ddc06..ec93050). Scoped rereview PASS;3 focused regressions observedRED2fail/1pass→GREEN3/3.
Task4: command/earlyJSON/site tests observed3fail then16/16; later18-test execution handle lost, no result claimed. Initial campaign7discoveryfailures then actual-provider7/7. Foreignview readiness added for finalgate. Root Unicodeview regression2fail→2pass; phase-health regression1fail→1pass. Source gates pending.

Extra bounded frontier interoperability task complete1f61e15,14/14focused with distinct migration-requiredRED. Main source frozen.
Integrated gates: 2026-11-07 01:29Beijing Preflight6/6,251/251 tests, strict typecheck and10actualworlds/restores; TypeScriptbuildPASS. No fullgate rerun required absent relevant-input change.
