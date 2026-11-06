# v0.6 whole-branch and Task 4 independent review

Reviewed base `e3b09d81c5edb1d5cae87f91a02db25be51c0848` through source head `4a0d753c7356b1e1946c12709638113fdc569f20` on `feat/campaign-loop`. The supplied ten-commit diff was inspected in scoped passes. The design, implementation plan, Task 4 brief/report, decision ledger, Task 1–3 reports/reviews/fix reviews, and the extra frontier Unicode report were used as requirements and attributed evidence. The requesting-code-review/code-reviewer guidance was applied.

This is the independent Task 4 specification/quality gate as well as the whole-branch review. It is not another copy of the three narrow module reviews. Particular attention went to actual-provider composition, host transaction boundaries, CLI compatibility, text-view binding, world data, published-module migrations, and the distinction between gate fixtures and actual compiled runtime evidence.

## Verdicts

- **Task 4 specification: CHANGES REQUESTED for one bounded Minor/P3 compatibility regression.** The main campaign, JSON transport, view, migration, and integration requirements are met; the explicit promise to retain the old token command form is not fully met for legal instance IDs beginning with `{`.
- **Task 4 code quality: ACCEPTABLE WITH THE SAME FIX.** No independent Critical or Important implementation defect was identified. The parser branch can be corrected locally without changing the host, contracts, or game modules.
- **Extra frontier Unicode/migration correction: PASS.** Actual code and added tests were inspected, including preserved paid jobs/cooldowns and rejected migration origins.
- **Whole-branch readiness: WITH FIXES.** Close the single demonstrated parser regression in the planned bounded final correction, then refresh verification whose source/compiled inputs change. Packaging, independent archive verification, publication, and the final publication record remain root-owned subsequent steps, not results certified by this source review.

The P3 severity reflects its narrow trigger, lack of state loss, and working full-JSON alternative. Requesting its correction before completing this batch follows the explicit compatibility requirement and root's stated decision to fix confirmed findings; it does not make this a critical gameplay failure.

## Strengths

1. **The composition preserves a single authority for each resource.** `src/modules/campaign.ts:13` exports ten ordinary definitions; `src/catalog.ts:8` adds them to the convenience catalog. The prepared diff contains no `src/engine` or `src/contracts.ts` changes and no dependency version changes. Both campaign configurations bind the same actual inventory, location, production, market, clock, progression, health, encounter and quest providers. The views are removable without becoming gameplay authorities (`tests/campaign.test.ts:104`).

2. **Combat rewards and quest progress line up correctly.** `src/modules/encounters.ts:81` leaves killing attacks separate from claiming rewards, grants all loot and positive XP before increasing the claimed-win counter, and shares cooldown/cleanup with the same host transaction. `src/modules/quests.ts:97` records those counters at acceptance; `quests.ts:112` consumes delivery, awards resources/XP, records completion and removes the active quest atomically. The host's actual nested-call, event and final-validation code was read to verify that these operations really share rollback. No second inventory, XP or money ledger is introduced.

3. **Frozen work and current configuration are checked independently.** Encounter validation checks the current catalog while preserving a saved battle's own enemy/reward/location terms. Quest validation checks current references while accepted definitions retain their original requirements and rewards. Old encounter counters and old completed quest IDs survive deletion as specified. The real-provider campaign tests cover changed quest rewards, a capacity-blocked victory followed by retry, a fresh repeat-patrol baseline, defeat followed by crafted recovery, and an active battle/quest save restored across the clock change (`tests/campaign.test.ts:49`, `:64`, `:87`, `:113`, `:132`).

4. **The two authored worlds match the numerical route.** Both configurations contain 20 instances and 46 demo commands, sharing `world.campaign` and instance IDs. The continuous variant changes clock configuration/advance inputs and presentation titles. The literal thresholds, stats, encounters, cooldowns, quest rewards, tonic recipe, and sale prices match the design. The integrated assertions pin XP105, level3, HP22/34, coins16, time60, wolf2/raider1, all three tasks completed once, and empty pending battle/crafting state (`tests/campaign.test.ts:23`). The post-demo repeat patrol tests a further playable loop rather than only an initial showcase.

