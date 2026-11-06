# World Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver module discovery and a checked world fork/edit/export/play workflow in the user-selected wenzi repository.

**Architecture:** Extend public host metadata and structural parsing, then build a generic authoring layer and thin CLI/file adapters. Keep the host gameplay-free and reuse its existing assembly/state authority.

**Tech Stack:** TypeScript 5.9.3, Node.js >=24.12.0, Ajv 8.17.1, semver 7.8.5, fast-json-patch 3.1.1, node:test.

**Spec:** docs/superpowers/specs/2026-11-06-authoring-design.md

## Global Constraints

- All current and future systems, rules, content, data, presentation and controls are modular; samples are not a whitelist.
- No gameplay-specific branches in the host, no duplicate dependency resolver or duplicated WorldDefinition/Command structural schema.
- Node.js >=24.12.0; preserve existing APIs and WorldPackage format 1 / WorldSnapshot format 1.
- Only add fast-json-patch 3.1.1 as a production dependency; keep existing fixed dependency versions.
- Inputs, registry descriptions and patch values are detached JSON; failures preserve sources and existing output files.
- No formal graphical UI or automatic execution/download of modules named in world JSON.
- Root alone edits package/lock, CLI, shared documentation, Git index, commits and remote refs. Parallel owners use disjoint files.
- User selected Night-SHANG/wenzi and authorized continuation; verify locally, push the coherent batch, immediately report it and do not poll Actions.

## Review Focus

- Mutating an input definition or returned catalog must not alter later descriptions or executable validation — Task 1.
- Unknown fields, non-JSON values and malformed demo commands must fail through shared parsing — Tasks 1–2.
- Failed late patch operations, inherited paths, escaped keys, large/invalid array indices and move ordering must preserve the original — Task 2.
- A valid initial world can contain a bad view or a failing second demo step; inspection must distinguish those outcomes and restore a successful snapshot — Task 2.
- Existing output, source=destination, spaces in paths and write errors must not corrupt the only copy — Tasks 2–3.

---

### Task 1: Registry metadata and shared structural parsers

**Files:**
- Modify: `src/contracts.ts`, `src/engine/index.ts`
- Create: `tests/inspection.test.ts`
- Report: `docs/tasks/authoring-catalog-report.md`

**Interfaces:**
- Produces `ModuleDescriptor` in contracts: `{ manifest: ModuleManifest; configSchema?: JsonSchema; stateSchema?: JsonSchema; commands: Record<string, { schema: JsonSchema }>; queries: Record<string, { schema: JsonSchema }>; events: string[]; supportsMigration: boolean }`.
- Produces `ModuleRegistry.catalog(): ModuleDescriptor[]`, sorted by manifest.id, returning detached metadata with no executable callbacks.
- Produces `parseWorldDefinition(value: unknown): WorldDefinition` and `parseCommand(value: unknown): Command` exported from engine/index.ts; use existing copyJson and validators, returning detached data. Do not initialize or execute module hooks.
- Consumes existing ModuleDefinition, Prepared, validators and copyJson. Do not alter package/lock, authoring, worlds, CLI or other tests.

- [ ] Write meaningful failing tests for metadata discovery, schema capture at registration, mutation isolation, missing-schema defaults, stable order, hook non-execution, and structural parser rejection/detachment. Use dynamic access if necessary to make RED an absent-API assertion rather than only an import error.
- [ ] Run `node --test tests/inspection.test.ts` and record the RED reason.
- [ ] Implement the two pure parsers and metadata capture/output. Preserve existing runtime behavior; defaults for absent command/query schema are `{type:'object'}`. Optional config/state schemas remain omitted when absent. Events sort by name. Store JSON copies at registration.
- [ ] Run the focused tests and existing engine tests; run strict typecheck when the parallel tree is coherent. Root runs the final whole suite once all owners finish.
- [ ] Write report with exact test commands/results, any blocked integration checks and self-review. No git staging or commits.

### Task 2: Generic world authoring, patch adapter and file export

**Files:**
- Create: `src/authoring/contracts.ts`, `src/authoring/packages.ts`, `src/authoring/patch.ts`, `src/adapters/world-package-files.ts`
- Modify: `src/worlds.ts`
- Create: `tests/authoring.test.ts`, `tests/patch.test.ts`, `tests/world-package-files.test.ts`
- Report: `docs/tasks/authoring-packages-report.md`

