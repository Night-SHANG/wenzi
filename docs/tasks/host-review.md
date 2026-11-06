# Independent host review

Review scope: frozen staged host implementation in `.superpowers/sdd/2026-11-06-runtime/review-host.patch`, against `docs/tasks/host.md`, `docs/design.md`, and `src/contracts.ts`. Reviewed `docs/tasks/host-report.md` and host tests as supporting evidence. This is a single authoritative process with synchronous trusted local modules.

## Verdicts

- **Spec compliance: changes requested.** The architecture and ordinary execution paths satisfy the task, but snapshot receipt validation accepts a demonstrably self-contradictory committed event cursor. Fix Important finding H1 before treating corrupt-snapshot validation as complete.
- **Code quality: changes requested for H1; otherwise sound.** Detached JSON boundaries, private runtime state, prepared registry entries, and a shared transaction scope keep the implementation understandable and avoid gameplay coupling. H2 is a minor deterministic-error defect in explicit capability lookup.
- **Critical findings: none.**
- **Important findings: one (H1).**
- **Minor findings: one (H2).**

## H1 — Important: restore accepts an event cursor inconsistent with its latest complete receipt

Location: `src/engine/index.ts:393–418`, particularly the checks at lines 394 and 414; restored cursor is installed at line 434.

A successful receipt contains the complete event list of its command revision. If its revision equals the snapshot revision, its final event sequence must equal the snapshot event cursor. The implementation checks each event is no later than the cursor, but never checks that equality. Consequently a snapshot can claim later committed events within the exact same revision while its complete command receipt says they never happened.

Focused reproduction, executed against the frozen source using an inline temporary Node script (no source edits):

```ts
// A single module has an emit command: ctx.emit('tick'); return null.
const world = createWorld(registry, definition);
world.dispatch({ id: 'event', target: 'a', action: 'emit' });
const snapshot = world.snapshot();
// revision 1; receipt revision 1 contains exactly one event, sequence 1.
snapshot.eventSequence = 2;
const restored = restoreWorld(registry, snapshot); // Currently succeeds.
```

Observed restored metadata: `revision: 1`, `eventSequence: 2`, one receipt with one event `{ sequence: 1, revision: 1 }`. The next emitted event will receive sequence 3. This is internally impossible for the host's successful dispatch path, not merely a question of detecting a coherently forged or unauthenticated snapshot.

Recommended correction: validate the cursor constraints implied by complete stored receipts, including the latest receipted revision when it equals the snapshot revision. Also account for the known start at revision zero and the maximum events possible in gaps between stored revisions. Retain support for absent receipts from no-ID commands and bounded receipt eviction; do not require every revision to have a receipt. Add a focused regression with this single-field corruption and a valid history with unreceipted gaps.

## H2 — Minor: inherited property is mistaken for an explicit capability version

Location: `src/engine/index.ts:175–176`.

Automatic provider selection uses `Object.hasOwn`, but the explicit binding branch indexes the ordinary `provides` object directly. A valid capability name such as `toString` can therefore read an inherited function from a provider that does not actually declare that capability, and pass it to `semver.satisfies`.

Focused reproduction, executed against the frozen source:

```ts
// Consumer declares requires: { toString: { version: '*' } }.
// Provider declares provides: {}.
// Consumer instance declares bindings: { toString: 'provider-instance' }.
createWorld(registry, definition);
```

Observed failure: `TypeError`, no `code`, message `Cannot read properties of undefined (reading 'length')`. Expected failure: stable `INCOMPATIBLE_CAPABILITY`, like other explicit bindings to providers lacking a requested capability. Assembly still rejects the invalid world, so this does not allow unauthorized capability resolution or corrupt state.

Recommended correction: require an own capability property before reading its version in the explicit branch. Add this focused regression; there is no need to forbid otherwise valid names such as `toString`.

## Behaviors checked and found satisfactory

