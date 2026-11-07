# v0.9 settlement — fresh whole-branch and Task4 integration review

Review completed 2026-11-07 13:57 Beijing (UTC+08:00). Reviewer: `final_review_settlement_v09`. Base `cb414feef8ede9f7486e1be68cc90c1160cd2134`; reviewed HEAD `6bb6fb5fd20ac45a30288a8046cd869733402752` on `feat/settlement-economy`.

**Task4 specification compliance: With fixes. Task4 quality: With fixes. Overall ready to merge: With fixes.** One Important integration defect prevents the documented swap between the two shipped settlement worlds. No Critical finding and no additional new Minor finding. The finite economy, consumer changes and core policies otherwise meet the reviewed contract. The existing successful gates are real evidence for the cases they execute; they do not cover the failing shipped-package swap.

## Review method and scope

Applied `superpowers/subagent-driven-development/references/final-review.md` and `superpowers/requesting-code-review/code-reviewer.md`. Read repository AGENTS.md, the complete binding settlement spec and plan, the decision ledger, all five implementation reports and all four scoped reviews. Reviewed the supplied seven-commit, 47-file package `.superpowers/sdd/2026-11-07-settlement/review-cb414fe..6bb6fb5.diff` in bounded passes, including production modules, test behavior, both world files, CLI smoke, documentation, version and attribution changes. I did not rederive the branch diff or delegate another review.

This was read-only except for this report. No code, test, data, index, HEAD or branch changes; no full test/build/smoke rerun. One narrow compiled-runtime diagnostic was justified by the different world IDs found in the package. Additional read-only verification recomputed fingerprints, compared protected baseline files and normalized the new worlds. Targeted unchanged-code inspection was limited to the migration/restore/reconfigure and CLI-swap boundaries implicated by compatibility, plus the explicitly requested historical party-test triage. Fixed local source-cache excerpts were checked for the attribution claims.

## Strengths

- **Single state owners and real finite transfers.** `src/modules/wallet.ts:29`, `src/modules/commerce.ts:102` and the two world assemblies keep balances in wallet, goods in inventory and only a successful-command count in commerce. Wallet computes both balances before writing. Commerce reads current terms, pays before delivery, checks the returned identities/amounts and actual balances, verifies both actual item counts, checks balances again after delivery, then writes its counter and event. No store-private coins, duplicated stock, free opening-time restock or second clock was introduced.
- **Semantic provider validation.** `src/modules/commerce.ts:37` validates the complete catalog's list/get identities and terms while `:52` resolves resource references only in the selected shop's bound domain. This implements the ledger's deliberate independent-domain ruling. Wallet, shop and availability readers plus quote echo checks reject malformed data. The fault tests include no-write and one-sided providers, incorrect returns, nested events and an outer failure; they compare complete host snapshots instead of only balances.
- **Exact pricing and bounded calendar work.** `src/modules/trade-price.ts:15` uses constant-count BigInt arithmetic for threshold crossings and safe output conversion, with matching reverse totals for matching buy/sell base prices. `src/modules/calendar.ts:16` bounds day/week products; `src/modules/availability.ts:44` works over configured days/windows, merges adjacency, handles week wrap and permits fractional seconds without iterating elapsed time. Tests cover maximum safe quantities, overflow, sparse very large weeks and exact opening/closing boundaries.
- **Frozen promises survive consumer simplification.** `src/modules/quests.ts:54` and `:101` require progression for current or accepted positive-XP promises, even after the current catalog is edited or deleted. A present progression provider is still validated. The definition moves to1.2.0 while capability1/state1 remain unchanged; migration at `:123` preserves exact own1.0/1.1 history. Existing payment/reward transactions remain intact.
- **Views compose public capabilities.** `src/modules/settlement-view.ts:40` cross-checks wallet, inventory, calendar/time, quote reasons and task phases. It explicitly leaves capacity to execution. `src/modules/workshop-view.ts:13` preserves the underlying title and reads one bound workshop; frozen jobs are displayed independently of current recipes. Actions use actual bindings and JSON command formatting, including the real Unicode/quoted-ID execution case at `tests/settlement-world.test.ts:278`.
- **The playable resource cycle is tested with real providers.** `tests/settlement-world.test.ts:65` checks both21-instance/32-action assemblies against literal intermediate and final values: t190, balances2/4, total6, supplier seed1/turnip0, player voucher2, trades4, delivery2, no jobs/plots. The real capacity cases at `:185` require payment to roll back and a repaired retry/replay to settle once. Paid-job tests at `:220` change or delete recipes and close hours, then receive the original seed/meal while rejecting a new trade. `:259` continues a third cycle with all views removed. The author patch at `:316` changes actual final balances to4/2.
- **Compatibility and provenance are appropriately bounded.** The package adds10 definitions at1.0.0/state1 and registers63 in total. Baseline byte comparison confirmed unchanged `src/engine`, `src/contracts.ts` and all14 old world files; package and lock contents differ only in root version metadata. Source notes distinguish FLARE's currency-item/sell-credit path and Widelands' per-consume checks from this project's independent account, pricing, schedule and transaction implementation. The historical candidate economy is clearly labeled as research, not the delivered resource configuration.

