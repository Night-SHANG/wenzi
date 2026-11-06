# Final whole-branch review

Reviewed baseline `e929a05` through HEAD `95cb403f44b4794a9434687e181657c69e5c91aa`, using the whole-branch review package, current implementation, public contracts, design, execution plan, progress ledger, README and author guide. The earlier host and module reviews, including their approved correction rounds, remain supporting evidence. This review concentrates on the previously unreviewed CLI, persistence adapters, world loading, build and delivery paths, and their interaction with the modular host.

## Verdict

- **Spec compliance: approved within the stated technical-foundation scope.** The implementation supports independently assembled trusted local modules, reusable transactional state, explicit migrations, interchangeable example policies, an external author module, file persistence and an author CLI. No new important runtime or architectural defect was identified.
- **Quality: approved with one nonblocking release-tooling finding, F1.** Current supplied fresh verification supports this reviewed revision. The packaging gate could nevertheless consume a stale successful report after a later failed smoke run; correct that before relying on it as an unattended release gate.
- **Critical: 0. Important: 0. Minor: 1.**
- This is approval of the reviewed implementation and its supplied Linux evidence, not a claim that the final archive has already been produced and independently exercised, Windows has passed, GitHub Actions has run, or a finished game/UI/MMO exists. Final artifact production and delivery are still root-owned steps.

## F1 — Minor: failed built smoke preserves an earlier successful report

Locations: `scripts/smoke-built.mjs:15–31`; consumer `scripts/package.py:35–39`.

The built smoke writes `artifacts/built-smoke.json` only after all checks succeed. If a later run fails, its `finally` removes the temporary save directory but does not invalidate a previous green report. Packaging subsequently tests only the stored report's `ok` flag. A caller that runs packaging after a failed smoke can therefore ship the old success record alongside the current failing runtime. The report also has no tested-input identity for packaging to compare, so edits after a success have the same evidence limitation. The archive's SHA-256 manifest describes packaged bytes; it does not establish which bytes the previous test exercised.

Focused reproduction, without modifying this checkout: create a temporary working directory containing `artifacts/built-smoke.json` with `{ "ok": true, "timestamp": "prior-success", "results": [] }`; run the actual smoke script by absolute path from that directory, which deliberately has no `dist/cli/index.js`. Observed **exit code 1**, while the report remains byte-for-byte unchanged with `ok: true`. The consumer's acceptance of that unchanged flag follows directly from its three-line validation at the cited location; the full packager was not executed for this probe.

Recommended correction: invalidate the old report before attempting the smoke and write an explicit failed report on errors. If packaging is intended to enforce that its contents were tested, record and check hashes of the relevant source/build/world/plugin/package inputs, or run the required gates as part of one fail-fast release operation. This needs a focused failure-path check, not a repeat of unrelated gameplay tests. Severity is minor for this delivery because root supplied a fresh successful build/smoke for the reviewed code and there is no evidence that the actual current report is stale or false.

## Reviewed behavior and boundaries

| Area | Assessment |
| --- | --- |
| Modular host | The host imports JSON/version validation and public contracts, with no gameplay catalog, mandatory clock, inventory or fixed game-kind dispatch. The catalog is a convenience at the application boundary. The external research example uses the same registry and command/query interfaces. |
| Transaction and persistence boundary | Public state/query results are detached; nested calls and queued handlers share commit/rollback. Stored snapshots include authoritative state and bounded successful command receipts. The prior receipt-cursor and explicit own-capability fixes are present. Restore and replacement validate the assembled candidate, retaining the old runtime on failure. |
| Time and replacement | The prior planting correction persists per-plot elapsed baselines and has explicit state-version migration behavior. The README accurately explains rejection of occupied legacy state without history, compatible policy changes, and deduplication reset on replacement. |
| World loading | Built-in names resolve relative to the module URL, which resolves to the repository/package `worlds` directory from both source and built JS. Explicit JSON paths resolve from the invocation directory. The loader validates the package envelope and basic demo entries; host validation handles world/config/input details before executing them. Importing world JSON alone does not import module code. |
| CLI | Explicit local plugins register before assembly/restore. Demo actions reject failed dispatches with a nonzero process result. Interactive actions report failures; load and swap render a new candidate before assigning it, preserving the current session on candidate errors. Save reports success only after the awaited file write. Standard-input command processing is sequential. |
| Text boundary | Text rendering is an adapter over an explicit entry query and validates `{title, lines}`. A world without a view still gets a usable generic author display. Presentation is not privileged host state. |
| File and memory storage | File serialization precedes destination mutation; writes use a unique adjacent temporary file, flush and close it, then rename. A failed write does not intentionally replace the existing destination. Memory storage copies on both save and load. Runtime validation remains responsible for loaded data. |
| Build/runtime package | TypeScript rewrites relative `.ts` imports for JS output. The archive script includes source, built JS/declarations, worlds, examples, scripts, project docs, production dependencies and their files, verification records, an offline Git bundle and content hashes. It excludes compiler/type-only development dependencies; the documented source-development route is `npm ci`. The project is private and does not claim to be a published npm library. |
| Checks and CI | Preflight invokes actual typechecking, behavior tests and assembled-world executions rather than generating placeholder results. The built smoke uses a separate working directory and checks file/snapshot restore equality. The prepared workflow has Linux and Windows jobs, but its presence is not evidence of an actual hosted run. F1 qualifies report reuse. |
| Documentation | Scope distinguishes a technical foundation, authored examples and CLI from final UI/game content, multiplayer, hostile-code isolation, external source imports and balance. Third-party runtime dependencies are identified; mature-game research is not represented as copied or integrated game code. |

