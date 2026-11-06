# Task 3 — Quest catalogs, baselines and transactional turn-in

Status: implemented and focused verification green. Ownership stayed within `src/modules/quest-rules.ts`, `src/modules/quests.ts`, `tests/quests.test.ts`, plus this requested report. No staging, commits, registry/world/CLI/core/contracts edits, dependency changes, global tests, or global typecheck were performed by this lane.

## Public definitions

- `questRulesModule`: `quests.catalog`, capability `quest-rule`, queries `get({quest})` and `list({})`.
- `questsModule`: `quests.journal`, capability `quests`, commands `accept({quest})`, `turnIn({quest})`, `abandon({quest})`, query `list({})`.
- Both manifest versions/capability versions are `1.0.0`, API/state versions are 1.
- Journal state is exactly `{active:{id:{definition:FrozenQuest,baselineWins}},completed:{id:count}}`. All quest definition fields and ID are frozen on acceptance.
- Inventory and progression remain their providers' authority. Item removal/addition and XP gain join the host transaction. Returned mutation counts, gain experience, and subsequent provider queries must match the expected change; no duplicate inventory or XP state is stored.

## Behavior and validation

Catalog schemas and runtime readers require unique prerequisite/location IDs, positive safe objective/reward counts, nonnegative safe XP, and at least one delivery or victory objective. Missing/cyclic prerequisites reject assembly. Both installed/current catalogs and frozen accepted definitions validate independently: current item/location/encounter references are checked, frozen item/location references remain mandatory, and frozen encounter targets use cumulative records without requiring a surviving directory entry.

Acceptance rejects duplicates, missing prerequisites and completed nonrepeatable quests; it stores the current counter for every victory target. A repeat acceptance starts a fresh baseline. Readiness uses present inventory, current wins minus baseline, and the allowed turn-in location. Per root clarification, unaccepted entries show present delivery shortages and the full future victory requirement, while `ready` stays false until acceptance. List queries remain pure.

Turn-in removes delivery, grants each item reward, grants positive XP, increments the safe completed counter and removes active state in one host transaction. Abandon removes only active state, accepts any location, and checks counters before deleting their baseline, so a nested rewind cannot erase evidence. Old completed IDs stay visible after current catalog deletion, with fallback names and empty terms. Special legal object keys use own-key reads and explicit own-property writes; this lane preserves the host's existing reserved-key rejection (`__proto__`, `prototype`, `constructor`) rather than changing core behavior.

Foreign lists/get responses, inventory list/count/mutation responses, encounter records/description identity, location descriptions/current identity and consumed progression experience are checked at their boundaries. A same-ID foreign get/list disagreement is rejected, including otherwise valid differing rewards/XP. Definition comparison normalizes map entry ordering and unique ID-array ordering.

## Test-first evidence

The focused real-host tests use the actual registry/runtime, inventory/capacity/location definitions, plus ordinary valid progression and encounters capability definitions, as permitted while other lanes implemented those providers.

1. Initial tests before production files existed: `node --test tests/quests.test.ts` exited 1 with 15 tests, 14 fail and 1 pass. Failure was the explicit `questRulesModule must be exported` assertion. The negative-only malformed-encounter case passed because any assembly exception satisfied it; that initial pass was **not** treated as evidence of working validation.
2. After the minimum export/manifest skeletons, `node --test --test-name-pattern='delivery uses present inventory' tests/quests.test.ts` exited 1 with `UNKNOWN_QUERY: quests: unknown query list`. This established the missing gameplay API under an assembled real host before implementing it.
3. The first implementation run exposed an AJV strict schema error (`minProperties` needed explicit object type in the objective alternatives), not a gameplay RED. The schema was corrected. A subsequent process was interrupted before its result was collected; no completion claim relied on that interrupted run.
4. Resumed focused run: all original 15 tests passed, 0 failed, duration 16,497.778145 ms.
5. Self-review regression `foreign get cannot silently change valid terms published under the same catalog ID` was written before its fix. Its isolated run exited 1: expected a failure, but `accept` returned `{ok:true,...}` and committed the divergent valid terms. Acceptance now rejects that mismatch.
6. Clarified-display regression `unaccepted rows show current delivery shortages and full future victory requirements` was written before its fix. Its isolated run exited 1: expected `{tool:1}`, received `{tool:4}` with three already held tools. List now subtracts current inventory for inactive/current rows.
7. Final focused command: `node --test tests/quests.test.ts` exited 0: **17 tests, 17 pass, 0 fail, 0 skipped**, duration **14,927.253729 ms**.

## Coverage in the final 17 tests

