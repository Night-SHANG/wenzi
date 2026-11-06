# v0.4 whole-branch engineering review

Recorded: 2026-11-06 23:37 Beijing time (UTC+08:00).

Reviewed range: `6617a6f1ff1e02e9602da07af77b9548381dea75` through `cf7189a` (four commits), against `docs/superpowers/specs/2026-11-06-authoring-design.md`, `docs/superpowers/plans/2026-11-06-authoring.md`, and the project `AGENTS.md`. The review covers the integrated implementation, with particular attention to the previously unreviewed CLI, build/package/CI changes, documentation, and cross-boundary behavior.

## Strengths

- The public boundary remains coherent. `src/engine/index.ts` owns the world/command structural validators and exposes pure parsing wrappers; the authoring layer reuses them and the existing assembly, dispatch, snapshot and restoration authority. The host gains no built-in catalog, gameplay, authoring or platform-IO dependency. The added descriptor has detached JSON metadata and no executable handlers.
- Editing and semantic checking have separate responsibilities. `src/authoring/packages.ts` parses and clones ordinary package data, `src/authoring/patch.ts` delegates mutations to the pinned dependency, and inspection owns a disposable runtime. The CLI passes every forked/patched candidate through inspection before calling the file writer (`src/cli/index.ts:190–206`). Demo execution remains opt-in and its resulting state never replaces exported initial configuration.
- File publication protects existing author data. The adapter validates before staging, synchronizes and closes a unique sibling file, then publishes with no-clobber linking or explicit overwrite renaming. Existing tests exercise competing writers, same-file edits, spaced paths, malformed output, and failed publication. CLI tests additionally demonstrate a late patch failure preserving exact output bytes and a missing required provider preventing export.
- Discovery and authoring are generic. Both built-in and explicitly loaded external modules use the same registry, descriptors, assembly and inspection. No new module-type whitelist, automatic module download/execution, gameplay branch, or graphical UI was introduced. The `WorldPackage` type remains available through `src/worlds.ts`, and package/snapshot formats remain 1.
- The dependency change is limited to `fast-json-patch` 3.1.1, fixed in both package files with integrity recorded. The adapter guards the documented dependency defects, and the earlier move-order finding has a narrow dependency-executed remove/add correction plus regressions. The independent Task 2 scoped re-review approved that correction.
- Delivery changes match the source workflow: archive names derive from package metadata, BUILD metadata identifies the selected repository, and AGENTS.md accompanies the archive. Existing evidence fingerprinting still binds checks to source/runtime inputs and rejects failed or stale reports. The Windows packaging path now has an explicit Python setup and avoids an external timezone database. The CI workflow retains full Git history for bundling.
- Documentation explains the complete author workflow, explicit plugin execution, separate world/view titles, patch index semantics, filesystem limits, Node minimum, and the distinction between local checks and hosted CI. The external-module and authored-farm paths are exercised through real child CLIs and compiled runtime smoke, rather than claimed solely from documentation or fixture tests.

## Findings

### Critical

None.

### Important

None.

### Minor — `--json` does not cover syntactic option errors

**Location:** `src/cli/index.ts:143–148` and `src/cli/index.ts:242–245`.

`jsonErrors` is set only after `parseArgs()` returns. If Node rejects an unknown option or a missing option value, the outer error handler therefore emits plain text even when the caller supplied `--json`. Other CLI argument errors and inspection failures use JSON, so a caller parsing error diagnostics has an inconsistent boundary.

Focused reproduction against the reviewed source:

```sh
node src/cli/index.ts validate farm --json --unknown
node src/cli/index.ts fork farm --json --out
```

Both exit 1 with empty stdout and non-JSON stderr. The observed messages begin respectively with `失败 [CLI_ERROR]：Unknown option` and `失败 [CLI_ERROR]：Option '--out <value>' argument missing`.

**Impact:** diagnostic-format inconsistency for malformed invocations. Valid JSON success/inspection output, semantic validation, file preservation, and the required nonzero failure status are unaffected. This is not a blocker under the spec's expressly scoped JSON success/inspection guarantee.

**Recommendation:** establish error-output mode before strict parsing, while respecting the `--` end-of-options delimiter, or wrap parser errors in an equivalent narrow JSON-mode detection path. Add focused subprocess regressions for an unknown option and a missing option value with `--json`; retain ordinary text diagnostics without that flag.

## Evidence and review limits

The reviewed integration report records 104/104 behavioral tests, 6/6 Preflight checks, strict compilation, and nine compiled-runtime groups passing on Node.js 24.22.1/Linux. The current `artifacts/preflight.json` and `artifacts/built-smoke.json` also record successful checks and input fingerprints. Task 1's independent review is clean; Task 2's initial move-order finding is superseded by its approved scoped re-review. The ledger reports no previously deferred or parked finding.

Those checks were inspected as supplied evidence, not rerun merely for confirmation. The only independent execution in this whole-branch review was the two-invocation CLI probe above, resolving a specific error-format doubt. No broad suite, compilation, preflight, archive build, or smoke run was repeated. Root owns the independent final archive verification.

The release-evidence test's tiny CLI is appropriately scoped to the release-gate protocol; it is not evidence of gameplay or authoring behavior. Real child CLI tests and compiled smoke supply that separate evidence.

No source, test, dependency, index, HEAD, branch or remote mutation was performed. This report is the only file written by the reviewer. No subagents were dispatched.

## Behaviors declined to judge

- Hosted Linux/Windows CI and Windows filesystem execution: configuration was reviewed, but those environments have not run in this session; no platform pass is inferred from local Linux results.
- Hard-link support on every filesystem and crash/power-loss directory durability: the accepted design documents explicit filesystem failure and excludes those stronger guarantees; no universal filesystem guarantee is assessed.
- Isolation or deterministic side effects of explicitly loaded external code: the accepted model is trusted local code, and module imports/hooks are not a security sandbox. Catalog hook non-execution and explicit loading boundaries were assessed.
- Formal graphical UI, network module distribution, multiplayer and large-scale performance: expressly outside this authoring batch and not claimed by the implementation.
- Actual GitHub publication and final archive contents: these are root-owned delivery actions still in progress, not completed outcomes of this code review.

## Verdicts

**Spec compliance: PASS.** The required author workflow, shared validation authority, detached metadata/edits, semantic inspection before publication, explicit plugin boundary, compatibility exports and format preservation are implemented. No material unapproved plan deviation was found.

**Code quality: PASS with one Minor diagnostic-format recommendation.** No Critical or Important corrective change is requested. The small CLI inconsistency above is concrete and separately recorded; it must not be mistaken for an inspection or data-integrity failure.

**Ready for the initial source push: YES from engineering review, subject to root completing its already-owned archive verification.** This verdict does not claim a successful push, a hosted CI pass, Windows acceptance, or a Stable Release. The Minor finding can be fixed before handoff or explicitly ruled on by root; it has not been silently dropped.
