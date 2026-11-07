# SDD ledger — plan: docs/superpowers/plans/2026-11-07-party.md

Recorded 2026-11-07 12:26 Beijing (UTC+08). Branch feat/party-battles; base beec605beb8915d53bf4513a52f0dc79ef0d0606.

## Rulings

- Ruling: Continue the already selected wenzi project and authorized parallel delivery without another project/design/finishing permission menu — user has repeatedly requested this exact continuation — a wrong assumption would cause reviewable feature work, so the design is explicit and repository updates retain a lease.
- Ruling: Dedicated clean checkout plus fresh feature branch preserves established isolation — do not duplicate dependencies/worktrees or rerun unchanged verified318-test baseline — risk is stale assumptions, mitigated by current clean HEAD and final content fingerprints.
- Ruling: Preserve tactics.grid and single-enemy encounters1.x; use party-battle with narrow generic action/records interfaces — actual code shows different HP and spatial semantics — otherwise consumers could silently read false enemy state.
- Ruling: One shared battle-session for the same leader/party, held through all non-null phases; optional in legacy duel, required in squad — independent architecture recon concurs — multiple explicitly misbound sessions cannot coordinate the same actors, so shipped bindings and limitations must be documented/tested.
- Ruling: Share stateless reward transfer code, not a new XP/reward database — inventory/progression remain authorities — wrong extraction would alter old failure behavior, so legacy tests remain and shared return/readback checks are preserved.
- Superseded draft ruling: generic protocols initially took precedence. Independent builder check demonstrated optional capabilities auto-bind, so an explicit legacy binding alone cannot retain legacy routing when both controllers coexist.
- Ruling: Add backward-compatible consumer config battleSource / victorySource, default auto accepts only a unique protocol; explicit source supports mixed worlds — resolves the real auto-binding ambiguity without host changes — omission in a newly mixed world is now a visible assembly/required-reference error rather than silent rerouting. New sample selects new protocols explicitly.
- Ruling: Existing HP recovery is reused via a selected-party-member vitals adapter — no second item-payment/healing implementation — explicit leader and adapter bindings avoid a cycle; malformed or unowned selection must reject.
- Ruling: Parallel user/developer mandate overrides skill sequential default; exact interfaces and disjoint ownership allow three implementation lanes — root alone stages and integrates — tests are focused per owner and global gates are centralized.

## Preflight conflict scan

| Pair / task | Produced vs consumed and internal consistency | Resolution |
| --- | --- | --- |
|1 / 2|Party members provide speed/HP; policy inputs use structured side+ID and safe integers.|Do not concatenate identities; party/enemy equal IDs are valid.|
|1 / 3|party/status/member/damage and battle-session ownership vs battle state.|Battle stores ally IDs only; HP remains party/vitals. Both use exactly one explicit session.|
|2 / 3|squad/get/list, initiative/order, targeting/choose.|External results checked, queue is complete frozen participant permutation, dead actors skipped.|
|1 / 4|vitals-selection/status/member and recovery.items.|Adapter initially targets leader; only recruited actors selectable; root sets explicit bindings.|
|3 / 4|combat-action and encounter-records vs skills/quests.|Legacy shapes retained separately; explicit source selection documented and tested; no fake encounters capability.|
|1|Catalog freeze vs current validation, capacity vs leader exclusion.|No dismiss/recruit heal exploit; state active excludes leader, public active includes leader.|
|2|Strategy swapping vs saved state.|Only accurate empty1.0.0 states migrate, no active queue reordering.|
|3|Terminal health changes vs restore invariants; reward/session lifecycle.|Terminal phase persists after healing; rewards/cooldown/lease clear in one transaction.|
|4|53 definitions/14 worlds vs35instances; legacy migrations vs unchanged old results.|Counts checked from real registry; root owns aggregates and exact complete-route literals.|

## Work state

Initial record (before dispatch): Design/plan written; independent builder check found no ownership/queue blocker; routing ambiguity resolved above and skills targets pinned per skill row. The following completion records supersede that initial state. Source research was completed before worker implementation.


Task2 complete: commit c7a8c54; focused10/10; independent spec/quality approved, no findings. Cross-task warning resolved by real integration tests for unchanged current queue/new next-round policy, late nested rollback, and original-world gates.
Task1 complete: commit2d5ae95; focused16/16; independent spec/quality approved, no findings. Initial RED assembly-scaffold limitation is preserved in the report, not overstated as isolated regressions. Cross-task lifecycle/bindings proven by real world integration; aggregate gates pending.
Task3 complete: commit3bebf97; focused48/48; independent spec/quality approved, no Critical/Important. One Minor for dense new tests accepted for next related edit; no behavior defect or reason to rerun unchanged suites. Root7/7 real-world integration passed against both clocks and literal63-action outcomes.
Ruling: Parallel workers dispatched at8444ddc; root commits disjoint paths individually. Scoped review bases are immediately preceding integration commits (c7a8c54 /2d5ae95), which contain no changes in the current task's owned paths — full lane diffs are preserved without reviewing another lane twice — wrong path isolation would hide changes, so exact commit file lists remain in review packets.
Ruling: Leader attack0 from derived attributes is accepted; companion/enemy catalogs remain positive — existing combat-rule decides positive minimum damage — inconsistent stricter validation would reject a valid modular attribute result. Producer and consumer are aligned and tested.
Ruling: Add optional battle-session consumption to party text view so another controller's ownership also hides roster-change hints; it holds no game state. Extra root test file party-consumers.test.ts isolates generic/legacy routing and migrations without changing legacy fixtures.

Task3 fix round1: first aggregate run had383/383 tests and14worlds but5/6gates; TS2322 in list serialization boundary. Original owner wrapped existing return in identity json helper; tsc exit0; commit3e34682. Independent scoped rereview closed issue with no new findings. Root fresh preflight now6/6,383/383 and14worlds; build exit0. Compiled smoke still running.
Task4 focused complete: consumer38/38, final world10/10; actual late AI failure after enemy write, malformed view fields, strict old view migration added. Root shared code and documentation ready for final whole-branch spec/quality review.

Aggregate gate evidence: 2026-11-07 12:55:27 Beijing Preflight6/6, tests383/383, worlds14; build exit0; built smoke28/28 at2026-11-07T12:55:55+08:00. Fingerprints are stored in artifacts/preflight.json and built-smoke.json. Only docs and review records may change while these remain the published source/runtime bytes.
