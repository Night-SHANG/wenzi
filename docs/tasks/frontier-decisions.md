# v0.5 执行决定

记录：2026-11-07 00:39 北京时间（UTC+08:00）。这些决定用于在已有授权下继续执行；设计规范与实际测试优先，尚未完成的能力不视为已交付。

Ruling: Continue the selected wenzi project and make routine design/implementation decisions without another confirmation — current explicit continuation and prior repository authorization cover this batch — cost if wrong is reversible code/data rework.

Ruling: Use the existing dedicated scratch checkout with a fresh feature branch, keeping main untouched until tested publication — this checkout contains no unrelated user work and the previous session already established this arrangement — separate linked worktrees would only duplicate installed state.

Ruling: Baseline is the exact clean main SHA already checked locally with 104 tests and now remotely by run 42246209860 (Ubuntu and Windows both success) — no input changed — repeating the same full baseline suite gives no new evidence.

Ruling: Parallel implementers own disjoint new module/test files; root alone controls git index and commits — user/global §27 requires useful parallelism and the interfaces are fixed — typechecking/full integration waits until both owners have delivered.

Ruling: Task 1 owns the tiny shared time adapter; Task 2 may author recipes/tests concurrently but coordinates adapter availability before its GREEN run — no duplicate clock parser — cost is a small bounded dependency wait.

Ruling: Focused TDD per owner; one complete Preflight at root after integration — avoids overlapping report fingerprints and tests against another worker's incomplete files — root must name any suite failure before publication.

Ruling: Formal visual gate does not apply to this existing plain CLI view extension — no graphical UI/style is being introduced — later browser UI still requires visual sample approval.

Ruling: Source references inform production semantics; existing runtime/inventory/time code is the reused implementation — direct Widelands engine port adds incompatible authorities/license scope — document that distinction, no copied third-party code or game data.

Ruling: User's existing GitHub publication authorization covers tested main update; use connector expected_sha and force=false, immediately report then do not poll new Actions — prevents silent overwrite and long waiting.

Ruling: Task 2 DONE_WITH_CONCERNS is a test-process observation, not a claim that 20 assertions failed or a discovered correctness issue — accept the truthful report and retain it for review rather than fabricate historical TDD evidence — final whole-branch tests still gate publication.

Ruling: View also queries recipes so authors can discover recipe IDs and actual command examples without hardcoding this world's content — this is a presentation-only dependency — update spec before view integration.

Ruling: Update existing authoring discovery test to assert new capabilities instead of a fixed module count, and extend release-evidence's isolated CLI protocol fixture for new smoke routes — these are consumers changed by this batch, not optional test expansion — real compiled gameplay is separately verified.

Ruling: Task3's root integration is reviewed in the fresh whole-branch review together with the full spec, instead of adding a duplicate review seat for the same integration diff — the two disjoint module tasks already have independent scoped gates — reviewer must explicitly assess Task3 requirements.

Ruling: Validate the current recipe catalog independently of the frozen paid job in every validation, without looking up the old recipe ID — bad new data must reject at reconfiguration, while removing or changing valid recipes must preserve existing orders — clarifies the spec's reference-validation intent and prevents newly trapped orders.

Ruling: Accept the final review's three Minor presentation/CLI findings as disclosed alpha follow-ups — the reviewer reproduced no state mutation or failure in valid built-in worlds, and the generic CLI is outside this batch's edits — record their precise limits rather than imply arbitrary CLI IDs or malformed provider displays are fully handled; all source and archive delivery gates still apply.
