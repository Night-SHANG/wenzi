# v0.5 fresh whole-branch review

Recorded: 2026-11-07 00:36 Beijing (UTC+08:00).

Reviewed base `f86be17cf09323923b0fe747e6d766a292ad360b` through HEAD `2e5e696d2a65307914211163d12a1adece559676`, using the supplied `.superpowers/sdd/2026-11-07-frontier/review-f86be17..2e5e696.diff` (six commits, 32 changed files). The review covered the whole batch and served as the independent Task 3 spec/quality gate. The checkout was clean at the final read-only status check, before this report was created.

## Verdict

**Task 3 Spec Compliance: Approved with minor presentation limitations.** The integrated implementation meets the substantive world, module, authoring, compiled-runtime and save/restore requirements. M1 below is a small external-result validation gap in the view; M2 exposes an existing generic CLI addressing limitation through the new hints. Neither invalidates the ordinary authored worlds or the tested resource/save loop.

**Task 3 Quality: Approved for alpha source publication, with non-blocking follow-up items.** No Critical or Important issue was identified. The two earlier scoped Important findings are addressed in the inspected final code, not merely marked resolved in reports.

**Whole-branch readiness: Approved for the stated alpha source scope.** The final archive must still be produced after this review is archived and independently unpacked/verified before claiming the engineering package is ready. This approval does not assert that packaging, publication, new remote CI, or a Windows device acceptance run has happened. Those remaining delivery gates are distinct from source correctness and are explicitly scheduled in the integration report.

## Strengths and requirement evidence

- **Composition remains generic.** `src/modules/frontier.ts:1` aggregates exactly six ordinary definitions, and `src/catalog.ts:4` adds them only to the convenience registry. The supplied diff does not modify `src/engine`, `src/contracts.ts`, or the CLI implementation, and package/lockfile changes only advance the project version. No new dependency, parallel inventory authority, clock authority, save format or game-type switch was added.
- **Policy, state and presentation are separated.** `src/modules/location.ts:17` has no gameplay dependency; `src/modules/gathering-rules.ts:6` and `src/modules/recipes.ts:10` are stateless catalogs. Gathering owns only cooldowns, crafting owns only its job, and `src/modules/frontier-view.ts:33` owns no gameplay state. `tests/frontier.test.ts:100` removes the view and runs the same economic loop successfully in the reported suite. Future systems can continue to use the open module/capability interfaces.
- **Paid work and cooldown deadlines survive configuration changes.** `src/modules/crafting.ts:90` scales and freezes all inputs, outputs, batches and absolute times before payment; collect/cancel use those saved values (`:105`, `:113`). Current catalog validation runs independently of the saved job (`:64`, `:68`) and never requires the old recipe ID to remain present. `src/modules/gathering.ts:84` checks the existing deadline and stores a new one only after inventory addition. Tests cover edited/deleted recipes, replacement clocks, preserved cooldowns and invalid reconfiguration without replacing the original world.
- **Resource failures share the host transaction.** `src/modules/crafting.ts:96`, `:105`, `:113` and `src/modules/gathering.ts:89` call the bound inventory; neither module writes inventory’s private state. The unchanged host commits only after events and all module validations (`src/engine/index.ts:380`, `:393`, `:401`). Later-input, later-output and later-refund failures compare complete snapshots in `tests/crafting.test.ts:75`, `:78`, `:82`; wrong-location, cooldown and capacity failures do the same in exploration tests. This protects quantities, jobs, revisions and event history together.
- **Time and identity boundaries are explicit.** `src/modules/simulation-time.ts:5` checks the bound clock's cumulative simulation seconds, rejects invalid values and backward baselines, and is shared by consumers. Crafting/gathering reject overflow and additions that cannot advance a deadline. Catalog/site/node lookup uses own properties; state insertion and count scaling preserve legal prototype-like names. External recipe/rule/reference results receive checks before inventory mutation, including the corrected gathering location checks at `src/modules/gathering.ts:38` and independent current-catalog checks at `src/modules/crafting.ts:68`.
- **Optional location is real.** `src/modules/crafting.ts:36`, `:56`, `:79` permits omitted/empty location restrictions with no location module; nonempty restrictions require a provider and enforce start/collect location while cancellation works elsewhere. The behavior is exercised by real host compositions in `tests/crafting.test.ts:86` and `:91`.
- **Both example worlds implement the specified arithmetic.** `worlds/frontier.json:1` and `worlds/frontier-continuous.json:1` preserve world/instance identities, routes, rules and production data while changing the clock and its demo inputs. Their 16 commands collect wood 3 / stone 2 / reed 3, spend wood 2 on plank 2, spend plank 2 / stone 1 / reed 1 on toolkit 1, and sell it for 18. Final raw counts are 1 / 1 / 2, elapsed time is 50 seconds, and no job remains. `tests/frontier.test.ts:34` asserts those literal values for both clocks, with restore/read-only view checks; `:70` checks a mid-job restore and clock replacement.
- **Task 3 uses the actual author and CLI paths.** `scripts/smoke-built.mjs:24` discovers every built-in world through compiled CLI `list`, runs each demo, writes a real save and restores it. `:63` forks and patches frontier using the generic authoring commands, checks the independent changed expectation of wood 2 and 18 coins, and `:80` feeds an actual `play` process the full loop, a save to a path containing spaces, subsequent movement/gathering, load and a second save. It rejects interactive error text and compares the complete before/after snapshots. This is materially stronger evidence than source tests or a simulated CLI alone.
- **Documentation states the actual scope.** `docs/frontier.md:16` supplies a runnable production loop and explains explicit simulated time, save/load, frozen orders, cancellation and replacement. README, progress and third-party notes distinguish local results, prior baseline CI and unimplemented product/platform features. The release-evidence test's tiny protocol fixture remains packaging-test machinery; it is not presented as gameplay evidence.

