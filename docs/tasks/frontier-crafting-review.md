# crafting：范围审查与修复复审

最终状态：已通过。以下保留初审发现和复审证据。

## 初审

# Task 2 fresh spec and quality review

Reviewed supplied base `3c99678` → head `a1233f6` diff, task brief, implementation report, and the global/production contracts in `docs/superpowers/specs/2026-11-07-frontier-design.md`. Scope is the two production modules and their tests, not whole-branch integration.

## Spec Compliance: Needs fixes

The implementation substantially follows the production contract: separate replaceable recipes/crafting modules; exact manifest and capability versions; public inventory/time/recipes/optional-location dependencies; shared `readSimulationTime`; single frozen paid job; transaction-based stock removal, collection and refund; unrestricted operation without location; and start/collect location checks with cancellation anywhere. The supplied diff contains no engine/contracts/CLI modifications or new dependencies.

One important validation gap allows an accepted reconfiguration to prevent both completion and cancellation of an otherwise valid frozen paid job. This conflicts with the intended invalid-reference rejection and paid-job lifecycle guarantees.

## Strengths

- `src/modules/recipes.ts`: configuration schemas enforce nonempty input/output maps and positive safe counts; catalog lookup uses `own`, and listing uses own entries. Data and production state stay separate.
- `src/modules/crafting.ts`: scaled inputs/outputs and absolute times are frozen before payment, and collect/cancel consume those frozen values without consulting the original recipe. Recipe deletion and ordinary recipe edits therefore preserve paid jobs.
- `src/modules/crafting.ts`: only its own job state is written; inventory mutations use public nested calls and defer clearing the job until all additions succeed. This matches the host transaction model and supports atomic later-item failure.
- External recipe, inventory count/list, and required location identity fields receive runtime checks. Count multiplication is checked as a safe integer; time uses the shared adapter and rejects overflow and additions that cannot advance the completion time.
- `tests/crafting.test.ts`: behavioral assertions inspect real host state/snapshots, covering stock rollback, output/refund capacity failures, prototype-like keys, clock binding/replacement, nested action timing, and frozen orders across restore/reconfiguration. Fixtures expose public capabilities rather than asserting mocked calls.
- The report accurately discloses that initial RED was `ERR_MODULE_NOT_FOUND`, with no behavioral assertion executed. Its later 25-test/typecheck claims are reported evidence, not independently reproduced proof in this review.

## Critical findings

None identified.

## Important findings

### I1 — Active paid jobs bypass current catalog validation, accepting a configuration that blocks both collect and cancel

Location: `src/modules/crafting.ts:67` (`validate` checks the current recipe catalog only in the `else` branch for no active job).

With a valid active job, reconfiguration can introduce another recipe whose output item does not exist. Validation checks only the frozen job items and accepts the new configuration. Both collect and cancel then clear the job; commit-time validation enters the idle branch, discovers the unrelated invalid recipe, and rejects the transaction. The paid job survives, but neither its outputs nor its refund can be obtained until the catalog is repaired through another configuration change.

A focused real-host probe confirmed:

1. Start the standard wood → plank job: succeeds.
2. Add an unrelated recipe with `outputs: { missing: 1 }` through same-version reconfiguration: accepted.
3. Cancel: fails with `UNKNOWN_ITEM` for `missing`.
4. Advance the bound clock by 20 seconds: succeeds.
5. Collect: fails with the same `UNKNOWN_ITEM`; the paid job remains.

Validate the current catalog independently of whether a frozen job exists, while validating the frozen job independently of whether its original recipe still exists. This rejects malformed newly configured recipes at reconfiguration and still permits deleting or changing the original recipe. Add a regression covering active-job reconfiguration with an unrelated invalid recipe, including preservation of the original world's order and its collect/cancel paths after rejection.

## Minor findings

None requiring changes. The import-only initial RED is a disclosed verification limitation, not a new code defect or evidence of behavioral assertions having failed.

## Verification and limits

The supplied diff was read once; only output-truncated portions were recovered. No git commands, source changes, index/branch operations, reported test-suite reruns, or typecheck reruns were performed. One focused unchanged-helper inspection checked the numerical schema and `safeNumber`/`safeCount` semantics in `capacity.ts`. One focused inline real-host probe tested the concrete untested active-job/catalog risk above; it exited successfully and printed the failure outcomes quoted here. Only this requested review report was written.

## Task Quality: Needs fixes

Resolve I1 before approval. The remaining inspected implementation is consistent with the task's modularity, transaction, frozen-state, dependency, and location requirements.


## 修复后复审

# Task 2 scoped re-review — fix round 1

Scope: finding I1 / C1 and fix-introduced breakage only. Reviewed the appended fix report and supplied `c88dc98..a9397b5` diff. The prior Task 2 review remains the baseline; the intervening Task 1 changes are outside this review.

## Finding I1 / C1: ADDRESSED

At `src/modules/crafting.ts:68`, current recipe catalog validation now executes regardless of whether a frozen job exists. Each current recipe is checked for valid shape, duplicate ID, and valid input/output inventory references. The active job still receives its separate frozen-item and time validation immediately above this block.

This closes the reported lifecycle gap: a reconfiguration introducing an unrelated unknown item can no longer be accepted merely because a paid job exists. The fix does not look up the frozen job's original recipe ID. An empty current catalog still passes, so deletion of the original recipe remains compatible with collecting frozen outputs or refunding frozen inputs.

At `tests/crafting.test.ts:188`, the new regression exercises both cancellation and collection: it starts a paid job, introduces an unrelated recipe with an unknown output item, requires an `UNKNOWN_ITEM` reconfiguration failure, compares the original world's complete snapshot, and verifies that the original order can subsequently refund or complete with the expected quantities.

## Fix-introduced findings

None identified. The change removes the conditional exclusion around existing catalog checks; it does not alter job mutation, inventory mutation, clock reading, or recipe lookup semantics.

## Evidence and limits

The implementation report records a behavioral RED of 0 pass / 1 fail (`Missing expected exception`) before the production fix, followed by 26/26 covering tests passing. These are reported executions; this re-review independently inspected the production and regression diff and did not rerun tests, typecheck, or integrated Preflight. No code, index, or branch changes were made. Only this requested review report was written.

## Scoped verdict: Approved

I1 / C1 is addressed, with no fix-introduced blocking issue identified. Integrated verification remains with root.
