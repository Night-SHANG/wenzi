# v0.9 Settlement Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. User explicitly requests continuous batch execution, not another approval or method-selection pause. Independent owners work in parallel; Root alone stages and commits.

**Goal:** Deliver a pure economy world whose finite shops, accounts, prices, opening hours, planting, two workshops and repeat delivery orders form a persistent playable resource cycle.
**Architecture:** Public wallet/shop-rule/trade-price/calendar/availability/commerce capabilities compose with existing inventory/crafting/planting/quests; no duplicate money, stock, clock or production engine. Two stateless view definitions compose the interface.
**Tech Stack:** Existing Node>=24.12, TypeScript, Ajv, semver, fast-json-patch; fixed dependencies unchanged.
**Spec:** docs/superpowers/specs/2026-11-07-settlement-design.md (binding).

## Global Constraints

Read AGENTS.md and complete spec. No src/engine, src/contracts.ts, dependency or old14world changes. New definitions1.0.0/state1; old quests definition1.2.0/capability1/state1 with exact1.0/1.1 migration. All IDs1–128Unicode codepoints, own-key access, strict input/config/state schemas. Coins and item counts safe integers; simulation seconds may be finite nonnegative fractions. Queries pure, bad providers/late failure restore complete snapshots. Each owner edits only named files and writes a full report; no stage/commit, aggregate suites/build/smoke, or subagents. Root integrates, stages, gates and publishes. Strongly type JSON query boundaries; Node's type stripping is not static type validation.

## Review Focus

- Price thresholds cannot create quantity-dependent rounding or O(quantity) runtime; test a batch crossing targetStock and maximum integer overflow (Task1).
- Initial credits are not replayed on restore/config change, and same-source/destination trades cannot bypass limits (Tasks1/2).
- Capacity/lying-transfer failure after money moved restores both money and goods, counters/events/receipts (Task2; real-provider integration Task4).
- Adjacent windows/week-end wrap must not report a false close or miss the next opening; large time jumps do not replenish inventory (Tasks3/4).
- Frozen nonzero-XP quests still require progression even if current catalog changes to0/deletes them; no silent reinterpretation on migration (Task4).

### Task 1: Accounts, shop content, and interchangeable pricing

**Files:** Create src/modules/wallet.ts, shop-rules.ts, trade-price.ts; tests/economy-rules.test.ts.
**Interfaces:** Exact Task1 spec. Produce walletModule, WalletBalance/readWalletBalance(ctx,value,expectedAccount); shopRulesModule, OfferDefinition/ShopDefinition, offerSchema/readOffer/readShop; priceFixedModule/priceStockModule. All amount/price output shapes and names verbatim from spec. Other tasks import these public readers.

- [x] **Step1:** RED real wallet initial a2/b4→transfer2 a0/b6→transfer2 a2/b4; malformed/unknown account, duplicate source, insufficient, overflow leave full snapshot; restore and initial-amount config edit preserve owned balances.
- [x] **Step2:** RED catalog null direction, empty offers, invalid quantities/Unicode and safe own keys; fixed buy3×3→9; stock target2/stock4/buy3×3→12, stock1/sell1×3→4; cross-threshold reverse quote; maximum safe quantity handled without per-unit loop; overflow rejects.
- [x] **Step3:** Implement exact schemas/readers/public definitions, no inventory mutation or global prices; strictly validate disabled direction and echo identity. Accurate empty-state swaps between prices; unknown versions/nonempty history reject.
- [x] **Step4:** Run `node --test tests/economy-rules.test.ts`, self-review and write .superpowers/sdd/2026-11-07-settlement/task-1-report.md with actual RED/GREEN, scope and concerns. Root captures dedicated commit/review.

### Task 2: Finite shop exchange

**Files:** Create src/modules/commerce.ts, tests/commerce.test.ts.
**Interfaces:** Exact Task2 spec. Produce commerceModule/commerce.shop with quote/status/buy/sell. Consume Task1 readers and names, Task3 readAvailability; fixture providers may use exact contracts while other lanes work. inventory.transfer returns `{transferred}`; wallet.transfer returns both account balances and transferred amount, all checked against actual reads.

- [x] **Step1:** RED real inventory+capacity with public wallet/rule/availability fixtures: buyseed1 for2 shifts money2/4→0/6 and stock1/0→0/1; sellturnip1 for2 reverses money; counters only on successful commands. quote queries never mutate.
- [x] **Step2:** RED closed/wrong location/stock/funds produce ordered normal quote reasons, no mutation on refused command; unsupported direction and invalid identity/price/availability/counts reject. Two shops bound to different suppliers/customers cannot bleed state; same account/container rejects.
- [x] **Step3:** Implement shared execution, wallet first then inventory, exact return/readback, complete rollback after later destination capacity failure or lying/no-write provider; no fake stock or credit; current catalog list/get validated independently including hidden get-only IDs.
- [x] **Step4:** Pin large amount/quantity/counter overflow, strict current references, commandID replay and restore. Full snapshot equals before for failures even after prior writes/events; repair and retry charges once.
- [x] **Step5:** Run `node --test tests/commerce.test.ts`, self-review/report .superpowers/sdd/2026-11-07-settlement/task-2-report.md. Do not change shared/root files or write another lane's missing exports; report unresolved interface needs immediately.