## Critical findings

None identified.

## Important findings

None identified.

The previous exploration external-reference issue is fixed by `src/modules/gathering.ts:38` and its reference checks, with real external-provider regression coverage. The previous crafting active-job/catalog issue is fixed by unconditional current-catalog validation at `src/modules/crafting.ts:68`, separately from frozen-job validation. The final code preserves both collection and cancellation after rejecting an invalid replacement.

## Minor findings

### M1 — Malformed external site locations silently disappear from the view

**Location:** `src/modules/frontier-view.ts:49` (with the resulting fallback at `:68`).

The view checks the sites array and row objects, then filters by `site.location === locationId` before validating that `location` is a valid string ID. An external gathering provider returning a row with `location: 42` or a missing location therefore renders the normal “采集：此处没有采集点” message. It hides a provider contract error as valid absence instead of following the view's existing `INVALID_VIEW_DATA` path.

**Evidence:** One read-only, inline real-host probe replaced only the gathering provider with a valid capability manifest and a sites result containing `location: 42`. Assembly and `readTextView` succeeded, the output was exactly `["采集：此处没有采集点"]`, and the complete snapshot remained unchanged. The host only guarantees JSON-compatible query results (`src/engine/index.ts:338`), so it does not supply the missing field validation.

**Suggested follow-up:** Validate each site's location ID before filtering to the current location; add a focused malformed external-site regression that expects a clear rendering error. Severity is Minor because this is presentation of an incompatible external provider; the built-in provider supplies valid IDs and no resource/state mutation occurs.

### M2 — Generated action hints cannot address valid provider IDs containing whitespace

**Location:** `src/modules/frontier-view.ts:61`, `:66`, `:74`, `:75`, `:81`; existing parser limitation at `src/cli/index.ts:113`.

The new hints interpolate the provider instance ID directly into the whitespace-delimited `do` syntax. The host accepts nonempty instance IDs containing spaces (`src/engine/index.ts:29`), but the CLI reads target/action as two non-whitespace tokens. Thus an author can create an accepted world whose printed hints are unusable.

