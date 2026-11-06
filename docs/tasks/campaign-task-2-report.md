# Task 2 report — encounters and independent combat policy

## Scope and delivered APIs

Read task-2-brief.md, the public capability preamble, and the full encounter/combat section of the campaign design. Implemented only assigned production files:

- `src/modules/encounter-rules.ts`: `encounterRulesModule`, definition `encounters.catalog`, capability `encounter-rule`; exact `get({encounter})` and `list({})` shapes. Shared internal validation helpers and schema exported for the consumer.
- `src/modules/combat-rules.ts`: `combatRulesModule`, definition `combat.difference`, capability `combat-rule`; independent pure `damage({attack,defense})` with safe counts and minimum damage 1.
- `src/modules/encounters.ts`: `encountersModule`, definition `encounters.duel`, capability `encounters`; exact `status/list/describe/records` queries and `start/attack/claim/retreat` commands. Frozen battle, cooldown records and claimed-win counters persist in its own state.
- `tests/encounters.test.ts`: 15 focused host tests, with ordinary test ModuleDefinitions supplying progression/vitals while their actual providers were developed by the parallel owner.

No core/contracts, dependencies, registry, worlds, views, CLI, or other owners' implementation files changed. No staging or commits. No agents spawned. No global suite or typecheck run.

## Behavior and validation

Combat queries current player stats and an independently bound damage provider. Lethal player hits cause no retaliation; terminal phases remain terminal after healing. Active movement is vetoed only for `location.moved` from the actual bound location provider. Claim is allowed only at the frozen location, applies all inventory and XP operations within the host transaction, increments wins only on successful claim, and sets cooldown at claim time. Retreat applies cooldown at retreat time without rewards or wins.

Current catalog entries are validated on every host validation independently from frozen battles, including list/get identity/content consistency. Frozen enemies, loot, experience, location and cooldown survive catalog changes/removal. Frozen item/location references still validate. Deleted encounter IDs remain legal in saved cooldown/win records. External rule/stat/vitals/inventory count/location/clock values are checked before consumption; command return quantities and resulting health are checked. Counts and durations use existing shared numeric bounds. Own-property reads/writes preserve legal prototype-like and whitespace/Unicode IDs. Existing host reserved keys remain forbidden; no core JSON boundary was modified.

## Evidence and RED honesty

1. Wrote the first three behavior tests before creating production modules. `node --test tests/encounters.test.ts` exited 1 with `ERR_MODULE_NOT_FOUND` for `encounter-rules.ts`: **import RED only**, not a behavior assertion RED.
2. Implemented the three modules; the initial focused run passed 3/3 tests.
3. Added remaining specified boundary cases. First expanded run passed 12 and failed 3: two fixture setup failures (`AMBIGUOUS_CAPABILITY`) and one assertion failure caused by a fixture's `??` fallback swallowing explicit null. These were fixture defects, **not production behavior RED**. Earlier external-provider `assert.throws` results could have been satisfied by the ambiguity and are not claimed as valid boundary evidence.
4. Fixed the fixtures by explicitly binding every encounters dependency and preserving explicit override null. An in-flight run was interrupted and its process handle vanished; no result is claimed for it.
5. Re-ran the exact focused file with captured output: `node --test tests/encounters.test.ts` — **15 tests, 15 pass, 0 fail**, duration **27526.847851 ms**, exit 0.
6. Self-review found a retreat-loop assertion accidentally reading the outer world fixture. Corrected it to the loop's world and re-ran only that affected test: `node --test --test-name-pattern='defeat remains terminal' tests/encounters.test.ts` — **1 test, 1 pass, 0 fail**, duration **1319.258085 ms**, exit 0. Production files unchanged since the 15/15 run.
7. Scoped `git diff --check -- src/modules/encounter-rules.ts src/modules/combat-rules.ts src/modules/encounters.ts tests/encounters.test.ts` exited 0 without output.

## Focused coverage