5. **The new display stays behind public capabilities.** `src/modules/campaign-view.ts:61` composes a bound base `text-view`; it imports no frontier implementation or mutable gameplay state. It checks the consumed envelopes, IDs, counts, booleans, HP/phase consistency and quest ready/status relationship before rendering. `boundActionCommand` resolves the actual provider for each hint (`src/presentation/actions.ts:22`). Malformed readiness, inconsistent battle phases, Unicode bounds, pure rendering and renamed instance bindings have concrete tests. The existing frontier's non-current gathering location field is now checked before filtering (`src/modules/frontier-view.ts:48`).

6. **The published-module correction is bounded and compatible.** `src/modules/crafting.ts:13`, `src/modules/gathering.ts:19`, `:35`, `:43` use Unicode code-point bounds consistent with the shared schema. Only implementation versions move to 1.0.1; capability/state versions stay stable. Their migrations check the exact prior identity, 1.0.0 version and stateVersion1, preserve state, and rely on the host's normal schema/invariant validation (`crafting.ts:84`, `gathering.ts:68`). The frontier view migration additionally requires an actually empty old state (`frontier-view.ts:94`). Added tests perform real inventory deductions/time advancement before restore, preserve remaining deadlines, and reject unsupported origins and malformed historical states (`tests/gathering.test.ts:74`, `:88`; `tests/crafting.test.ts:179`, `:192`).

7. **Release evidence is now clearly separated from unit fixtures.** `tests/release-evidence.test.ts:52` labels synthetic packaging evidence as such; it no longer supplies a fake game CLI to impersonate a successful runtime. Actual failing scripts replace prior success records, and stale/missing/failed evidence is rejected by packaging. The real `scripts/smoke-built.mjs` exercises compiled CLI authoring, save/load, all discovered worlds, the external module, and all 46 campaign actions after renaming every instance to IDs containing whitespace and quotes. The synthetic fixture is not counted among the actual 18 runtime groups.

## Issues

### Critical

None identified in the reviewed scope.

### Important

None identified in the reviewed scope.

### Minor / P3 — A legal legacy target beginning with `{` is misclassified as a JSON command

**Exact source:** `src/presentation/actions.ts:14`. The interactive caller is `src/cli/index.ts:115`; coverage belongs beside `tests/command-text.test.ts:5` and the actual CLI compatibility cases.

**Trigger and reproduction:** Use `{map` as a location instance ID, updating the world's location bindings. This is a legal, whitespace-free instance ID. The previously supported input is:

```text
do {map move {"to":"forest"}
```

The old token parser reads target `{map`, action `move`, and object input normally. The new parser sees the leading `{` and unconditionally passes the entire remainder to `JSON.parse`, which throws before legacy parsing is attempted.

**Fresh independent observation:** A narrow stdin Node probe imported the actual registry, host, frontier world loader, and new parser. It renamed the actual location instance/bindings to `{map`, assembled the world, parsed with the former token expression, and successfully dispatched the movement. It then asserted that `parseActionCommand` rejects the same legacy input with `SyntaxError`, and that full-JSON formatting/parsing still round-trips the same command. The probe exited 0 and printed:

```text
valid-existing-target-and-prior-legacy-parser forest
new-parser-rejects Expected property name or '}' in JSON at position 1 (line 1 column 2)
json-format-workaround works
```

No probe file or repository source/test mutation was made. The current unit tests cover ordinary legacy IDs and complicated IDs through full JSON, so the existing green suite does not answer this particular compatibility question.

**Impact:** Existing user scripts or saved-world instructions using such legal IDs stop working after the update. It is a compatibility regression against the explicit Task 4 requirement to retain legacy token commands. The failure occurs before dispatch, so it does not corrupt state. Authors can work around it with `do {"target":"{map","action":"move","input":{"to":"forest"}}`.

**Correction direction:** Distinguish a complete JSON command from a valid legacy token command instead of treating the first character alone as decisive. For example, permit a syntax-failing JSON attempt to use the valid legacy grammar, while still validating both forms through `parseCommand`. Do not let a successfully parsed but structurally invalid JSON command bypass unknown-field/input validation through fallback. Add a focused regression for a brace-prefixed target, confirm full-JSON malformed/unknown-field rejection stays intact, and exercise at least one real CLI dispatch with that target. No host/schema changes are needed.

### Documentation issue already addressed during review

