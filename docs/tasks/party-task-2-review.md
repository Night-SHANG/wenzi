# Task 2 review — 8444ddc..c7a8c54

## Spec Compliance

- ✅ Spec compliant for this task. All four requested implementation/test files appear in the review package, with no engine, contracts, dependency, registry, or shared-document changes. The five definitions expose the requested independent versioned capabilities and stateless schemas: `src/modules/squad-rules.ts:58`, `src/modules/initiative.ts:12`, `src/modules/targeting.ts:10`.
- ✅ Catalog terms and exported types match Task 2. At least one enemy is required, per-encounter enemy IDs are unique, rewards and attributes are bounded, and the public reader validates identity, exact shapes, ranges, and cross-field constraints while copying returned enemy/loot data: `src/modules/squad-rules.ts:5`, `src/modules/squad-rules.ts:24`, `src/modules/squad-rules.ts:33`. Get/list derive the same terms from the same own catalog entries and perform no location or inventory operation: `src/modules/squad-rules.ts:69`, `src/modules/squad-rules.ts:79`.
- ✅ Initiative accepts distinct same-ID actors on opposite sides, rejects duplicates within each side, preserves listed order, and explicitly preserves source order for equal speeds. Its output maps every input actor to exactly its side and ID: `src/modules/initiative.ts:19`, `src/modules/initiative.ts:25`.
- ✅ Targeting validates every candidate before returning, rejects duplicate IDs and HP above maxHp, and selects the first candidate or the minimum absolute HP with stable ties: `src/modules/targeting.ts:7`, `src/modules/targeting.ts:18`.
- ✅ Each policy family accepts only its own explicitly enumerated identities at version 1.0.0/stateVersion 1 with an empty object state; the two families remain independently replaceable: `src/modules/initiative.ts:8`, `src/modules/initiative.ts:30`, `src/modules/targeting.ts:6`, `src/modules/targeting.ts:28`.
- ⚠️ Cannot verify from this task diff: preservation of an already saved battle queue after an initiative swap, complete rollback of downstream battle commands, and legacy-world behavior are consumer/integration responsibilities. The controller should retain the Task 3 and whole-branch gates; these stateless providers do not store a battle queue or issue nested commands (`src/modules/initiative.ts:13`, `src/modules/targeting.ts:11`, `src/modules/squad-rules.ts:61`).

## Strengths

- The ordering implementation sorts a new wrapper array and uses an explicit original-index tiebreaker, keeping both input data and actor identity intact: `src/modules/initiative.ts:25`.
- Runtime catalog validation is exported independently of the concrete provider, so consumers can apply the same complete contract checks to replacement implementations: `src/modules/squad-rules.ts:33`.
- Tests use actual module hosts and literal expected order/target values. They distinguish absolute HP from percentage HP, exercise both policy directions through reconfiguration, check rejected query snapshots, and cover Unicode/own-key boundaries: `tests/battle-policies.test.ts:21`, `tests/battle-policies.test.ts:27`, `tests/battle-policies.test.ts:37`, `tests/battle-policies.test.ts:54`, `tests/battle-policies.test.ts:96`.
- Modules are separated by policy/content responsibility, with small internal factories avoiding duplicate implementations without coupling initiative to targeting: `src/modules/initiative.ts:10`, `src/modules/targeting.ts:8`, `src/modules/squad-rules.ts:58`.

## Issues

### Critical (Must Fix)

- None found.

### Important (Should Fix)

- None found.

### Minor (Nice to Have)

- None found.

## Checks and Evidence Boundaries

- Reviewed the task brief, implementer report, binding design, and complete supplied diff. The first combined tool response truncated the diff, so the diff was displayed separately to finish the single complete review pass; no changed source file was separately reread, and no git command was run.
- Named outside-diff risk: imported shared schemas/predicates could undermine Task 2's Unicode ID, numeric, unknown-field, or own-key guarantees. One focused definition search checked `src/modules/capacity.ts:4`–`13` and `src/modules/encounter-rules.ts:6`–`9`. It confirmed bounded count/seconds schemas, Unicode-code-point runtime ID validation, strict object schemas, own-entry lookup, safe-integer counts, and finite bounded seconds. Existing Unicode host behavior is also exercised by `tests/battle-policies.test.ts:96`.
- No tests were rerun: code inspection raised no concrete unresolved behavior doubt requiring a focused execution. The implementer reports final `node --test tests/battle-policies.test.ts` results of 10 passed/0 failed with no warnings; that is reported evidence, not an independent suite run by this reviewer (`.superpowers/sdd/2026-11-07-party/task-2-report.md`, RED / GREEN evidence).

## Assessment

**Spec compliance:** Approved for Task 2.

**Task quality:** Approved.

**Reasoning:** The implementation meets the specified catalog and policy contracts, keeps state and strategy responsibilities separate, and includes behavioral coverage for the required ordering, targeting, migration, validation, and identity boundaries. No task-scoped correctness or maintainability defect was found; cross-task battle and legacy-world guarantees remain for the controller's integration review.