- The registry accepts arbitrary registered local module IDs and snapshots manifest/schema metadata; duplicate IDs, malformed schemas and asynchronous schemas are rejected. Required capability resolution is per instance, handles compatible-provider ambiguity, and permits legal dependency cycles while actual nested execution is bounded.
- Dispatch starts with copied state. Nested calls, queued event handlers and commit-time validation use the same scope. A nested failure poisons that scope, preventing caught failures from committing. Final state, revisions, event cursors and receipts are installed only after successful execution and validation. Randomness stored in a module's state participates in these same rules; the host contains no special gameplay or RNG state.
- Queries receive read-only contexts and detached state/input/output; ordinary mutation of returned objects cannot alter authoritative state. Frozen config/input/event data and closed execution contexts defend the advertised API boundaries.
- Nonempty command IDs use canonical fingerprints, bounded successful receipts, detached replay results and mismatch rejection. No-ID and failed commands are not cached. Restored historical receipts can replay after explicit code migration removes the original command.
- Restore rejects missing/extra saved instances, validates saved version syntax and state, and requires migration for changed identity/version/state format. Reconfiguration checks world identity, explicit removal permission, retained and new states, config/schema validation and pure lifecycle validation, preserving the old runtime and clearing receipts in the replacement.
- JSON copying rejects unsupported values, nonfinite numbers, getters, holes, hidden/symbol properties, cycles and dangerous prototype-related keys. It avoids `toJSON` coercion and silent `undefined` loss.

## Verification and evidence boundaries

Read the frozen patch and implementation, public contracts, task/design, implementation report, and host tests. Ran only the two small inline Node reproductions documented above; both reproduced as described. No code changes, commits, index changes, or broad test reruns were made. Previously reported 20 host tests, typecheck, 44 earlier full-suite tests and 2 package integration tests are accepted as supplied integration evidence, not represented as newly executed reviewer tests.

## Behaviors deliberately not requested

- No distributed transactions, multiplayer authority protocol, authentication, persistence database, or production MMO architecture: these are outside the stated single-host foundation.
- No sandbox against arbitrary local JavaScript, CPU starvation, external I/O, closure-held runtime references, or prototype mutation by trusted module code: this task explicitly trusts local modules. API copy/freeze and call/event budgets are not claimed as process isolation.
- No cryptographic snapshot authenticity: coherently edited snapshots cannot be distinguished from legitimate ones without an external mechanism. H1 concerns contradictory metadata already present in the same snapshot.
- No demand for a special host RNG: randomness is deliberately a normal stateful module, so its atomicity follows the shared transaction model.
- No stylistic splitting or blanket testing expansion: the present size and structure do not justify unrelated refactors. The corrections above need targeted regressions only.

## Scoped re-review — fix round 1

Scope: `.superpowers/sdd/2026-11-06-runtime/fix-host.patch`, the appended host implementation report, and the five added regression tests. Reviewed only H1, H2, and potential new breakage introduced by their fixes.

- **H1: ADDRESSED.** The feasible cursor interval starts at zero and gains capacity only for missing revisions, capped at 1024 events per missing revision. A nonempty complete receipt checks the cursor preceding its first event and pins the resulting cursor to its final event. Consecutive and zero-event receipts do not invent unknown-event capacity. Final cursor validation now rejects the original contradictory head cursor and impossible prefix/intermediate/tail gaps. Valid unknown prefixes, interleaved no-ID commands, zero-event receipts, wholly unreceipted history, and evicted receipt prefixes remain permitted. A latest nonempty complete receipt at the snapshot revision fixes the cursor exactly; zero-event receipts correctly preserve whatever earlier-history uncertainty actually remains.
- **H2: ADDRESSED.** Both explicit binding selection and explicit provider-version lookup now require own properties. A missing own `toString` capability produces `INCOMPATIBLE_CAPABILITY`; a real own capability named `toString` still resolves through explicit and automatic binding.
- **New fix-diff findings: none.** The interval arithmetic and own-property changes are confined to the reviewed validation paths and introduce no identified regression.

Reviewer verification: ran `node --test --test-name-pattern='receipt history|explicit capability bindings' tests/engine.test.ts` against the corrected source — **5 passed, 0 failed**, exit code 0. Did not rerun the whole suite or typecheck; the implementer supplied 25/25 host tests and successful typecheck as additional evidence. No source/index/commit changes were made.

**Updated spec verdict: approved within the stated host scope. Updated code-quality verdict: approved. No outstanding critical, important, or minor findings from this review.** The scope exclusions recorded above continue to apply.