The reviewed commit's `README.md:3` still advertised 0.5.0-alpha.1 despite the updated package and introduction. Root corrected it in the permitted documentation-only updates. I reread the current line and confirmed `0.6.0-alpha.1 · 模块化任务、战斗与成长`. It is closed, not an outstanding finding. Root also updated progress/report text with the completed compiled smoke; those documentation edits did not alter either verification fingerprint.

## Evidence actually inspected and its limits

- `artifacts/campaign-preflight.log` reports **251 tests, 251 passed, 0 failed**, and all ten actual world demos/restores. `artifacts/preflight.json` records **6/6 passed**, Node24.22.1, timestamp `2026-11-06T17:29:08.073Z`, and source fingerprint `bd949584deee8a6d7f1c7277779d1d22669beb425ee6c1efa380a6e6a553355e`.
- `artifacts/campaign-build.log` records the 0.6.0-alpha.1 `tsc` build. Its success is root-run evidence, consistent with the actual compiled smoke results; this reviewer did not rerun the build.
- `artifacts/built-smoke.json` records **18/18 successful groups**, timestamp `2026-11-06T17:29:59.815Z`, and compiled fingerprint `d035e569146b50d84cfcbe89e8e30d1dfc48c4a7df462ee74e073f06fbee7289`. I read the actual report and the changed smoke implementation; I did not rely only on the owner's message. Its groups include all ten worlds, the external module, four authoring scenarios, two interactive save/load scenarios, and the arbitrary-ID campaign.
- I independently recomputed both fingerprints with the existing read-only helper and asserted equality with the saved reports. Both matched the current bytes. This verifies evidence freshness; it is not a claim that I independently reran those suites.
- The sole additional behavior execution by this review was the narrow brace-prefixed legacy-ID probe described above. No unchanged/global test suite was rerun, and no source, index, HEAD, branch or commit was modified. This report is the review lane's only written file.
- The supplied Task 1–3 owner reports distinguish scaffold/import failures, fixture failures, interrupted runs and behavior failures. I did not relabel the initial import-only encounter RED or vanished execution handles as behavioral success. Prior reviews and their Unicode fix verdicts were read as attributed evidence; the new code was inspected for cross-module integration rather than treating those verdicts as a replacement for this review.

## Declined to judge

- **Formal browser UI, MMORPG/network authority, sandboxing of hostile JavaScript, richer campaign content and long-term numerical balance:** explicitly outside v0.6; their absence is not a missing feature in this batch.
- **A trusted capability provider deliberately lying with plausible successful mutation results while violating its own contract:** the scoped contract requires checking consumed public data, not proving arbitrary JavaScript internals; no new security boundary is claimed here.
- **Requiring an active frozen battle's location to equal a newly reconfigured location provider's current location:** the existing scoped review/ledger accepts reference validity and the source-filtered movement veto; no additional relocation restriction is specified or needed for the delivered route.
- **Validating unused fields in foreign query responses or requiring the text view to reimplement full provider validation:** consumers check the fields they actually use, while actual providers and host validation retain their own responsibilities. No broad foreign-schema framework is warranted by this change.
- **Dense one-line module/test formatting:** it increases reading effort, but no additional functional error was established and it follows the surrounding style; not a bounded final-release correction request.
- **Independent legal certification of upstream licensing or proof of historical source provenance:** this review inspected the added TypeScript, imports, lockfile and attribution boundaries; it did not independently fetch/re-audit upstream repositories. The documentation states conceptual adaptation and does not present upstream code as imported.
- **A completed distributable ZIP, independent unpack/hash/runtime/Git-bundle verification, remote main update, Notion publication record, or new CI success:** those are later root-owned delivery steps. No final v0.6 archive/publication/CI evidence was supplied for this gate, and none is inferred from older releases or from passing source/runtime checks.

## Recommendations and assessment

Use the single bounded final correction for the demonstrated legacy-parser case and its focused regression. The other implementation areas do not need another broad redesign or repeated unchanged review. Since that correction changes verification inputs, root should regenerate the affected evidence before packaging; the fingerprints above certify only the currently reviewed bytes.

**Ready to merge? With fixes.** The actual modular campaign, transactional rewards/quests, compatible frontier migrations and compiled CLI integration are supported by the inspected code and fresh matching evidence. Close the one narrow compatibility regression, then finish the planned release-package/publication gates without treating this source review as evidence that those later steps have already happened.
