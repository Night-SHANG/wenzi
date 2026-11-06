# Modular operating systems report

Implemented owned files: `src/modules/farm.ts`, `inventory.ts`, `capacity.ts`, `time.ts`, `growth.ts`, `market.ts`, `farm-view.ts`, and `tests/farm.test.ts`.

## Contract and assumptions

- `farmModules` contains 11 independent definitions: three capacity policies, inventory, two clocks, two growth policies, planting, market, and a public-query-only Chinese text view.
- All definitions use API version 1 and module/capability version 1.0.0. Planting now uses stateVersion 2 for persisted clock baselines; other modules retain stateVersion 1. Capacity, time, and growth policy families explicitly migrate their own compatible alternatives.
- Item measurements are grams, millilitres, and millimetres. Counts and steps are safe integers. Other numbers are finite, nonnegative, and bounded by `Number.MAX_SAFE_INTEGER`; elapsed time and crop duration must be positive where appropriate. Progress stays within [0,1].
- Plot identifiers are nonempty author/player-provided IDs created by planting; occupied plots cannot be replanted and absent plots cannot be harvested. There is no fixed plot catalog in the supplied config contract.
- Crop metadata and market price references are validated through inventory public queries. No system imports another system's private state or writes another owner's state.
- Planting handles only events whose source matches `ctx.provider('time')` and verifies event elapsed time against the bound time query. No wall clock or timer is used.
- Inventory additions/transfers, seed consumption, harvest yield/plot clearing, and sales rely on the host's single synchronous transaction for cross-module rollback.

## Verification outcomes

- Tests were authored before module implementation, using real engine imports and public API. The first two `node --test tests/farm.test.ts` attempts failed before test execution with `ERR_MODULE_NOT_FOUND` because the concurrently implemented `src/engine/index.ts` did not yet exist. These were infrastructure blocks, **not** observed behavioral RED. This sequencing limitation is retained explicitly rather than claiming full red/green TDD.
- Once the real host was available, `node --test tests/farm.test.ts` passed **13/13**, zero skipped, exit 0.
- The full project `npm test` then passed **44/44**, zero skipped, exit 0. This included farm, host, adventure, CLI and storage integration.
- `npm run typecheck` passed after the farm implementation before the latest concurrent adventure edits. The most recent full typecheck failed only in `src/modules/tactics.ts` on the `roll` narrowing at lines 107/119/124 (`JsonValue | undefined`); root was informed. No farm module type errors were reported. This is an integration issue outside this task's ownership, not an unreported clean typecheck.
- Thirteen farm integration cases cover the complete seed/grow/harvest/sale loop, occupied/invalid planting, full harvest rollback, failed transfer rollback, capacity policy units/stacks/physical limits, equal simulated clock duration, time-provider isolation, failed-sale rollback, explicit policy replacement and state retention, invalid numeric inputs, bad config/reference rejection, independent inventory instances, and absent/unripe harvest rollback.

No remaining farm runtime failures were found in these checks. Source loading is for trusted local modules as specified by the design; the host transaction boundary is assumed by module commands and verified by the integration rollback cases.

## Review correction round 1 — queued time and planting order

The independent module review found a real P2 ordering defect. The host correctly queues time events until an outer command completes, while the original planting handler applied each entire event delta to every plot present at delivery. A legitimate outer public command could advance ten seconds, plant a ten-second crop, and finish with a mature crop that had existed for zero seconds.

### Reproduction before the correction

New tests use a trusted orchestration module that only calls the public bound `time` and `planting` capabilities. Before changing production code, the targeted farm suite showed the expected failures:

- `advance(10) → plant(A)` returned progress **1**, expected **0**.
- `advance(2) → plant(A) → advance(2) → plant(B) → advance(2)` returned approximately **0.6 for both plots**, expected **0.4 and 0.2**.
- `plant(A)` followed by a nested `advance(10) → harvest(A) → plant(A)` failed with `CROP_NOT_READY` before queued events were delivered.
- Baseline continuation through save/restore and clock replacement gave the wrong progress.
- Malformed/backward clock values and duplicate/backward events could commit.

After correcting one overly strict floating-point assertion to use a small numerical tolerance, the pre-fix integration run was **15 passed / 6 failed**. The new legacy migration test was then run separately and failed because the original module still declared stateVersion 1. These are observed behavioral RED results against the actual host.

### Correction and temporal contract

Each plot persists its last synchronized `elapsedSeconds`. Planting state also persists the last observed authoritative time and the last delivered event cursor. Plant and harvest synchronize existing plots from their own baselines to the bound clock's public `now` query; a new plot starts at that exact current time. Harvest therefore sees newly elapsed simulation time before checking maturity. Relevant time events synchronize to the authoritative current clock, and earlier queued events cannot apply any elapsed time twice. Plot progress queries retain their public `{id,crop,name,progress}` shape; internal baselines remain owned by planting.

The handler retains `event.source === ctx.provider('time')`. It checks both clock and event number shapes, finite safe bounds, nonnegative authoritative time, positive event deltas, event end not beyond authoritative time, and monotonically increasing delivered event ends. A global observed-time baseline rejects a bound clock going backward. Earlier queued event ends may legitimately precede a plot baseline or the most recently synchronized clock; they are accepted in increasing delivery order and cannot retroactively grow a new or replacement crop. Event start subtraction is deliberately not used for exact floating-point equality, which would falsely reject valid fractional advances such as 0.1 followed by 0.6 seconds.

### Persistence and migration

- Module/capability version remains **1.0.0**; API version remains **1**; planting state format is explicitly **stateVersion 2**.
- Current saves round-trip all plot baselines and both cursors. Compatible step/continuous clock replacement retains them unchanged and continues progress from the right logical second.
- Empty version-1 planting state explicitly migrates to the new empty representation.
- Occupied version-1 plots reject migration with a message explaining their missing clock baseline. Their birth time cannot be recovered from old progress alone. The stated action is to complete harvesting in the old version before saving, or create a new world. No released/user-held version-1 saves exist in this new project, per root's scope clarification.

### Final focused evidence

- `node --test tests/farm.test.ts`: **22/22 passed**, zero skipped, exit 0.
- `npm run typecheck`: **passed**, exit 0.
- Source changes are limited to the owned planting module, farm tests, and this report. No host, CLI, or contract edits were needed. No commits were created.
- The root will run the final complete suite. The earlier **44/44** full-suite result above predates this correction and is not presented as a post-fix full-suite run.
