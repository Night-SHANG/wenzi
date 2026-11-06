# World authoring and GitHub integration — v0.4

## Intent and scope

The user supplied `https://github.com/Night-SHANG/wenzi` and explicitly asked to continue. The repository was inspected through the GitHub connector and Git: it is a public, empty repository with default branch `main` and push access. Continue the existing independent text-world project from commit `6617a6f1ff1e02e9602da07af77b9548381dea75`, preserving its history. The previous word-combination project is unrelated.

Deliver a complete author workflow: discover module capabilities and schemas, fork a world, change its JSON assembly, check it in a disposable runtime, export it, and play it using the existing commands. All current and future systems remain modular; examples are not a whitelist. This batch adds no formal graphical UI, network module loader or new gameplay-specific host branch.

## Decisions and existing patterns

The user's repeated autonomous continuation and parallel-development preference authorize this implementation batch and the initial repository push; do not add a design-confirmation pause. Push once the batch is locally verified, immediately report the commit/Actions entry, and do not poll Actions while waiting for a result.

Considered approaches: a bespoke editor command for each gameplay system would impose a fixed feature list; a formal graphical editor would require the project's visual-sample approval first; a generic JSON/CLI author workflow uses the public contracts already implemented and can later back a visual editor. Choose the third approach. Keep the current Node `parseArgs`, Ajv, semver, JSON copy/validation and storage conventions.

For edits, reuse `fast-json-patch` exactly at `3.1.1` (MIT, no runtime dependencies), rather than inventing an update/merge language. The published implementation needs a thin compatibility adapter: validate the six RFC operations and strict pointers, use own-property traversal and actual array bounds, reject prototype paths and invalid move descendants, clone both inputs, and use existing canonical JSON equality for `test`. All mutation operations remain executed by the dependency. Source audit found reproducible defects with inherited operation names, 32-bit array index wrapping, invalid escapes, aliased patch values and `hasOwnProperty` data in tests. Pin those as regressions. No claim of recent upstream maintenance.

Primary sources: [official package and API](https://github.com/Starcounter-Jack/JSON-Patch/tree/3.1.1), [core implementation](https://github.com/Starcounter-Jack/JSON-Patch/blob/3.1.1/src/core.ts), [MIT license](https://github.com/Starcounter-Jack/JSON-Patch/blob/3.1.1/LICENSE.txt), [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902), [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901). The source tag resolves to `9d313ac01916e525e9204074f06e5295edec491b`; package integrity is retained in the lockfile.

## Public boundary

The host owns WorldDefinition and Command structural validation. Add pure exported parsing wrappers around those same validators. Authoring must not duplicate dependency resolution or introduce a second world schema.

The registry exposes detached metadata through `catalog()`: manifest, optional config/state schemas, command/query schemas, event names and migration support. Catalog calls execute no module hooks. Metadata is captured when registering so later mutations to caller-owned definitions cannot disagree with the executable validators. Results are sorted by module ID.

The authoring package has three separate responsibilities: parse/copy ordinary WorldPackage data; apply a patch to a detached candidate; inspect a package by assembling a disposable world. Inspection checks initial text output, optional demo steps, final text output and snapshot restoration. It returns structured success/failure and an explicit one-based failed demo step. It never writes a save or turns the demo's final state into exported initial configuration. Code plugins remain explicitly supplied trusted local files.

Editing and exporting are separate from inspection. `cloneWorldPackage` and `patchWorldPackage` validate structure; CLI `fork` and `patch` must also pass semantic inspection before writing. A patch may change any ordinary package data; it is not tied to named gameplay systems. Removing a required provider or producing ambiguity fails through the existing host. A failed patch or validation leaves the source and existing output intact.

## CLI workflow

```
modules [--json] [--plugin module.mjs]
describe <module-id> [--json] [--plugin module.mjs]
fork <world> --id <new-id> --out <world.json> [--title <title>] [--world-version <version>] [--overwrite] [--run-demo]
patch <world> --patch <operations.json> --out <world.json> [--overwrite] [--run-demo]
validate <world> [--run-demo] [--json]
check <world> [--run-demo] [--json]
```

`check` is an alias for `validate`. Existing `list`, `demo`, `play`, `inspect`, interactive operations and `--plugin` continue working. JSON success/inspection output contains no decorative text. Validation failure has a nonzero exit status. Demo execution is opt-in and reported separately from assembly validity.

Files are plain JSON WorldPackage format 1. Writes use a staged file: default publication must not overwrite an existing destination; explicit `--overwrite` atomically replaces only after successful validation. Paths with spaces and source=destination are supported with explicit overwrite. Failed writes preserve prior files and clean temporary files. No arbitrary shell command is involved.

## Acceptance and boundaries

An author can fork `farm`, alter a module/configuration via a checked patch, inspect it, export it, and run it with `demo`/`play`. Repeat with the external research module. Module metadata and patch values remain detached. Invalid config, missing/ambiguous providers, failed demo steps, malformed text views and stale output destinations are diagnosed and rejected.

Continue 68 existing tests, add focused behavior/compatibility tests, run full Preflight, compile, execute built-runtime authoring smoke and independent packaging checks. CI continues checking Linux and Windows; a submitted workflow is not a passed workflow. Pin Node.js >=24.12.0 and existing dependencies. API remains alpha; no save-format migration is introduced by this batch.

GitHub holds the source and workflow after the initial push. This is a development commit, not a Stable Release. Do not duplicate the Git-backed source into a new Library artifact. Keep the previous v0.3 artifact as its historical snapshot.
