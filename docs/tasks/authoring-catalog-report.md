# Authoring Task 1 — registry catalog and structural parsers

记录核对：2026-11-06 23:23 北京时间（UTC+08:00），root 通过可信 UTC 时钟换算后整合。

## Scope and implementation

Implemented the Task 1 brief on `feat/world-authoring`, based on `6617a6f1ff1e02e9602da07af77b9548381dea75`. No files owned by the CLI/package or world-authoring implementers were changed by this task. No Git staging or commits were performed.

Changed files:

- `src/contracts.ts`: public `ModuleDescriptor` with manifest, optional config/state schemas, `{schema}` command/query records, event names and `supportsMigration`.
- `src/engine/index.ts`: registration-time schema copies in the existing prepared module records; `ModuleRegistry.catalog()`; exported `parseWorldDefinition(unknown)` and `parseCommand(unknown)`; assembly and dispatch reuse these shared parsers.
- `tests/inspection.test.ts`: eight behavioral tests covering discovery, defaults, order, hook non-execution, registration capture, nested mutation isolation, schema error compatibility, detached parsing and structural/non-JSON rejection.
- `docs/tasks/authoring-catalog-report.md`: this report.

The catalog sorts modules by ID and events by name. It returns fresh JSON copies, omits absent config/state schemas, and exposes object schemas for commands/queries that omitted their schema. It does not expose executable callbacks or execute lifecycle/action/event hooks. The host retains no gameplay, built-in-catalog, authoring or platform-IO imports.

Both parsers use the existing `copyJson` and compiled structural validators. They deliberately do not resolve module identities, assemble worlds, dispatch commands or execute hooks. Valid structural drafts can refer to as-yet-unregistered modules. Non-JSON inputs preserve `INVALID_JSON`, while malformed JSON structures preserve `INVALID_DEFINITION`/`INVALID_COMMAND`.

## RED evidence

Before production edits:

```text
node --test tests/inspection.test.ts
exit 1; tests 7; pass 0; fail 7
```

The two catalog tests failed with the explicit assertion `ModuleRegistry.catalog must expose registration metadata`: actual `undefined`, expected `function`. The five parser tests failed with equivalent assertions for the absent `parseWorldDefinition` or `parseCommand` API. Tests imported the engine namespace and checked API presence dynamically, so this was meaningful absent-API RED rather than an import failure.

During self-review, a compatibility regression was identified: copying config/state/query schemas before compilation could expose `INVALID_JSON` where the existing registration path returned `INVALID_SCHEMA`. A new test was written before fixing that behavior:

```text
node --test --test-name-pattern='preserves INVALID_SCHEMA' tests/inspection.test.ts
exit 1; tests 1; pass 0; fail 1
```

The expected error predicate rejected the received `EngineError: $.description: expected finite JSON data` (`INVALID_JSON`). The `captureSchema` helper now preserves the existing schema-error wrapping for the affected paths. Existing command schema copying and its error behavior are unchanged.

## GREEN evidence

Runtime: Node.js `v24.22.1`, satisfying the project minimum `>=24.12.0`.

```text
node --test tests/inspection.test.ts tests/engine.test.ts
exit 0; tests 33; pass 33; fail 0
```

This includes all eight new inspection tests and all 25 existing engine tests. An earlier intermediate run passed 32/32 before the extra compatibility regression test was added.

```text
npm run typecheck
exit 0; tsc --noEmit passed
```

The parallel tree was coherent when typechecking ran. npm emitted its environment warning about unknown `http-proxy` configuration; TypeScript reported no errors.

Final focused rerun:

```text
node --test tests/inspection.test.ts
exit 0; tests 8; pass 8; fail 0
```

## Self-review and integration boundary

- Verified exact public names and descriptor shape; no `list()`/`describe()` registry aliases were introduced.
- The schema snapshots used for metadata and compilation derive from the same registration-time JSON copy. Original manifest/config/state/command/query mutation cannot change subsequent catalog output. Returned nested schema, manifest and event mutation cannot change authoritative metadata.
- The runtime test also verifies that original schema mutation does not alter accepted config/command/query input, and that query type rejection still occurs.
- Hooks configured to throw are not invoked by registration/catalog discovery. Structural parsers require no registry or runtime instance.
- Existing world assembly, command dispatch, snapshots, migration, receipts, transactions and command-action discovery pass the 25 engine regression tests. No API or storage-format changes were introduced.
- No focused test or typecheck failures remain. Whole-suite integration, Preflight, build, built-runtime smoke and independent review belong to root after the concurrent owners finish, as specified in the Task 1 brief. Those final checks were not claimed or duplicated here. No integration failures were observed in the checks this task actually ran.

No known unresolved Task 1 concern.