## Issues

### Critical — none

No new data-loss, security or transaction-atomicity defect was established in this review. The identified swap failure rejects without modifying the original snapshot.

### Important — I1: shipped continuous world has the wrong identity for the supported swap

**Location:** `worlds/settlement-continuous.json:4`. Related coverage: `tests/settlement-world.test.ts:125` and `scripts/smoke-built.mjs:336`. User-facing claims: `docs/authoring.md:188` and `docs/settlement.md:84`.

The step package declares `world.settlement`, but the continuous package declares `world.settlement-continuous`. The authoring guide says both share `world.settlement`, and the play guide explicitly tells the user to run `swap settlement-continuous` while crops or paid jobs are active. The unchanged CLI passes the loaded package directly into `reconfigureWorld` (`src/cli/index.ts:127`); the host correctly rejects a different world ID (`src/engine/index.ts:497`). Consequently, the documented action fails for the shipped files, in either direction. This is a missing required integration behavior, not merely a documentation typo.

**Concrete reproduction:** Using the already-built `dist` modules, load both shipped packages, create the step world, execute its first11 demo commands to t30 with both paid jobs, then call `reconfigureWorld(registry, world, continuous.world)`. The one narrow diagnostic returned:

```json
{"stepWorldId":"world.settlement","continuousWorldId":"world.settlement-continuous","elapsedSeconds":30,"accepted":false,"code":"WORLD_ID_MISMATCH","message":"Reconfiguration must retain the world id","originalSnapshotUnchanged":true}
```

**Why the gates missed it:** The source integration test creates `clockSwap = restored.definition` and changes only its clock module/config, so it retains the step world's ID and never consumes the shipped continuous package. The compiled settlement interactive group covers save/load but does not execute a swap. Running both demos separately and successfully cannot establish compatibility between their packages.

**Required correction:** Set the continuous package's world ID to the specified `world.settlement`. Change the active-state swap regression to load the actual shipped continuous world definition rather than synthesizing the target from the source definition. Exercise the documented swap through the compiled CLI, preserving active crop, both paid jobs, quest and balances, and include the reverse swap or an equivalent round-trip assertion. Keep the existing independent-demo, save/load, original28-group and final-state assertions. Refresh verification after the changed world/test/smoke inputs; the old fingerprints remain accurate historical evidence for the reviewed head, not proof for a future fix.

### Minor — no new change required

The previously deferred v0.8 readability concern at `tests/party-battle.test.ts:42`, `:62` and `:68` remains: dense multi-action test lines make failure localization and future review harder. These lines are unchanged in this branch and no new behavioral defect was established there. Keep this as an acknowledged nonblocking historical cleanup; it does not justify expanding the settlement fix into a party-test rewrite.

## Specification and interaction assessment

| Area | Finding |
| --- | --- |
| Accounts, initial values, count limits and own keys | Compliant. Exact account sets, restore/config preservation, safe arithmetic and Unicode cases are present. |
| Catalog, shared catalogs and independent resources | Compliant. Full catalog identity/term consistency with selected-shop reference validation follows the recorded ruling. |
| Fixed/stock prices and policy migrations | Compliant. Exact threshold arithmetic, unsupported directions and safe-total checks; only known exact empty strategy histories migrate. |
| Quote versus execution | Compliant. Ordinary refusal reasons are ordered; available quotes do not promise capacity; commands refresh terms and perform payment-first atomic delivery. |
| Calendar and opening policies | Compliant. Pure time projection, sparse configuration work, half-open/fractional boundaries, continuity across adjacent windows/week wrap, no free resources. |
| Zero-XP quests and preserved XP promises | Compliant. Optional binding does not erase present/frozen nonzero rewards or weaken a bound provider check. |
| Dual production and closed hours | Compliant in inspected code/tests. Real paid jobs retain frozen terms through edit/deletion and continue while new trades are closed. |
| Text views and arbitrary identities | Compliant. Public reads, reusable wrapper bindings and executable quoted hints; no visual-GUI claim. |
| Two finite economy demonstrations | Compliant individually. Both21-instance/32-action worlds have the declared resource cycle; normalized comparison found only presentation metadata, clock/action-unit differences and the erroneous world ID. |
| Actual shipped clock replacement | **Not compliant until I1 is fixed.** Synthetic same-ID clock replacement passes; shipped-package replacement fails. |
| Old world/dependency/host preservation | Compliant for the reviewed head.17 protected baseline files, including14 worlds, were byte-identical; package/dependency data is unchanged except version labels. |
| Author editing route and source attribution | Compliant within the reviewed local scope. Existing authored-route tests execute the patched economy; the shipped example-patch log also reports successful32-step execution. Attribution distinguishes research from code reuse. |

