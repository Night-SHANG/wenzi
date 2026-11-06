# Task 2 — generic authoring, patch adapter and file publication

Date: 2026-11-06. Baseline branch: `feat/world-authoring`, base `6617a6f1ff1e02e9602da07af77b9548381dea75`. Implementer made no commits and did not stage files. Other owners edited engine, contracts, CLI, dependencies and release files concurrently.

## Delivered scope

- `src/authoring/contracts.ts`: unchanged-format `WorldPackage` and the frozen success/failure `PackageInspection` union.
- `src/authoring/packages.ts`: strict own-field envelope parser, detached identity cloning, and semantic inspection through existing engine/runtime/text APIs.
- `src/authoring/patch.ts`: six-operation JSON Patch adapter around pinned `fast-json-patch` 3.1.1, with narrowly scoped precondition guards and canonical JSON test comparison.
- `src/adapters/world-package-files.ts`: structurally revalidated staged export, default hard-link no-clobber publication and explicit rename overwrite.
- `src/worlds.ts`: preserves existing built-in-name/path resolution, delegates decoded JSON to the shared package parser, and re-exports `WorldPackage` for compatibility.
- `tests/authoring.test.ts`, `tests/patch.test.ts`, `tests/world-package-files.test.ts`: 17 final focused tests.

No module hook executes during package parsing, cloning or patching. Unknown module definitions can be structurally cloned and patched; semantic inspection reports their assembly failure. The implementation does not duplicate module dependency resolution or world/command schemas. `parseWorldDefinition` and `parseCommand` are imported from the concurrent engine task.

## RED evidence and limitations

Tests were written before implementation. First command:

```sh
node --test tests/authoring.test.ts tests/patch.test.ts tests/world-package-files.test.ts
```

The first run failed three file-level tests with `ERR_MODULE_NOT_FOUND` for the not-yet-created package, patch and writer modules. This is missing implementation evidence, not behavioral assertion evidence.

Minimal exported functions that threw `Not implemented: ...` were then created to let test assertions execute; the same command ran 14 tests, with 12 failures and 2 passes. Concrete RED failures included successful strict parsing, detached clone, hook-free structural acceptance of unknown modules, structured inspection, text-view stage reporting, restore stage reporting, successful patch sequence, legal own `hasOwnProperty` data equality, indexed late test failure, root replacement, valid file publication, and the concurrent writer winner count (actual 0, expected 1). The rejection-only patch test and overwrite-failure preservation test passed against throwing stubs and are explicitly not claimed as RED evidence. Final guard assertions were strengthened to check `INVALID_PATCH` and the correct operation index.

There was no missing-engine-export RED run: the shared parsers became available before the real implementation was exercised. Missing concurrent exports would have been dependency evidence only.

The first implementation run had 13/14 passing, with the sole failure caused by a mistaken test fixture name `adventure`; no such shipped world exists. The fixture was corrected to actual shipped names `farm`, `tactics`, and `story`. This was a test setup error, not a product behavior regression.

Two supplemental tests were subsequently added for explicit/fallback demo IDs and copy/move append behavior. They passed against the implementation; no independent RED claim is made for those supplemental cases.

A parent integration review identified one concrete consistency defect: the final add destination guard also rejected safe own data keys shadowing inherited methods. A regression covering add `toString`, same-path move of an own `hasOwnProperty` after scratch removal, and copy to `valueOf` was written first. `node --test tests/patch.test.ts` ran 7 tests with 6 passing and 1 failing: `Patch operation 0: Pointer does not reference an own property`. The one-line guard correction allows creation of a final own property while retaining own-property requirements for reads and traversal. The same command then passed 7/7; the final focused run passed 17/17. Inherited reads and traversal remain rejected in that regression. No reserved-key policy changed.

## GREEN evidence

Runtime observed: Node `v24.22.1`. Installed dependency inspected directly: `fast-json-patch` version `3.1.1`. It is imported using its default export under NodeNext.

Final focused command:

```sh
node --test tests/authoring.test.ts tests/patch.test.ts tests/world-package-files.test.ts
```

Result: **17 tests, 17 passed, 0 failed**, exit 0 (about 3.2 seconds).

