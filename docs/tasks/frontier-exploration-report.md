# Task 1 implementation report

Recorded: 2026-11-07 00:17 Beijing (UTC+08:00), using clock tool value 2026-11-06 16:17:05 UTC.
Base supplied by root: `49affa9`; existing shared branch `feat/frontier-loop`. No index changes, commits, branch changes or pushes performed.

## Delivered files

- `src/modules/location.ts` — independent directed location graph, exact current/describe shapes, unique visited state, pure reference validation and atomic move event.
- `src/modules/gathering-rules.ts` — independent policy catalog with exact get({rule})/list queries and empty state.
- `src/modules/gathering.ts` — renewable sites, immutable active deadlines, public inventory/location/rule/time capability use, item/container/site references and bound clock validation.
- `src/modules/simulation-time.ts` — exported `readSimulationTime(context: ReadContext, notBefore = 0): number`; malformed clock result => INVALID_CLOCK, elapsed time below baseline => CLOCK_BACKWARD. Published early and root notified for Task 2 reuse.
- `tests/exploration.test.ts` — 15 focused behavior tests using actual ModuleRegistry/createWorld/restoreWorld/reconfigureWorld, real inventory/capacity/clocks and explicit compatible external test modules.

## TDD evidence

Read Task 1 brief before other work; read AGENTS.md, README/authoring documentation and relevant design contract. Read superpowers test-driven-development skill and writing-good-tests.md before writing tests. Expectations use hand-checked literals; external fixtures operate through real public runtime capabilities rather than mocked contexts.

RED command: `node --test tests/exploration.test.ts`

- Exit 1; 0 pass, 1 failed test file.
- Explicit dynamic-import assertion: 探索模块尚未实现：Cannot find module .../src/modules/location.ts.
- Observed before any owned production file was written. The brief explicitly permits dynamic import/existence assertion for this absent-module stage; final tests exercise real runtime behavior.

GREEN command: `node --test tests/exploration.test.ts`

- Exit 0; 15 tests, 15 pass, 0 fail.

Regression command: `node --test tests/exploration.test.ts tests/farm.test.ts`

- Exit 0; 37 tests, 37 pass, 0 fail.
- Repeated once after self-review's unused-import cleanup and conversion to shared location record/empty schema helpers: exit 0; 37 pass, 0 fail.
- No full suite, typecheck, build or Preflight run by this task, following root's instruction to run integrated Preflight once after parallel implementations finish.

## Covered behavior and decisions

- Location-only assembly starts in town, rejects a known unlinked quarry, returns exact current/describe fields, visits forest once across repeated trips, and rejects broken start/edge/current/visited references, duplicate exits/visits and deletion of previously visited nodes.
- Rule get/list and sites have exact spec output shapes; queries preserve full snapshots.
- Wood quantity=3, cooldown=30: first gather reaches 3, immediate retry preserves complete snapshot, second 29 leaves 1 second, second 30 permits 6 total, renewed deadline=60.
- Wrong location, unknown site (including inherited-looking IDs), full inventory and invalid external providers preserve complete transaction snapshots.
- Save/restore preserves 20 remaining seconds after 10 elapsed; rule cooldown edit 30=>1 keeps readyAt=30 and makes the subsequent deadline=31.
- Every site location/rule/item/container reference is checked. Local schema rejects unsafe/fractional/nonpositive quantities and invalid durations. External rule result fields and values are checked at runtime, including requested ID identity.
- Gathering only reads the bound clock; an unbound clock advancing by 100 cannot finish a 30-second cooldown on the bound alternate clock.
- Shared time adapter supports fractional seconds and emits exact INVALID_CLOCK/CLOCK_BACKWARD errors; no dependence on host date/time or event deltas.
- Deadline overflow and addition precision loss reject atomically before inventory mutation. Existing cooldown requires gatheredAt < readyAt and bound clock >= gatheredAt; removed site references reject restoration.
- Legitimate own-property IDs (`valueOf`, `toString`, `hasOwnProperty`) work across location/rule/site/item boundaries. State insertion uses Object.defineProperty, all key lookups use shared own helper.
- Events use `location.moved` payload {from,to} and `gathering.gathered` payload matching gather result; the spec names these events without imposing a different payload.

## Self-review and concerns

Self-reviewed all owned source/tests for schema reuse, independent state ownership, dependency declarations, numeric boundaries, exact API names/shapes, defensive external return handling, frozen deadlines and query purity. All owned gameplay messages are Chinese. No genuine contract ambiguities or known blocking defects remain.

Root still needs to run integrated static/full Preflight/build/release validation and fresh scoped review after all parallel owners finish. Other owners' unstaged/untracked files were observed but not edited. Status: DONE.

## Review fix round 1/5 — external reference result validation

Recorded: 2026-11-07 00:23 Beijing (UTC+08:00), from clock tool 2026-11-06 16:23:49 UTC. Read `.superpowers/sdd/2026-11-07-frontier/task-1-review.md`; addressed Important finding I1. Starting HEAD supplied by root: `a1233f6` (Task 1 source identical to reviewed `3c99678`).

Files changed in this round: `src/modules/gathering.ts`, `tests/exploration.test.ts`; this report appended. No other owner files, index, commits or branches changed.

Added regression tests before the production fix. RED command: `node --test tests/exploration.test.ts`.

Exact summary output:

```text
ℹ tests 18
ℹ suites 0
ℹ pass 15
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Exit code: 1. Three observed failures:

- `external location descriptions must have matching identity and valid required fields at assembly` — `AssertionError [ERR_ASSERTION]: Missing expected exception.` The null description was accepted.
- `external location replacement and malformed transactions preserve the usable world snapshot` — success `{"ok":true,"revision":2,"value":null,"events":[]}` where failure was expected; malformed description update committed.
- `external inventory reference queries must return valid list and count envelopes atomically` — success `{"ok":true,"revision":1,"value":null,"events":[]}` where failure was expected; malformed inventory reference result update committed.

Production fix validates external location.describe object identity against the requested location, nonempty name, string description, unique valid ID exits. Invalid results fail with Chinese INVALID_LOCATION before assembly/reconfiguration/transaction commit. The review also asked for the same necessary-field principle on other reference checks: inventory.list now needs an object with items array and limits object, and inventory.count needs a nonnegative safe integer quantity. Invalid reference envelopes fail with Chinese INVALID_INVENTORY. Existing public capability semantics and state ownership remain unchanged.

Final regression fixture checks null, nonobject, missing fields, mismatched identity, malformed required fields and duplicate/invalid exits. A valid external location still permits actual gathering through the real inventory (3 wood, readyAt=30); malformed provider state updates roll back whole snapshots, and malformed reconfiguration leaves the original world usable. Inventory regression uses actual runtime composition with explicit external provider outputs and checks whole-snapshot preservation for each invalid list/count envelope. During implementation the reconfiguration fixture was refined to return its configured override, so that its assertion exercises consumer validation rather than a test-provider input assertion.

GREEN command: `node --test tests/exploration.test.ts`.

Exact summary output:

```text
ℹ tests 18
ℹ suites 0
ℹ pass 18
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Exit code: 0. No full suite, Preflight, build or typecheck run in this round, as root requested only the covering exploration tests. Self-reviewed owned diff: 28 source lines touched and 43 test lines touched. No known remaining concern from I1; integrated validation remains with root. Status: DONE.
