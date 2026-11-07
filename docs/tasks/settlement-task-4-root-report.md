# Task4 Root consumer/view implementation report

2026-11-07 13:42 Beijing (UTC+08). Root owns staged integration; world/CLI lane remains separate and uncommitted.

## Scope

`quests.ts` definition1.2.0/capability1/state1 makes progression optional but checks every current and frozen nonzero-XP promise; exact own1.0/1.1 migration retains state. Bound progression is still validated even for zero-XP worlds. Existing turn-in atomic payment/reward behavior is unchanged. Legacy party migration assertion updates only its expected current version.

`view.settlement.text` reads location, time/calendar, wallet, actual inventory, commerce quotes, planting and quests through public capabilities. It checks consumed field shapes, ID uniqueness, counts, phase relationships, cross-bound wallet/inventory/time consistency and every one-unit quote echo/reason. Ordinary refusals are displayed and unavailable buy/sell hints omitted. Capacity is expressly checked at actual trade. Calendar day display uses BigInt addition to avoid unsafe dayIndex+1.

`view.workshop.text` composes a base view and one bound crafting/recipe instance. It shows frozen job terms without requiring a deleted current recipe, checks ready/remaining/duration relationships, gives start only while idle and collect only when ready, plus explicit cancel. Multiple wrappers chain by bindings; every action uses boundActionCommand. Base title is preserved, config.title labels each workshop. Both views have empty state and strict configuration; no gameplay authority/private reads.

`text-view-data.ts` shares small presentation readers between the two views; no new host validation framework. `settlement.ts` and catalog register all10 definitions. Old party-world global counts updated53→63/14→16; old game data untouched. The independent world lane supplies both new files before global validation.

## Actual validation

- Initial zero-XP RED: `node --test tests/settlement-consumers.test.ts` 7 tests,2pass/5fail; actual dependency/version behavior failures recorded in artifacts/settlement-consumers-red.log.
- After implementation, `node --test tests/settlement-consumers.test.ts tests/quests.test.ts tests/party-consumers.test.ts` 33pass/1fail. Only failed expectation was current journal version still1.1 in the old party test. Corrected the assertion to1.2; `node --test --test-name-pattern='quests reject ambiguous' tests/party-consumers.test.ts` passed1/1, no skipped reported.
- View RED: `node --test tests/settlement-views.test.ts` exited1 because new view imports did not exist. This proves missing implementation only; it is not claimed as a behavioral assertion RED.
- View GREEN: same command passed5/5, including malformed public providers, contradictions, ordinary closed status, bound Unicode/whitespace hints, readonly snapshots and frozen deleted-recipe job display.
- Final `node --test tests/settlement-consumers.test.ts tests/settlement-views.test.ts` passed12/12,0failed/0skipped,exit0 (artifacts/settlement-root-focused.log).
- Scoped `tsc --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --verbatimModuleSyntax --erasableSyntaxOnly --rewriteRelativeImportExtensions --skipLibCheck src/modules/settlement-view.ts src/modules/workshop-view.ts src/modules/text-view-data.ts src/modules/quests.ts` exited0 with no diagnostics (artifacts/settlement-root-scoped-types.log). This checks those files and imports, not the whole project.

## Review scope and follow-up

The standalone view tests deliberately use public fixture providers to exercise invalid responses; real-provider composition/actual command execution is in settlement-world.test.ts from the independent lane. That lane also covers hours changing during paid production, closing the calendar task review's cross-task cannot-verify item. Root performs aggregate preflight/build/smoke and wholebranch review after all files stabilize.