- Wolf HP12/attack5/defense0 vs player HP20/attack4/defense1: enemy/player 8/16, 4/12, 0/12; no early loot or win; claim pelt1/XP10/win1/cooldown10; repeated attack/claim fail.
- Wrong location, dead player, busy battle, cooldown; actual movement veto with complete snapshot rollback and unrelated same-type event allowed.
- Defeat, subsequent healing without reactivation, active/victory/defeat retreat with no rewards or claimed wins.
- Second loot insertion capacity failure and XP overflow after loot insertion; full snapshot unchanged, victory retained, successful retry once.
- Active and victory save/restore; cooldown retained through step-to-continuous clock replacement.
- Frozen battle survives valid catalog edits/deletion; invalid current catalog rejected; frozen references protected; terminal travel allowed but claim requires frozen location.
- Clock reversal, overflow, positive-duration precision loss, zero-duration cooldown and zero-XP award.
- Independent combat provider, malformed damage returns, mismatched/duplicate list/get identities and definition discrepancies.
- Malformed progression/vitals/damage-return, inventory count, location, clock outputs; restored invalid phase/HP/time states.
- Legal `toString`, `valueOf`, whitespace/quotes/Unicode encounter IDs; repeated claimed wins; wins overflow rollback.

## Self-review and remaining ownership

Reviewed state ownership, transaction boundaries, foreign result validation, no-lethal-retaliation path, frozen/catalog separation, source filter, own-key accesses, safe arithmetic, phase invariants and test fixture accuracy. No known blocking issue remains in assigned scope. Root reported actual-provider campaign integration GREEN 7/7 while this suite was running; that is root-owned evidence, not a test run by this owner. Root remains responsible for actual-provider integration, any global TypeScript/build checks, independent review, registry/world/CLI wiring and commit/release.

## Fix round 1 — P2 Unicode ID length (bounded review correction)

Read the amended task-2-review.md and verified the reported mismatch with new actual-host regressions before changing production code. Used the receiving-code-review skill to check the finding against the existing schema and provider boundary. The prior no-known-blocker statement is superseded by the confirmed review finding and the fix below.

Changed only `isId` in `src/modules/encounter-rules.ts` from UTF-16 `value.length <= 128` to Unicode code-point `[...value].length <= 128`; the nonempty check and existing host forbidden-key boundary are unchanged. No production changes in encounters.ts/combat-rules.ts or any other owner files.

Added seven narrowly named tests in `tests/encounters.test.ts`. Six accept 65 and 128 supplementary Unicode code points in each encounter key, location ID and loot item path. Each first proves that the unchanged schema/catalog alone accepts its definition, then assembles the duel, exercises source-filtered move rollback with full snapshot equality, reaches victory, restores the snapshot, claims and checks the exact reward and wins. The seventh uses a valid external rule provider and a pending victory, then rejects 129-code-point encounter/location/loot definitions with exact INVALID_ENCOUNTER_RULE assertions and unchanged full snapshots, and confirms that the original claim remains usable.

### Behavior RED

Exact command (exit 1):

```sh
node --test --test-name-pattern='astral ID boundary' tests/encounters.test.ts > /tmp/encounters-astral-red.txt 2>&1
```

Captured output follows. Six failures are actual `assert.doesNotThrow` assertion failures after baseline assembly/get succeeded, not import, binding or fixture failures.

