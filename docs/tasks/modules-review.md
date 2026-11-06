# Tasks 2 and 3 — independent module review

Review date: 2026-11-06. Scope: `docs/tasks/farm.md`, `docs/tasks/adventure.md`, `docs/design.md`, the provider lookup clarification in `src/contracts.ts`, both module reports, `.superpowers/sdd/2026-11-06-runtime/review-modules.patch`, and the current module and integration-test sources. Host code was read only to establish transaction/event delivery semantics.

This review changed no implementation or tests and did not stage or commit files. The existing reported evidence is 13 farm tests, 9 adventure tests and 44 whole-project tests passing, plus the corrected current typecheck. Those results were supplied to the reviewer and corroborated by reading the tests; the suites were not rerun. The fresh execution described below is a focused independent defect reproduction, not a claim to have rerun the suites.

## Task 2 verdict: changes requested

The family has the intended independent capacity, inventory, clock, growth, planting, market and text-view definitions. Public capability boundaries, resource rollback, ordinary replacement and unrelated-clock isolation meet the specified architecture. One reproducible ordering defect remains in crop growth when legitimate nested public calls combine clock advancement and planting in one transaction.

### P2 — queued elapsed time grows a crop planted after that time elapsed

**Location:** `src/modules/farm.ts:24–28` and `src/modules/farm.ts:37–44`.

`plant` creates only `{crop, progress: 0}`. The time handler later applies the entire event `deltaSeconds` to every plot present when the queue is drained. The host intentionally executes nested calls synchronously and drains queued events after the outer command finishes (`src/engine/index.ts:337–348`). Consequently a public orchestration module can call:

```ts
ctx.call('time', 'advance', {seconds: 10});
ctx.call('planting', 'plant', {plot: 'A', crop: 'wheat'});
```

A crop with `durationSeconds: 10` is already mature when that one dispatch commits, although it was planted at elapsed time 10 and no later time was advanced. This also affects a replacement crop planted into a cleared plot while earlier clock events are queued. It is not dependent on spoofed event sources or private state access: the event comes from the correctly bound built-in clock.

**Fresh reproduction:** `node /tmp/text-world-modules-review-probe.ts`, exit 0. The temporary script imported the real engine and `farmModules`, registered one trusted module requiring the public `time` and `planting` capabilities, and created separate fresh worlds for the two orders. Actual output:

```text
advanceThenPlant {"plots":[{"id":"A","crop":"wheat","name":"麦","progress":1}]}
plantThenAdvance {"plots":[{"id":"A","crop":"wheat","name":"麦","progress":1}]}
```

The first case should retain progress 0; the second should reach progress 1. Existing separate-dispatch clock/growth tests do not exercise this distinction. This violates the promised explicit simulation-time semantics and the task's requirement to retain the clock state needed for correct growth.

**Required correction:** retain an authoritative bound-clock baseline for each newly planted plot (or equivalent state that distinguishes its birth time), and apply only the intersection between each queued elapsed interval and time during which that plot existed. Preserve the baseline across save/restore and compatible time-module replacement. Keep provider identity checking and the growth-rule capability call. Do not alter host queue ordering to fix this one gameplay module. Add focused regressions for advance→plant, plant→advance and multiple clock advances around planting within one outer transaction; include a save/restore or replacement continuation when adding the baseline state.

### Task 2 checks with no additional finding

