# Public host implementation report

## Delivered

Owned changes are `src/engine/index.ts`, `src/engine/json.ts`, `tests/engine.test.ts` and this report. No dependencies, public contracts, business modules, root documentation or commits were changed by this task.

The public exports are `ModuleRegistry`, `WorldRuntime`, `createWorld`, `restoreWorld` and `reconfigureWorld`. The host imports no gameplay modules and accepts arbitrary locally registered module definitions. Ajv checks manifests, definitions, snapshots, configuration, state and action inputs; semver checks published module/capability versions and required ranges. Schemas are compiled independently so unrelated schema `$id` values do not collide. Async schemas are explicitly rejected by this synchronous host.

Capability resolution is per instance. Explicit bindings resolve ambiguity and must name a declared requirement, existing instance and compatible provider. Required missing/incompatible and ambiguous capabilities, duplicate instances, unknown definitions, declared conflicts and invalid entry queries fail explicitly. Graph cycles are legal; only actual nested calls and queries consume the depth budget of 64.

Each dispatch uses detached state, deterministic FIFO events in instance assembly order, a 1024-event budget, cross-module read-only validation and atomic commit. A failure preserves state, world revision, event cursor and receipts. Nested call/write/emit errors, nested query failures and explicit aborts poison the transaction even when module code catches the exception. A retained execution context cannot write/call/emit after transaction closure. Result, event, definition, snapshot and read data are copied; input/config/event data are also deeply frozen. Read contexts expose neither write, call nor emit.

Canonical successful command receipts are bounded to the last 128 nonempty IDs, survive snapshots, replay detached original results without a second mutation, and reject mismatched reuse. Empty or omitted IDs execute normally; failed dispatches do not create receipts. Restore checks receipt shape, canonical command fingerprints, unique IDs, revision order and event cursors. Historical receipts remain replayable after explicit migration removes an old command.

Restore and reconfiguration require an explicit migration when module identity, exact code version or state version changes. State schema and pure validate hooks run after migration. Reconfiguration retains existing states, initializes additions, checks the world ID, requires each removal to be listed in `allowRemoved`, clears receipts on success, and preserves the original runtime on failure.

The JSON copier rejects undefined, nonfinite numbers, bigint, symbols, functions, class instances, accessors, hidden properties, sparse/extended arrays, cycles and reserved prototype-related property names. It does not invoke `toJSON`, getters or coercion to silently lose/change data.

## Test-first evidence and verification

1. Wrote the first 15 behavioral tests before creating engine implementation. `node --test tests/engine.test.ts` failed as expected with `ERR_MODULE_NOT_FOUND` for the missing engine entry point.
2. Implemented the host; the initial 15 host tests and `npm run typecheck` passed.
3. Added regressions for async/null schemas and caught explicit/nested-query failures. Ran `node --test tests/engine.test.ts`; observed the intended two failures before implementing the protections.
4. Added a migrated-code/removed-historical-command receipt regression. `node --test --test-name-pattern='restore migration preserves' tests/engine.test.ts` failed with the old incorrect `INVALID_SNAPSHOT` rejection; corrected restore receipt validation.
5. Added a zero-revision/nonzero-event-cursor corruption assertion. `node --test --test-name-pattern='cursor consistency' tests/engine.test.ts` failed as expected before adding the event-budget consistency check.
6. Final targeted command: `node --test tests/engine.test.ts` — **20 tests passed, 0 failed**.
7. Final static check: `npm run typecheck` — **passed**, exit code 0 across all current project sources.

The module authors separately reported farm integration **13/13** and adventure integration **9/9**, with the then-current full suite **44/44**. Those full-suite results are their integration evidence; root is responsible for a fresh whole-project run after the final host regressions.

The 20 host tests cover registry validation and arbitrary modules; capability resolution, explicit bindings, providers and optional requirements; conflict/duplicate rejection; nested rollback; query/read/snapshot isolation; receipt replay/mismatch/eviction; event errors/storm/order; legal capability cycles and bounded execution depth; restore/missing/corrupt state; explicit migration and removal; unsafe JSON; pure lifecycle validation; async/null schema rejection; caught abort poisoning; retained contexts/frozen inputs; receipt structure/cursors; and historical receipt preservation through migration.

## Explicit limits

- Module JavaScript is trusted local code. Deep copies, frozen arguments and budgets protect host APIs and accidental mutation; this is **not a hostile-code sandbox**, CPU/time limit, I/O isolation mechanism or process boundary.
- Commands, queries, migrations, initializers, validators and event handlers are synchronous. Promise results are not JSON; async schemas and nonvoid lifecycle/event results are rejected. Arbitrary trusted JavaScript can still launch external asynchronous work outside host control.
- JSON validation conservatively disallows `__proto__`, `constructor` and `prototype` object keys anywhere in serialized data, rather than attempting to preserve potentially hazardous keys.
- Snapshots are validated data, not signed or authenticated history. Structurally consistent tampering cannot be distinguished from a legitimately authored snapshot without an external integrity mechanism.
- Transaction atomicity covers this single in-memory host. External side effects performed by trusted module code and cross-host transactions are outside the atomic boundary.
- No remaining known integration blockers; independent root review and final whole-suite verification remain appropriate.

## Independent review fix round 1 — H1 and H2

Read `docs/tasks/host-review.md` and reproduced both findings with tests before editing implementation. Ran `node --test --test-name-pattern='receipt history|explicit capability bindings' tests/engine.test.ts`: the new focused group produced **4 intended failures and 1 positive-case pass**. The failures demonstrated an accepted impossible head cursor, impossible initial/consecutive event sequences, excessive unreceipted gap allowance, and inherited `toString` incorrectly reaching semver as a function.

H1 correction tracks a feasible cumulative event cursor interval starting at revision zero. Every complete stored receipt contributes exactly its declared event count; only genuinely missing revisions contribute an unknown zero through 1024 events. Nonempty receipt sequences must be contiguous and pin both the preceding and resulting cursors. Zero-event receipts preserve the interval without inventing event capacity. The final snapshot cursor must fall within the remaining interval, so a complete head receipt fixes the head cursor exactly when its event list pins the history. This also rejects excessive prefix, intermediate and trailing gaps, and contradictory consecutive/no-event receipt histories.

Positive regressions preserve real no-ID commands before, between and after receipts; zero-event anchors separated by genuinely unknown history; worlds containing only unreceipted history; and a valid 128-receipt suffix after older receipts have been evicted. This establishes consistency with available complete history, **not authenticity of unsigned snapshots**.

H2 correction uses own-property checks before reading explicit provider capability versions and before selecting an explicit binding. A provider lacking an own `toString` capability now fails with `INCOMPATIBLE_CAPABILITY`. Providers with a valid own `toString` capability still work through both explicit and automatic binding.

Final round verification:

- `node --test tests/engine.test.ts` — **25 tests passed, 0 failed**.
- `npm run typecheck` — **passed**, exit code 0.
- Whole-project suite intentionally left for root's final integration verification, as requested.

Only the owned host implementation, host tests and this report were changed. No new known blockers; files are frozen again for review.