## Verification evidence and limits

I inspected `artifacts/preflight.json`, `artifacts/built-smoke.json`, the preflight/build/smoke logs and `docs/tasks/settlement-verification.json`. The archived objects equal the live result objects. Recomputed content fingerprints match exactly:

- Preflight: `fd5736ce545b76b5902a21a8bb258d72c1d0999281c0129300b8c702d19b8c29`.
- Built smoke: `b74808422e71881d69ab1dfff81add6f3acdf095cf53e385612bc92b0557d23d`.

The recorded Preflight completed at2026-11-07 13:49:13 Beijing:6/6 checks,459 tests passed/0 failed, strict TypeScript and all16 world runs/restores. Build exited0. Compiled smoke completed at13:50:11:33 groups, every group successful, retaining the28 preexisting groups. The original npm `Unknown env config "http-proxy"` warning remains visible in the preflight and build logs; it is not a project test/type failure and was not erased. The shipped author-patch log reports `ok:true`, successful inspection and32 executed demo steps. These checks are not rerun by this reviewer.

The12 cached fixed-source files match their manifest byte lengths and SHA-256 values. Targeted source inspection confirms FLARE's sell path directly calls `addCurrency`, its vendor caller explicitly leaves limited vendor currency for the future, and Widelands decrements consumption queues only after the requirement check. This supports the narrow attribution distinctions; it is not a fresh audit of those upstream engines or a claim to have verified every upstream path.

Earlier scoped reviews' cross-scope limits are resolved as follows: real snapshot fault/replay tests plus the exact-content final suite support unchanged host rollback integration; the real closed-hours/frozen-jobs case covers the calendar/production interaction; actual assemblies and parsed/dispatched hints cover Root's view-to-world limits. The shipped clock-swap limit was not resolved by those tests and is the Important finding above.

## Declined to judge

- Final archive extraction, complete entry/hash set, packaged fingerprints, Git bundle/source equality and independently executed package smoke: subsequent delivery work, not yet measured for the final fixed/archive tree.
- Actual remote publication identity, expected-base/force=false update outcome, source-to-remote mapping and Notion13/mother/04/index/history12 synchronization: external delivery has not been performed in this review; links or intended procedures do not prove it.
- New CI outcomes and Windows hardware acceptance: no corresponding fresh run was supplied; local Linux evidence is not a substitute.
- Formal graphical UI and visual usability acceptance: explicitly outside this text-authoring/CLI implementation and no visual prototype is claimed.
- Multiplayer authority, untrusted plugin isolation, automatic NPC/offline production and large-scale/long-term balance: explicitly outside this version's implementation claims; local author credit/add commands and explicit start/collect production remain documented boundaries.
- Automatic migration from legacy `market.fixed` private fractional money or unrelated old-world inventory domains: intentionally excluded by the binding design; a future explicit migration is separate work. I1 concerns the promised same-world clock variants, not those unrelated-world migrations.

## Recommendations and final assessment

Use one bounded fix wave for I1 and its regression coverage, then the prescribed scoped re-review and fresh affected verification. No other implementation change is requested by this whole-branch review. Preserve the original459/33 success records with their scope and add the corrected evidence instead of rewriting history as though the missed swap was already tested.

**Task4 spec verdict: With fixes. Task4 quality verdict: With fixes. Overall ready to merge: With fixes.** The architecture, exact arithmetic, transactions and substantial real-world tests are sound, but the actual delivered continuous package cannot perform its documented compatibility operation. Fix and verify that package boundary before archival/publication.

## Root closure after the required correction

I1 was fixed in1482db6 by changing the new continuous package identity and testing the actual shipped step/continuous packages plus the compiled CLI round trip. The original reviewer finding above is preserved. Independent [scoped re-review](settlement-final-fix-review.md) reports ADDRESSED, no new breakage and no open finding. Root then ran fresh final Preflight at2026-11-07T14:03:33+08:00 (6/6,459/459 tests,16worlds), buildexit0 and compiled33/33 at2026-11-07T14:04:29+08:00. Final fingerprints and the earlier scope-limited evidence coexist in [verification](settlement-verification.json). Source is ready for archive verification and already-authorized publication; those external identities are recorded afterward in [topic13](https://app.notion.com/p/411fbd029cd2810d8508ec8ba168b4a4).