| Area | Review result |
| --- | --- |
| Module ownership and capabilities | Separate definitions expose the named versioned capabilities. Modules write only their own state. Inventory, growth, time and market coordination uses context calls/queries. Text rendering uses public queries. |
| Capacity semantics | Slot counting uses distinct positive item IDs. Physical totals use per-item g/ml quantities and longest mm dimension; combined applies both. Zero-count items do not consume capacity. Derived physical totals reject overflow. |
| Inventory validity and atomicity | Count schemas require safe integers; validation rejects unknown state item/container references and validates capacity. Transfers mutate a detached candidate, then validate. Host rollback preserves both containers on failure. Independent inventory instances bind explicitly. |
| Plant/harvest/sale rollback | Seed removal, yield insertion/plot deletion and sale removal/coin credit share the host transaction. Existing tests compare whole snapshots for failed transfer/harvest and failed sale. Unknown/occupied/unripe operations reject before a successful commit. |
| Numeric limits | Counts, steps, elapsed time, dimensions, prices and coins have finite safe numeric bounds. Clock addition detects no-op precision loss. Quantity products and sums are checked; plot progress is bounded to [0,1]. |
| Collection limits | Farm identifiers have length 1–128. Maps, plot count and capacity query item arrays have no explicit maximum collection size. They are trusted local sample content, and the task does not promise a memory/CPU quota. This is an explicit operational limitation, not evidence of a current correctness defect. |
| Clock replacement | Both time definitions explicitly accept each other's version-1 state. Ordinary replacement preserves elapsed seconds; the existing replacement test also retains inventory and plot progress. |
| Growth/capacity replacement | Both compatible families explicitly migrate their stateless representation. The integration test changes all three policy families and continues harvesting with retained state. |
| Provider isolation | `ctx.provider('time')` is used directly, without assuming an instance name. Events from the other clock are ignored. The handler reads the bound clock. The P2 issue above concerns time within the correct provider's event queue. |
| World validation | Config/state/input schemas reject extra fields and bad shapes; inventory capacity and crop/price item references are checked through public queries at assembly/commit/restore. |

## Task 3 verdict: approved for the specified architecture sample

No actionable defect was found in the requested random, tactics, narrative and text-view behavior after inspection of the patch, current source and existing nine integration tests. This is a scoped code-review conclusion; no additional whole-project test run is claimed.

| Area | Review result |
| --- | --- |
| Public boundaries | Tactics depends only on random; narrative has no time/inventory dependency. Both views read rule capabilities. The sample does not add gameplay kinds to the host. |
| RNG correctness | xorshift32's 13/17/5 transitions use unsigned output. Safe integer seeds are explicitly reduced modulo 2^32, with a documented nonzero replacement for zero. Saved nonzero uint32 state preserves the stream. Only the RNG module writes it. |
| Failure and RNG rollback | Illegal actions reject before drawing. A successful attack draws exactly once, including hitChance 0. Invalid provider values fail through `TACTICS_RANDOM`. Existing tests cover nested draw→failure rollback and malformed-provider rollback. |
| Movement | Destination bounds, living occupancy, acting side, alive status and remaining Manhattan movement allowance are checked. A move to the same square is rejected. Movement and attack expenditure remain independent. |
| Attack and turns | Target must be a living adjacent enemy. `acted` prevents a second attack in the same turn. Damage cannot make HP negative. Switching side increments the turn and resets incoming units. Winner detection guards further move/attack/endTurn after a reachable victory. |
| Tactical world/state validation | Duplicate IDs and occupied initial positions reject assembly. Coordinates must fit width/height. State retains the exact unit set, fixed name/side/damage/hitChance, HP upper bound and movement upper bound; living occupancy is revalidated. |
| Numeric/collection bounds | Width/height are 1–1000; all integral state/counters/HP/damage/movement fields have safe integer bounds; hitChance is [0,1]. State schema failure rolls back an overflowing turn. Unique initial occupied cells imply at most width×height valid units, although no array `maxItems` rejects an oversized input before validation. Narrative graph/choice counts and text lengths are not explicitly capped. These are author-content/scale limits, not a sandbox guarantee. |
| Narrative validity | Own-property lookup validates start/current nodes and next references. Choice IDs are unique within each node. Invalid choices fail; valid choices increment visits and emit the expected event. Safe visits bounds are enforced by the state schema. |
| Views and independence | Chinese plain text includes the tactical grid, living units, acting side and result, or the narrative scene and choices. Arbitrary module identities work through declared public capabilities. |

## Behaviors deliberately not raised as defects