**Interfaces:**
- Consumes Task 1 pure parsers from `../engine/index.ts`, existing createWorld/restoreWorld/WorldRuntime.actions, core copyJson/canonical, and `readTextView` from the existing text adapter. The root installs fast-json-patch 3.1.1.
- Owns `WorldPackage {format:1; world:WorldDefinition; demo:Command[]}` in authoring/contracts.ts; re-export this type from src/worlds.ts for compatibility.
- Produces `parseWorldPackage(value: unknown): WorldPackage` from authoring/packages.ts: own top-level format/world/demo only, shared world/command structural parsing, detached JSON. Unknown package fields are rejected.
- Produces `cloneWorldPackage(source: unknown, identity: {id:string;title?:string;version?:string}): WorldPackage`; retain unspecified title/version, preserve instances/bindings/demo, change no source data.
- Produces `patchWorldPackage(source: unknown, operations: unknown): WorldPackage`; apply whole-package JSON Patch on a detached candidate, validate resulting package structure. Semantic inspection is a separate explicit step.
- Produces `inspectWorldPackage(registry:ModuleRegistry, source:unknown, options?:{runDemo?:boolean}): PackageInspection`.
- `PackageInspection` success: `{ok:true;worldId:string;title:string;moduleCount:number;actions:{target:string;action:string;schema:JsonSchema}[];view:{title:string;lines:string[]};demo:{executed:boolean;steps:number;finalRevision:number};restored:true}`.
- `PackageInspection` failure: `{ok:false;stage:'package'|'assembly'|'view'|'demo'|'restore';error:{code:string;message:string};step?:number}`; demo step is one-based.
- Produces `writeWorldPackage(path:string, pack:WorldPackage, options?:{overwrite?:boolean}):Promise<void>` from adapters/world-package-files.ts. CLI must semantically inspect before calling. Writer structurally parses again and stages bytes before publishing.
- loadWorldPackage retains name/path resolution and now delegates parsed JSON to parseWorldPackage. No host, contracts, CLI, package/lock or root scripts edits.

- [ ] Write failing behavioral tests for strict package parsing, detached clone, successful/failed patch sequences, semantic inspection, initial/final text validation and restoration, failed second demo step, and file preservation. Run them and record precise RED reasons; unresolved concurrent engine APIs are dependency blockers, not proof a behavior regressed.
- [ ] Implement strict package envelope and reuse the two shared host parsers. Use existing error codes when available. No module hook executes during structural parsing.
- [ ] Implement patch adapter using default import from fast-json-patch. Only six operations: add/remove/replace/move/copy/test. Validate required fields and pointer syntax: empty root or slash prefix, only ~0/~1 escapes; decode after splitting. Reject __proto__/constructor/prototype segments and inherited path traversal. Array indices must be canonical decimal, in actual bounds and <=2147483647; '-' only in final add-like destination. Object numeric keys remain ordinary keys. Move cannot target a descendant; validate its destination after a library-executed removal on a scratch copy. All actual mutations use the dependency. Use canonical JSON equality for test, including JSON objects with their own hasOwnProperty key. Clone both inputs, and retain correct operation index in errors.
- [ ] Cover the audited library defects: op toString/_get rejected, invalid ~2 rejected, inherited /toString rejected, array /4294967296 rejected rather than wrapping, patch value aliasing prevented, late test failure preserves source, and own hasOwnProperty data compares correctly. Cover valid move/copy/append and escaped keys. Avoid reimplementing a mutation engine.
- [ ] Inspect with createWorld, initial readTextView, optional demo using command.id ?? `demo-${index+1}`, final view, and restoreWorld(snapshot). Verify restored snapshot equals the saved snapshot using canonical JSON. Returning failure must distinguish stage and one-based demo step; default demo has executed:false, steps:0. No save writes or changes to exported initial configuration.
- [ ] Implement staged file publication: create parent directory, write/sync/close a unique sibling temp file, use atomic no-clobber publication by default (hard link then temp removal), or rename for explicit overwrite. Always clean the temp; failure preserves any existing destination. Paths with spaces and same-file overwrite are valid.
- [ ] Run focused tests and relevant world/CLI compatibility checks. Root runs full suite after integration. Write report with exact evidence and limitations; no commits.

### Task 3: CLI round trip, repository readiness and delivery

**Files:**
- Modify: `src/cli/index.ts`, `package.json`, `package-lock.json`, `README.md`, `docs/authoring.md`, `THIRD_PARTY.md`, `scripts/smoke-built.mjs`, `scripts/package.py`, `.github/workflows/preflight.yml`
- Create: `tests/authoring-cli.test.ts`, `examples/farm-authoring.patch.json`, `AGENTS.md`, `docs/authoring-progress.md`

**Interfaces:** Consumes Tasks 1–2 exactly. CLI modules/describe use catalog, fork/patch inspect before write, check/validate use the same structured inspection. Existing play/demo/swap retain the same package loader and module registrations.

- [ ] Add child-process CLI tests for modules/describe, farm fork/patch/check/demo, external plugin round trip, malformed/failing patches leaving an existing file intact, explicit same-file overwrite, and JSON diagnostics.
- [ ] Run the new tests before implementing CLI commands; record expected RED. Install pinned fast-json-patch and update version to 0.4.0-alpha.1/repository metadata.
- [ ] Implement the command/flag set from the spec with Node parseArgs. Source/target files are explicit; reject missing/extra positionals or incompatible flags instead of silently ignoring them. All --plugin paths stay explicit.
- [ ] Add a real example patch with a leading test guard, changing a world title and a compatible capacity rule. Run generated files through the existing demo and restored save, including the external author module.
- [ ] Update author docs, source records and GitHub quick-start. Package filenames derive from package version; BUILD.json records the selected repository. Preserve old verification/report semantics and prepare CI for the new authoring smoke.
- [ ] Run full Preflight, TypeScript build and built smoke. Review the complete change and fix concrete findings. Commit the coherent tree, package and independently check the produced archive as applicable.
- [ ] Push current verified history to the empty repository's main branch without force. Report the actual commit and Actions link immediately; do not poll. Record GitHub and verification state in Notion without claiming hosted CI passed.
