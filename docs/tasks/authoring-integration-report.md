# v0.4 root integration evidence

记录：2026-11-06 23:33 北京时间（UTC+08:00），由可信 UTC 时钟换算。

## Changes

- Added CLI modules/describe/fork/patch/check and enhanced validate, using the two independently implemented public layers. CLI checks argument/flag compatibility, emits parseable JSON diagnostics, and inspects candidates before writing output.
- Kept existing demos, interactive play, saves, restoration, swap and explicit external plugins. Added a real farm patch and documented the complete author workflow.
- Pinned fast-json-patch 3.1.1 with its lock integrity, set version 0.4.0-alpha.1 and the user-selected GitHub repository metadata, and recorded source/compatibility decisions.
- Built-runtime smoke now also discovers modules, authors and runs a physical-capacity farm, restores its file save, and authors/runs an external research module to progress 13.
- Packaging derives the archive filename from package metadata, records repository identity, includes AGENTS.md, and uses UTC+08:00 without an external timezone database. CI explicitly installs Python 3.11, retains full source history, and runs packaging after Preflight/build/runtime checks on both configured platforms.

## RED and GREEN

Initial `node --test tests/authoring-cli.test.ts`: seven failures, one pass. Failures showed missing modules/fork/patch commands/options and non-JSON validate output. The one negative test was too permissive because argument rejection also preserved the file; it was strengthened to require the actual test-operation diagnostic. Its focused pre-implementation run then failed as intended because old CLI rejected --patch rather than executing a failed JSON Patch test.

After implementation, `node --test tests/authoring-cli.test.ts tests/cli.test.ts` exited 0: 14/14 passed (nine new authoring CLI behaviors and five existing CLI behaviors). This executes actual child CLIs, filesystem output, public modules and restored saves; no module execution is mocked.

The updated packaging-identity assertion initially failed: the fixture version 1.0.0 still produced the hard-coded modular-text-world-0.3.0-alpha.1.zip name. After the packaging change, `node --test tests/release-evidence.test.ts` exited 0: 3/3 passed. Its isolated minimal CLI is only a release-gate protocol fixture; application behavior is covered by the real CLI tests and compiled smoke.

## Final integrated checks

- `node scripts/preflight.mjs`: exit 0, **6/6 checks**, **104 tests passed / 0 failed**, at 2026-11-06 23:31 北京时间（UTC+08:00）. Includes strict typecheck, module boundary check and all six world executions/restores.
- `node node_modules/typescript/bin/tsc`: exit 0; produced the actual JavaScript used below.
- `node scripts/smoke-built.mjs`: exit 0 at 2026-11-06 23:32 北京时间（UTC+08:00）. **9 groups** passed: six built-in world configurations, external module, authored farm and authored external module. Each child starts from a separate temporary working directory; file save/restore is real.
- Evidence fingerprints are stored in artifacts/preflight.json and artifacts/built-smoke.json and consumed by the offline packager. Their input scopes include changed code, scripts, lock/dependency files and world/author examples as applicable.

Task 1 review approved. Task 2 review's move-order finding was fixed by dependency-executed remove/add with focused regression and scoped re-review approval. No remaining actionable Task 1/2 finding.

## Remaining delivery steps and limits

Whole-branch review, final archive verification and initial GitHub main push follow this report. No hosted CI pass, Windows runtime pass or Release upload is claimed by these local results. This is a trusted-local authoring workflow and alpha host, not a graphical editor, full game, network module installer or MMORPG implementation.

The established source history is preserved. Root alone stages/commits/pushes. The user's request authorizes the initial push to Night-SHANG/wenzi; report it immediately and do not poll Actions.