- **No fixed catalog of plot IDs:** the provided planting config has no plot list. Creating a nonempty player/author plot ID, rejecting occupied IDs and rejecting unknown harvest IDs is a documented and coherent contract interpretation.
- **Movement can cross intervening occupied cells and can reach diagonal destinations at their Manhattan cost:** the task specifies Manhattan distance and an empty destination. It explicitly does not promise pathfinding, terrain or obstacle traversal rules; requiring these would expand the sample.
- **Enemy commands use the same API rather than AI:** this is expressly allowed. A manually operated opposing side is enough to prove a distinct rules family.
- **Single-side tactical configs begin terminal:** the task does not require both sides in authored content. Immediate victory for the sole living side is coherent. An all-dead hand-edited snapshot is not a naturally reachable battle outcome; introducing draw semantics is not required by the given winner union or command set.
- **Dead units keep coordinates and do not occupy cells:** this preserves records while allowing living units to enter their former cells, as explicitly documented.
- **No exhaustive historical validity proof on restored state:** validators enforce declared shape and cross-reference invariants. They are not intended to replay all past actions or authenticate an editor's save file.
- **No stress testing, economy balance, real timers, multiplayer transfer, graphics UI or hostile-code isolation:** the design explicitly scopes these samples to trusted local modules and a single synchronous host. Their absence does not block either task's architectural objective.
- **Initial test runs failed before assertions because the engine did not exist:** both reports disclose this as infrastructure failure rather than behavioral RED. The later concrete behavior evidence is separately recorded, so no false full-TDD claim is raised.

## Recommended disposition

Return task 2 to implementation for the single P2 time-ordering correction and focused regressions. Task 3 can be accepted independently. Re-review the task 2 correction against nested command order, persistence and provider replacement; rerunning unrelated suites is unnecessary until an implementation change or a concrete integration risk warrants it.

## Task 2 correction round 1 — P2 addressed

Re-review date: 2026-11-06. Read the correction section of `farm-report.md`, `fix-modules.patch`, the current `farm.ts`, and the nine added farm tests. This section supersedes the earlier task 2 changes-requested disposition. Task 3 was outside this re-review and retains its earlier verdict.

**Verdict: addressed; task 2 approved within the specified architecture-sample scope. No new actionable defect found in the correction.**

Freshly reran the original independent public-capability reproduction, `node /tmp/text-world-modules-review-probe.ts`, exit 0. Its actual output now distinguishes the two orders correctly:

```text
advanceThenPlant {"plots":[{"id":"A","crop":"wheat","name":"麦","progress":0}]}
plantThenAdvance {"plots":[{"id":"A","crop":"wheat","name":"麦","progress":1}]}
```

The correction addresses the mechanism rather than special-casing that example. Each plot retains its authoritative elapsed baseline; planting synchronizes existing plots and assigns the new plot the current clock value. Harvest synchronizes before its maturity check, allowing a queued advance to mature the original crop while a replacement crop starts at the later time. Time-event processing advances from these persisted baselines to authoritative current time, so earlier queued events cannot grow a new plot or count time twice. The provider-source filter remains intact.

The added tests directly cover staggered planting between multiple advances, advance→harvest→replacement planting, persisted state equality after restore, compatible continuous→step replacement and continued progress. They also cover malformed/backward clock values, malformed/future/duplicate/backward event cursors and rollback. Fractional clock validation does not require exact equality after subtracting binary floating-point values; the 0.1+0.6 queued case uses a tolerance on its expected progress. Inspection found no new rollback, provider-isolation or public-query-shape regression.

The explicit stateVersion 2 change makes the added persistence requirements visible to the host. Empty version-1 state has a narrow explicit migration; occupied legacy plots reject with an explanation because their missing timing history cannot be reconstructed. Root explicitly authorized this disposition for a new project with no released version-1 saves, so that rejection is accepted rather than raised as an unaddressed compatibility requirement.

Supplied fresh implementation evidence is an observed pre-fix behavioral run with six failures, followed by **22/22 farm tests passing** and **typecheck exit 0** after the correction. The reviewer inspected those assertions and reran the original independent reproduction above; the farm suite and unrelated suites were not redundantly rerun in this re-review. Final whole-project integration remains the root's release gate, as recorded in the implementation report.