**Evidence:** A second case in the same inline probe renamed the ordinary location instance and its bindings to `map nodes`. The view emitted `前往 林地：do map nodes move {"to":"forest"}`. Applying the exact existing CLI parser produced target `map`, action `nodes`, and JSON input beginning `move`, which fails JSON parsing. Direct host dispatch to target `map nodes` succeeded. No world file or CLI source was modified for this probe.

**Suggested follow-up:** Provide a generic way to address such IDs through the CLI, or clearly document/validate the CLI's token restriction at the authoring boundary and avoid presenting an impossible command as executable. Simply wrapping the ID in quotes will not fix the current parser. This is an existing generic CLI addressing limitation newly exposed by the dynamic hints; ordinary token-safe IDs, including the supplied worlds and prototype-like IDs, work. It does not require a frontier-specific CLI branch and is not an alpha source blocker.

### M3 — Retained baseline issue: early argument-parser errors do not honor `--json`

**Location:** `src/cli/index.ts:143`, `:148`, `:244`; already recorded in `docs/authoring-progress.md:30`.

`jsonErrors` is set only after strict `parseArgs` succeeds. An unknown option or missing option value thrown before that assignment reaches the plain-text error branch even with `--json`. Source inspection confirms the documented limitation remains; the CLI is unchanged in this branch. Valid command outputs and structured runtime/authoring errors are unaffected, and the process still exits unsuccessfully. This remains a Minor automation-formatting issue, not a new regression or a data-preservation failure.

## Verification performed and evidence limits

Read AGENTS.md, README/authoring guidance, the exact design and plan, decisions, all task reports/scoped reviews, the supplied whole-branch diff in bounded chunks, and the referenced final source. Inspected the unchanged host transaction/query paths, numeric/schema helpers, inventory behavior, CLI parser/save/load paths, fingerprint scope and packaging gates where they matter to this review. The diff was not regenerated.

Read `artifacts/preflight.json`, `artifacts/built-smoke.json` and the final Preflight log summary. They record 154 passing tests, zero failures/skips, 6/6 Preflight checks including strict typechecking and all eight worlds, plus 13 compiled-runtime groups. The built report records both frontier demos as 16 actions/revision 16 and the actual interactive save/load group as 18 actions with restored revision 16. The integration report records successful build execution.

Independently recomputed both existing content fingerprints without rerunning suites or replacing evidence:

- Preflight: `71a5cbf33ad4556f7c4d78cf3cf7d3e95e6da86c647ae01d1f7325d6a5cb7a3b` — exact match.
- Built smoke: `eea1857d363a58c1e874f7a87132dc13e900f63c2fcaa4e85e936f204f15078c` — exact match.

The only behavioral execution added by this review was the single inline probe with the two concrete, previously uncovered presentation cases above. No broad test/typecheck/build/smoke rerun was performed. Historical test counts are the recorded executions, not newly claimed reviewer executions. Task 2's initial import-only RED remains accurately disclosed; its later fix regression and Task 3's behavioral RED evidence are separately documented.

No production code, tests, index, HEAD or branches were changed. Only this authorized report was written.

## Declined to judge

- Final archive integrity, independent unpack/startup, archive/source-tree correspondence and successful publication: these are remaining delivery actions after review archival, not observed outcomes of this review. `scripts/package.py:34` checks matching successful evidence, but inspecting that gate is not equivalent to executing final packaging.
- New hosted CI, Windows device acceptance and platform behavior beyond the recorded local Linux/Node runtime. Prior run 42246209860 is baseline evidence only.
- Complete-game quality, long-term economy balance/fun, browser/visual UI, MMO/networking, hostile plugin isolation, anti-cheat or large-scale performance. These are explicitly outside this alpha batch and are not implied by passing engineering checks.
- Independent re-audit of the original Widelands research or a legal licensing opinion. This review verified that the batch adds no dependency or copied third-party implementation and that the documentation describes its reference-only scope; it does not independently certify upstream historical research.

No requested source-readiness or Task 3 implementation question was otherwise left unjudged.