- Supply→patrol→guard prerequisite chain; duplicate active and nonrepeatable completion rejection; repeatable fresh baseline.
- Wins 5 before accepting required 2 remain incomplete at 6 and complete at 7; the baseline survives save/restore.
- Present inventory delivery, pure queries, no automatic rewards and single successful turn-in.
- Location-bound acceptance/turn-in, abandonment elsewhere, unconstrained delivery without optional providers, and missing conditional providers.
- Later capacity failure after an earlier reward, complete snapshot rollback, removal of an obstruction, retry granting rewards once.
- XP overflow after inventory work and completed counter overflow, both preserving the full snapshot.
- Catalog replacement and deletion retaining accepted terms across restore; deleted completed IDs retaining count and fallback display.
- Invalid current catalogs/reference additions rejecting even with an active quest.
- Deleted encounter target retaining progress/turn-in eligibility through records; counter rewind rollback and abandonment.
- Frozen item references and a frozen location removed from a separately valid location snapshot rejecting restoration.
- Empty objectives, invalid counts, missing/cyclic prerequisites, duplicate references, legal prototype-like IDs and inherited lookup rejection.
- Foreign malformed/duplicate/dangling catalog lists, malformed/mismatched get identity and same-ID terms mismatch.
- Malformed inventory lists/counts and add/remove responses; malformed encounter counts/description identities; malformed location identities.
- Inactive row shortages reflecting inventory and future victory requirements ignoring historical wins.

## Self-review and integration notes

Reviewed safe-count boundaries, own-key handling, frozen/current validation separation, transactional write order, zero-XP skip behavior, missing encounter records defaulting to zero, and preservation of counter checks before abandonment. The two concrete self-review gaps above were addressed through new failing tests and are green. The final tests use direct static imports, so module import failures cannot be hidden by the initial bootstrap guard.

No remaining task-specific issue was identified. Root reported its separate real-provider campaign integration green (7/7); this lane did not run or claim that suite independently. Root still owns cross-lane scope review, the single global gate, packaging and integration.

## Review correction — round 1/5: supplementary-plane IDs

Read `task-3-review.md` in full. Addressed its sole P2 finding: `questId` counted UTF-16 code units, whereas the existing JSON Schema ID length counts Unicode code points. The helper now uses `[...value].length <= 128`; its string type and nonempty guards remain, and the host's reserved-property policy is unchanged. `quests.ts` needed no edit because its affected boundaries share this helper.

Added three focused real-host regressions. Legal 65- and 128-code-point emoji quest IDs now support catalog get, accept, abandon, reaccept, restore and turn-in. An ordinary ASCII quest can complete while unrelated legal emoji item IDs of those lengths remain in actual inventory. Foreign quest IDs, delivery/reward/victory count keys and encounter win keys containing 129 emoji still reject with the expected validation code.

Observed RED before changing the helper. Exact command:

```text
node --test --test-name-pattern='supplementary-plane' tests/quests.test.ts
```

Exit code: 1. Exact output:

```text
✖ supplementary-plane quest IDs at 65 and 128 code points support the local catalog lifecycle (372.866568ms)
✖ supplementary-plane unrelated inventory IDs at 65 and 128 code points do not block the journal (281.319955ms)
✔ supplementary-plane external IDs and count keys over 128 code points still reject (852.171317ms)
ℹ tests 3
ℹ suites 0
ℹ pass 1
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1920.050292

✖ failing tests:

test at tests/quests.test.ts:122:1
✖ supplementary-plane quest IDs at 65 and 128 code points support the local catalog lifecycle (372.866568ms)
  Error [EngineError]: 任务提供者返回了无效定义
      at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:75
      at guard (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:288:20)
      at Object.fail (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:55)
      at readQuest (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/quest-rules.ts:32:165)
      at catalog (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/quest-rules.ts:55:98)
      at Object.validate (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/quest-rules.ts:61:19)
      at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:359:49
      at #enter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:283:18)
      at #validateStates (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:358:48)
      at new WorldRuntime (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:269:25) {
    code: 'INVALID_QUEST'
  }

test at tests/quests.test.ts:141:1
✖ supplementary-plane unrelated inventory IDs at 65 and 128 code points do not block the journal (281.319955ms)
  Error [EngineError]: 库存物品列表无效或重复
      at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:75
      at guard (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:288:20)
      at Object.fail (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:55)
      at checkInventory (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/quests.ts:32:119)
      at Object.validate (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/quests.ts:85:3)
      at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:359:49
      at #enter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:283:18)
      at #validateStates (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:358:48)
      at new WorldRuntime (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:269:25)
      at createWorld (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:433:10) {
    code: 'INVALID_INVENTORY'
  }
```

After the one-line helper correction, ran the same exact command. Exit code: 0. Exact output:

```text
✔ supplementary-plane quest IDs at 65 and 128 code points support the local catalog lifecycle (799.372553ms)
✔ supplementary-plane unrelated inventory IDs at 65 and 128 code points do not block the journal (304.591345ms)
✔ supplementary-plane external IDs and count keys over 128 code points still reject (728.749222ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2095.949299
```

Self-review: inspected the owned-file diff; only the shared length comparison and these targeted tests changed. `git diff --check -- src/modules/quest-rules.ts src/modules/quests.ts tests/quests.test.ts` exited 0 with no output. No full suite, global typecheck, registry/core/index edits, staging or commits were performed in this correction round. The earlier 17-test result above remains historical evidence; the new correction's executed scope is the three focused regressions only. Ready for root's re-review and integration gate.
