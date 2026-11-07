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

Design/plan written; independent builder check found no ownership/queue blocker; routing ambiguity resolved above and skills targets pinned per skill row. Source research pending before implementation dispatch. No production changes yet. Current source baseline remains beec605 with clean new branch apart from these records.