```text
✖ astral ID boundary accepts 65 code points as encounter (892.136242ms)
✖ astral ID boundary accepts 65 code points as location (477.410521ms)
✖ astral ID boundary accepts 65 code points as loot (498.543281ms)
✖ astral ID boundary accepts 128 code points as encounter (529.351094ms)
✖ astral ID boundary accepts 128 code points as location (582.399303ms)
✖ astral ID boundary accepts 128 code points as loot (432.001102ms)
✔ astral ID boundary rejects 129-code-point external definitions without changing pending victory (947.796367ms)
ℹ tests 7
ℹ suites 0
ℹ pass 1
ℹ fail 6
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4757.434249

✖ failing tests:

test at tests/encounters.test.ts:105:3
✖ astral ID boundary accepts 65 code points as encounter (892.136242ms)
  AssertionError [ERR_ASSERTION]: Got unwanted exception.
  Actual message: "遭遇规则返回了无效内容"
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/encounters.test.ts:121:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: EngineError: 遭遇规则返回了无效内容
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:75
        at guard (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:288:20)
        at Object.fail (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:55)
        at readEncounter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounter-rules.ts:15:84)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:35:19
        at Array.map (<anonymous>)
        at catalog (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:34:28)
        at Object.validate (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:54:25)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:359:49
        at #enter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:283:18),
    expected: undefined,
    operator: 'doesNotThrow',
    diff: 'simple'
  }

test at tests/encounters.test.ts:105:3
✖ astral ID boundary accepts 65 code points as location (477.410521ms)
  AssertionError [ERR_ASSERTION]: Got unwanted exception.
  Actual message: "地点能力没有返回有效当前位置"
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/encounters.test.ts:121:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: EngineError: 地点能力没有返回有效当前位置
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:75
        at guard (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:288:20)
        at Object.fail (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:55)
        at location (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:20:147)
        at Object.validate (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:53:60)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:359:49
        at #enter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:283:18)
        at #validateStates (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:358:48)
        at new WorldRuntime (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:269:25)
        at createWorld (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:433:10),
    expected: undefined,
    operator: 'doesNotThrow',
    diff: 'simple'
  }

test at tests/encounters.test.ts:105:3
✖ astral ID boundary accepts 65 code points as loot (498.543281ms)
  AssertionError [ERR_ASSERTION]: Got unwanted exception.
  Actual message: "遭遇规则返回了无效内容"
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/encounters.test.ts:121:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: EngineError: 遭遇规则返回了无效内容
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:75
        at guard (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:288:20)
        at Object.fail (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:55)
        at readEncounter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounter-rules.ts:15:84)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:35:19
        at Array.map (<anonymous>)
        at catalog (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:34:28)
        at Object.validate (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:54:25)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:359:49
        at #enter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:283:18),
    expected: undefined,
    operator: 'doesNotThrow',
    diff: 'simple'
  }

test at tests/encounters.test.ts:105:3
✖ astral ID boundary accepts 128 code points as encounter (529.351094ms)
  AssertionError [ERR_ASSERTION]: Got unwanted exception.
  Actual message: "遭遇规则返回了无效内容"
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/encounters.test.ts:121:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: EngineError: 遭遇规则返回了无效内容
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:75
        at guard (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:288:20)
        at Object.fail (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:55)
        at readEncounter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounter-rules.ts:15:84)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:35:19
        at Array.map (<anonymous>)
        at catalog (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:34:28)
        at Object.validate (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:54:25)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:359:49
        at #enter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:283:18),
    expected: undefined,
    operator: 'doesNotThrow',
    diff: 'simple'
  }

test at tests/encounters.test.ts:105:3
✖ astral ID boundary accepts 128 code points as location (582.399303ms)
  AssertionError [ERR_ASSERTION]: Got unwanted exception.
  Actual message: "地点能力没有返回有效当前位置"
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/encounters.test.ts:121:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: EngineError: 地点能力没有返回有效当前位置
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:75
        at guard (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:288:20)
        at Object.fail (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:55)
        at location (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:20:147)
        at Object.validate (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:53:60)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:359:49
        at #enter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:283:18)
        at #validateStates (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:358:48)
        at new WorldRuntime (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:269:25)
        at createWorld (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:433:10),
    expected: undefined,
    operator: 'doesNotThrow',
    diff: 'simple'
  }

test at tests/encounters.test.ts:105:3
✖ astral ID boundary accepts 128 code points as loot (432.001102ms)
  AssertionError [ERR_ASSERTION]: Got unwanted exception.
  Actual message: "遭遇规则返回了无效内容"
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/encounters.test.ts:121:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: EngineError: 遭遇规则返回了无效内容
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:75
        at guard (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:288:20)
        at Object.fail (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:55)
        at readEncounter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounter-rules.ts:15:84)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:35:19
        at Array.map (<anonymous>)
        at catalog (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:34:28)
        at Object.validate (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/encounters.ts:54:25)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:359:49
        at #enter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:283:18),
    expected: undefined,
    operator: 'doesNotThrow',
    diff: 'simple'
  }
```

### GREEN after one-line correction

Exact command (exit 0):

```sh
node --test --test-name-pattern='astral ID boundary' tests/encounters.test.ts > /tmp/encounters-astral-green.txt 2>&1
```

```text
✔ astral ID boundary accepts 65 code points as encounter (872.608789ms)
✔ astral ID boundary accepts 65 code points as location (746.109068ms)
✔ astral ID boundary accepts 65 code points as loot (835.614192ms)
✔ astral ID boundary accepts 128 code points as encounter (698.508689ms)
✔ astral ID boundary accepts 128 code points as location (694.627607ms)
✔ astral ID boundary accepts 128 code points as loot (721.514256ms)
✔ astral ID boundary rejects 129-code-point external definitions without changing pending victory (842.856442ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5720.344439
```

Scoped whitespace verification: `git diff --check -- src/modules/encounter-rules.ts tests/encounters.test.ts` exited 0 with no output. Self-review confirmed every existing `isId` consumer now shares the public schema’s code-point length semantics, including location exits and consumed stat-map keys. No additional production behavior or protocol change. No full suite, typecheck, staging, commits, registry/core edits, or new agents. Independent scoped re-review remains root-owned.