## Evidence actually used

Inspected the implementation and relevant whole-branch changes, contracts, design/plan/ledger, README/authoring/source notes, current tests, prior scoped reviews, package/build/check scripts and workflow. Root supplied the fresh **6/6 Preflight, 65 passing behavior tests, strict typecheck, successful compilation, six built world demos with save/restore, and external plugin smoke**. The on-disk `artifacts/preflight.json` and `artifacts/built-smoke.json` contain matching successful summaries. These are supplied integration results, not tests re-executed by this reviewer.

Reviewer execution was limited to the concrete F1 temporary-directory failure probe described above, plus read-only inspection. No broad test suite was rerun, no source/index/branch changes were made, and no agents were delegated. The only checkout write is this review report.

## Deliberately not raised as defects

- No hostile-code sandbox, remote authority, networking, cross-server transfer, database durability protocol or MMO-scale performance: these are explicitly outside the trusted single-process foundation. Call/event budgets are error containment, not execution isolation.
- No final graphical UI, game balance, AI, pathfinding or real-time clock loop: the current examples and author CLI state those limitations. Their absence does not defeat the modularity proof.
- No guarantee against power loss after directory rename: storage flushes the file but does not fsync its parent directory. It does not claim crash/power-loss durability, so that stronger persistence contract is not imposed here.
- No automatic downloading of external module dependencies or plugin metadata embedded in saves: explicit local plugin loading is the documented author workflow. Plugins must be provided again when restoring their worlds in a new process.
- No requirement that `validate` execute a world's demonstration script or render every possible view: it currently reports that a world can assemble. Actual demos and text rendering have separate execution paths.
- No requirement to reject all historically unreachable but schema-valid hand-edited game states or cryptographically authenticate local JSON. The supported guarantees are declared invariants and consistent host metadata.
- No additional broad testing or stylistic refactor requests. Prior scoped defects are already corrected; this bounded review found no reason to reopen those complete scopes.

## F1 correction — scoped final re-review

Reviewed `.superpowers/sdd/2026-11-06-runtime/final-fix.patch`, `docs/tasks/release-fix-report.md`, the shared fingerprint helper, the modified preflight/smoke/package paths, and the three release-evidence regressions. Scope is F1 and possible breakage introduced by its correction; no new broad audit was performed.

**F1: addressed. Updated quality verdict: approved within the stated foundation scope, with no remaining actionable finding from this review. Spec approval is unchanged.**

Both verifiers now replace prior evidence with a non-success `running` report before performing their checks, then persist failed evidence on caught errors. Preflight also records non-success when an individual check fails. Successful reports include a content fingerprint checked both before and after verification. Packaging requires an explicit boolean success and recomputes the applicable fingerprint before creating the bundle/archive, rejecting old reports without fingerprints and mismatching current inputs.

The fingerprint covers verification/package scripts, package metadata/lockfile, launchers, configuration, worlds, external examples and installed production dependencies. Preflight additionally covers source/tests/CI; smoke additionally covers the built runtime. Sorted normalized relative names and file-content hashes avoid dependence on directory traversal order or modification times. Required entry files are checked explicitly; missing inputs or symlinks fail closed. Documentation, artifacts and Git metadata are excluded intentionally, allowing final review/progress notes and archive output without invalidating runtime checks. No new runtime, state-storage or plugin-loading changes are introduced.

Fresh reviewer execution: `node --test tests/release-evidence.test.ts` — **3 passed, 0 failed, exit 0**. This confirms failing smoke/preflight replace prior success, a baseline fixture archive can be built, changed relevant inputs and missing CLI are rejected, and a real throwing child CLI leaves failed evidence that blocks packaging even after its bytes are restored. The fixture's synthetic preflight and minimal CLI are correctly disclosed as release-gate tests; they are not represented as application integration evidence. The supplied strict typecheck and fresh full preflight remain root evidence; neither was redundantly rerun here.

Remaining limits are unchanged and do not reopen F1: the release workflow trusts its local reports and assumes files are not concurrently edited during packaging; fingerprints are content identifiers, not signatures. Final application build/smoke, archive extraction/runtime verification, hosted CI and Windows results must still be reported according to what root actually completes. This re-review made no source/index/branch changes; only this report was appended.