Relevant compatibility command (before the supplemental cases and own-key regression were added):

```sh
node --test tests/authoring.test.ts tests/patch.test.ts tests/world-package-files.test.ts tests/integration.test.ts tests/cli.test.ts
```

Result: **21 tests, 21 passed, 0 failed**, exit 0 (about 4.2 seconds). This included every shipped world's assembly/demo/text/restoration integration check, live reconfiguration integration, existing CLI demo/restorable snapshot, story-only world, external registration, invalid JSON exit behavior, and interactive save/load after a rejected command.

```sh
npm run typecheck
```

Result: exit 0 after root corrected its temporary CLI import to the dedicated `authoring/patch.ts` export. No errors in Task 2 code were reported. The root owns the final integrated full suite and preflight; this report does not claim those ran here.

## Behavior and guard coverage

Package parsing checks finite lossless JSON with the existing `copyJson`, then requires exactly the own fields `format`, `world`, and `demo`. Shared parsers validate world and command structure. Tests reject unknown envelope/world/command fields, inherited envelopes, getter-bearing input without invoking the getter, malformed required content and invalid JSON shapes. Clone tests verify retained title/version, preserved instances/bindings/demo, requested identity overrides and source independence.

Inspection creates a fresh runtime, captures actions, validates the initial text view, optionally dispatches demo commands with `command.id ?? demo-N`, validates final text, snapshots, restores, and compares saved/restored snapshots canonically. It returns separate package/assembly/view/demo/restore failures and one-based demo failure steps. Tests exercise a failed second demo command, invalid initial and final view, a restoration lifecycle rejection, final-view content, default nonexecuted demo summary, successful built-in demos, explicit idempotency IDs and deterministic fallback-ID collision behavior. Source packages remain unchanged.

Patch mutation is delegated to `fast-json-patch.applyOperation`. The adapter only reads paths and validates preconditions. For move destination validation, removal itself is executed by the dependency on a detached scratch copy, so array bounds and paths are checked after removal. Pointer splitting precedes escape decoding; only `~0` and `~1` are accepted. Unsafe prototype-related segments, inherited traversal, noncanonical/out-of-bounds array indices and indices beyond 2147483647 are rejected. Object numeric keys remain ordinary keys. Final add-like destinations may create own ordinary keys such as `toString`, `hasOwnProperty` or `valueOf`, even when those names exist on the prototype; reading or traversing an inherited key is still rejected. `-` is supported at final add-like array destinations. Descendant moves are rejected. `test` uses the existing canonical JSON helper because the dependency calls a data object's `hasOwnProperty`, which can legally be an own JSON field. Canonicalization is not used for mutation.

Finite regressions cover the audited `toString` and `_get` operation names, bad `~2`, inherited `/toString`, 4294967296 wrapping, the signed index ceiling, invalid decimal indices, absent required fields, forbidden segments, source/operation/value isolation, late failed test atomicity, correct original index, own `hasOwnProperty` equality, escaped keys, valid all-six-operation sequence, move/copy append and root replacement. Final structure is validated without semantic assembly.

Writer tests cover parent creation, paths with spaces, read/write round trip, same-file explicit overwrite, existing-file byte preservation after default collision, invalid-package preservation, concurrent default publication with exactly one winner, temporary cleanup after success/collision, and cleanup/preservation when rename targets an existing directory. Staged bytes are written, synced and closed before publication. Default publication uses a sibling-file hard link; overwrite uses sibling rename. No existence-check/write race is introduced.

## Practical limits

The writer requires filesystem support for same-directory hard links; unsupported filesystems fail closed rather than silently falling back to a clobber-prone path. It syncs file data before publication but does not claim crash-proof directory durability or cross-machine filesystem guarantees. The tests exercise concurrent publication calls in one process at the promise level and real filesystem failures; they do not inject low-level write/fsync/close failures or simulate process termination. Cleanup runs in `finally` for ordinary thrown failures.

Module JavaScript remains trusted registered local code. Inspection executes its hooks, matching the existing runtime trust model; authoring introduces no code auto-loading, graphical UI or gameplay kind.
