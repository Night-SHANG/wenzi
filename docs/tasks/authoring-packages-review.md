# Task 2 authoring review

Reviewed 2026-11-06 against `.superpowers/sdd/2026-11-06-authoring/task-2-brief.md`, the implementer report, and the supplied review patch (base `87d7a875df2911464373787c7211d210c9cee59f`, head `bbf88dbc2a4b245aecea3934780364857b0ca3b0`).

**Spec verdict: changes required.** The package parser, detached clone, explicit semantic inspection, compatibility loader/type export, and staged file writer match the requested architecture. One valid JSON Patch move class is rejected despite the required destination-after-removal semantics.

**Code quality verdict: changes required for one P2 correctness finding.** The implementation is otherwise compact and uses the existing host parsers/runtime and pinned dependency appropriately. No gameplay whitelist, module auto-loading, graphical UI, replacement mutation engine, or host-authority expansion was found.

## P2 — Execute moves using the validated post-removal document

**Location:** `src/authoring/patch.ts`, lines 63–64 and 74.

The scratch removal and guard correctly validate a move destination after its source has been removed. However, the actual operation is subsequently passed as an unmodified `move` to `fast-json-patch` on the original candidate. Version 3.1.1 traverses that destination before removing the source (both in `applyOperation` and its move implementation). When removing an array element shifts the intended destination container into place, the original destination can be null or otherwise unavailable. Such a valid move then throws.

Concrete input, within an otherwise structurally valid package's module config:

```json
{"items":["moved",null,{"keep":true}]}
```

Operation:

```json
{"op":"move","from":"/world/modules/0/config/items/0","path":"/world/modules/0/config/items/1/added"}
```

Expected config after removal then addition:

```json
{"items":[null,{"keep":true,"added":"moved"}]}
```

Observed error:

```text
INVALID_PATCH Patch operation 0: Cannot read properties of null (reading 'added')
```

The caller's source remains unchanged, so this is a valid-input rejection rather than an atomicity failure. It affects ordinary config arrays and is independent of module semantics.

**Requested correction:** publish the successful result of dependency-executed removal and addition on a detached document for moves, or use an equivalent narrow compatibility adaptation that never resolves the destination before removal. Retain the existing descendant check, pointer/own-property/array guards, root behavior, original operation index, and source preservation. All actual mutations must remain delegated to the dependency. Add this case as a focused behavioral regression.

**Verification:** a focused Node probe reproduced the public API error, asserted that the source stayed unchanged, and used `fast-json-patch.applyOperation` for successive remove/add operations to assert the expected result above. This confirms the dependency can perform the necessary mutations without introducing a custom mutation engine.

## Other review evidence and limits

- Reviewed the supplied diff and report, including the focused test coverage and the prior own-method-name destination regression. Additional source inspection was limited to `src/engine/json.ts` for detached/lossless copying and canonical comparison, and the installed dependency's operation implementation for the concrete move-order risk.
- Envelope parsing reuses shared world/command parsers. Clone/patch do not assemble modules, and inspection uses a fresh runtime with initial/final text validation, optional command IDs, stage-specific failures, snapshot restoration, and canonical restored-snapshot comparison.
- The writer validates before staging, writes/syncs/closes a unique sibling file, publishes with default hard-link no-clobber or explicit rename overwrite, and cleans its temporary path in `finally`. The existing tests cover collisions, same-file overwrite, spaces, concurrency, and failed rename preservation; the report states filesystem/crash-durability limits accurately.
- The dependency is pinned at `3.1.1`. Package metadata/version changes in the supplied integrated patch are root-owned integration work, not an authoring-worker scope violation.
- The report's 17 focused passing tests and earlier compatibility results were reviewed as reported evidence, not independently rerun. No broad test suite, build, preflight, or smoke run was performed here; root owns those integration checks.
- No code, index, branch, or other file was changed by this review.

## Scoped re-review — fix round 1

Reviewed `.superpowers/sdd/2026-11-06-authoring/task-2-fix-1.patch` (`bbf88dbc2a4b245aecea3934780364857b0ca3b0` → `3ea09809f1a2ec116b9fc0059f17eeacba1f5b6b`) and its appended implementation evidence. Scope was the P2 move-order finding above and potential breakage introduced by its correction; this was not a new broad audit.

**Spec verdict: approved within the reviewed Task 2 scope. Code quality verdict: approved. The P2 finding is resolved; no remaining findings were identified.** These verdicts supersede the initial changes-required verdicts above.

The move branch now retains the dependency-executed removal result on a detached document, validates its destination after removal, and executes the addition on that same document through the dependency. It assigns the candidate only after that sequence succeeds, then skips the faulty combined move operation. The original pointer/from checks, descendant prohibition, array/own-property guards, operation-index wrapping, and final structural package parsing remain in effect. No custom mutation engine was introduced.

The added regressions cover the exact shifted-container failure, unchanged source and operation inputs, indexed failure on a subsequent move, root-to-root moves, same-array-path moves, and promoting a nested package to the root. The report records the exact regression RED (8 passing, 1 failing) and focused patch/authoring GREEN (16 passing).

Independent focused verification:

```sh
node --test --test-name-pattern='move resolves a shifted|dependency-executed move' tests/patch.test.ts
```

Result: **2 tests passed, 0 failed**, exit 0. The original failing move now produces the specified result and the root/same-path regression passes. No entire-suite rerun or code/index changes were made; full integration checks remain root-owned.