### Task 3: Calendar projection and opening policies

**Files:** Create src/modules/calendar.ts, availability.ts; tests/calendar.test.ts.
**Interfaces:** Exact Task3 spec. Produce calendarModule/CalendarStatus/readCalendar(ctx,value); availabilityAlwaysModule/availabilityScheduleModule/AvailabilityStatus/readAvailability(ctx,value). Always open works without calendar. Schedule consumes calendar only, never inventory/wallet/events.

- [x] **Step1:** RED secondsPerDay60/daysPerWeek3 at0→dayIndex0/dayOfWeek0/second0; at70→1/1/10; at190→3/0/10. Invalid provider/nonfinite/fractional indexes/product overflow reject. Both real time providers produce same projection.
- [x] **Step2:** RED days[0,1],windows[10,50): t0closed/opens10; t10open/closes40; t50closed/opens20; t80open/closes30; t150closed/opens40; t190open. Exact closing exclusive, opening inclusive; fractional-second cases.
- [x] **Step3:** Implement pure periodic calculation independent of elapsed-day count. Validate days/window ranges, duplicates/overlap, allow unsorted and merge adjacent; test week-tail+week-head continuous openings and whole-period open→closesnull. Always→schedule→always exact empty state migration succeeds; bad historical identity/state rejects.
- [x] **Step4:** Run `node --test tests/calendar.test.ts`; self-review/report .superpowers/sdd/2026-11-07-settlement/task-3-report.md. No registry/world/UI changes.

### Task 4: Pure economy world, reusable workshop view and verified delivery

**Owner:** Root, with a disjoint world/CLI integration lane. **Files:** Modify quests.ts, src/catalog.ts, package files, scripts/smoke-built.mjs, README/THIRD_PARTY/docs and legacy party consumer/global-count assertions; create settlement-view.ts, workshop-view.ts, text-view-data.ts (small shared view readers), settlement.ts, worlds/settlement*.json, tests/settlement-consumers.test.ts, tests/settlement-views.test.ts, tests/settlement-world.test.ts.
**Interfaces:** All three lanes and exact Task4 spec. Produce settlementViewModule/view.settlement.text and workshopViewModule/view.workshop.text. Two workshop wrapper instances bind each separate crafting+recipes and previous text-view; no private state/ID assumptions. Existing plantingModule lives in farm.ts, recipesModule in recipes.ts; reuse unchanged.

- [x] **Step1:** Record literal two-cycle hand calculation before implementing. RED zero-XP quests without progression; positive current/frozen promises need progression, old1.0/1.1 identity migration preserves active/completed records; unknown versions reject.
- [x] **Step2:** Implement optional progression and the two stateless views with malformed-read checks and actual binding hints. Repeatable meal delivery consumes meal1, rewards voucher1, no XP. Extend only changed consumer path, no artificial progression in pure world.
- [x] **Step3:** Assemble both clocks using initial balances2/4, supplierseed1, growth20s/yield3, seed press10s and meal kitchen10s; complete two cycles to t80/voucher2, weekend t150 and reopen190. Final totals coins6, balances2/4, supplierseed1/turnip0, trades4, tasks2, no outstanding orders/plots. Register63definitions/16worlds only if actual counts agree.
- [x] **Step4:** Real integration pins money/goods, sourceful errors, full snapshot rollback/retry, active double-job/crop/quest save and clock replacement, price/opening swaps and frozen recipe terms, no-view continuation, quoted Unicode IDs and two workshop hints, author patch actual result. Preserve all previous world results and exact source/compatibility boundaries.
- [x] **Step5:** Preserve original28 compiled groups; add2worlds+authored settlement+active save/load+arbitrary IDs, expected33groups. Root full Preflight/build/smoke after workers and scoped reviews stable; fresh wholebranch review also gates Task4. Fix concrete failures, no duplicate speculative suite runs.
- [ ] **Step6:** Archive reports/rulings, independent actual zip extraction/hashset/fingerprints/compiled33/Gitbundle/source comparison. Publish exact trees using expectedcb414fe and forcefalse only once verified, immediately report, no CI polling. Preserve source branch, sync Notion13/mother/04/index/history12; no Release. External identity proofs live outside source archive.

Source freeze note: Step6 external archive/publication/Notion measurements execute after this source snapshot. Their final actual identities are recorded in [topic13](https://app.notion.com/p/411fbd029cd2810d8508ec8ba168b4a4); this source does not claim those future operations already happened or embed its own archive hash.
