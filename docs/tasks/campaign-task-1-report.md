# Task 1 — Progression, vitals and item recovery

Status: DONE. Implementation and self-review complete; final focused run passed 20/20 tests (exit 0).

## Implementation

- `progressionRulesModule` (`progression.curve`) validates 1–1000 ascending integer XP thresholds starting at zero, then resolves cumulative experience without discarding overflow.
- `progressionModule` (`progression.track`) stores only total XP; `gain` accepts positive safe counts, checks overflow and validates external rule results before writing. It rejects mismatched XP, impossible level/floor bounds, missing/invalid next thresholds and malformed stat maps. Rule rebinding re-resolves existing XP.
- `vitalsModule` (`vitals.pool`) owns only HP and consumes only the public progression capability. It independently validates positive safe `values.maxHp`, rejects HP above a new limit, and clamps damage/healing safely. Growth changes the upper limit without healing; zero HP can heal; full healing fails.
- `recoveryModule` (`recovery.items`) validates every configured remedy's item and restricted location, permits absent location only with empty restrictions, and performs inventory removal plus healing through nested capability calls in one host transaction. It validates health results including the expected clamped healing amount.
- All four definitions use manifest/API/state/capability version 1.0.0/1/1/1.0.0. No core/contracts changes, dependencies, hidden state, events or parallel resource accounts were introduced.

## Owned changed files

- `src/modules/progression-rules.ts`
- `src/modules/progression.ts`
- `src/modules/vitals.ts`
- `src/modules/recovery.ts`
- `tests/progression.test.ts`
- This task report and its RED/GREEN evidence logs under `.superpowers/sdd/2026-11-07-campaign/`.

## Validation and self-review

The real-host focused tests cover cumulative XP, multiple-level gains, top-level null thresholds, invalid initial configuration, overflow with complete-snapshot rollback, external rule and health validation, vitals damage/healing/growth, recovery location/item failures, genuine nested inventory/healer state rollback, optional location absence, save/restore, valid curve editing, external provider rebinding and legal special own keys. Additional boundary checks cover arbitrary non-vitals stat maps, exact threshold equality, pure queries and healing near the maximum safe integer.

Self-review checked only the owned implementation/tests against the public preamble and named spec section. It found one concrete gap: an external resolver could report level 3 at floor XP 1, impossible with integer thresholds starting at zero. A new focused test produced assertion RED, then the consumer was tightened to require `floorExperience >= level - 1` (along with first-level zero floor, XP bounds and the 1000-level limit). Recovery's late invalid healing fixture actually writes external HP after inventory removal; complete snapshot equality verifies both writes roll back.

The first RED run was **not an import failure**: module exports existed as inert scaffolding and real host test bodies executed. The first test failed with `AssertionError [ERR_ASSERTION]`, actual `null` versus the required initial progression object. Multiple validation tests failed with missing expected exceptions / successful operations where rejection was required. Two other initial failures were not assertions: one dereferenced the scaffold's null status, and one used host-reserved `__proto__` and hit the existing `INVALID_JSON` boundary. The reserved-key fixture was corrected to legal `toString`, `valueOf`, `hasOwnProperty`, whitespace/quoted and Unicode keys, per root's clarification; no host boundary was changed.

Focused runs only; no global tests/typecheck, staging or commits were performed by this owner. Root owns global verification and integration.

## Concerns

No remaining implementation concerns found in the owned scope. Existing host-reserved keys (`__proto__`, `prototype`, `constructor`) remain rejected by core JSON handling; legal special own keys are supported. Cross-provider rule replacement is demonstrated by public capability rebinding while preserving the tracker instance and state. The stateless curve's own definition identity is not migrated into an unrelated external implementation.

## Exact RED evidence

Command: `node --test tests/progression.test.ts`
Exit: 1. Initial inert exported modules; 13 tests executed, 0 passed, 13 failed.

```text
✖ total experience resolves thresholds, preserves overflow and reaches a null next threshold (253.436404ms)
✖ curve rejects invalid thresholds and values and progression rejects bad initial experience (166.32064ms)
✖ gain accepts positive safe integers only and overflow leaves complete snapshot unchanged (140.658995ms)
✖ external rules support public capability replacement and reject malformed resolve fields atomically (278.987989ms)
✖ nonobject external rule results reject current state at assembly (178.334972ms)
✖ damage clamps at zero, growth leaves hp unchanged, healing clamps and full healing fails (215.36589ms)
✖ maxHp must be a positive safe count and lowered curves cannot invalidate existing hp (183.727027ms)
✖ recovery at town consumes exactly one item and heals, including from zero (170.171844ms)
✖ full hp, wrong location, missing item and inherited remedy failures roll back complete snapshots (172.762124ms)
✖ malformed external healing results roll back the actual inventory removal and healer write (177.66055ms)
✖ all remedy references and optional location requirements validate at assembly (162.469246ms)
✖ save restore and valid rule edits preserve total XP and actual hp (282.771846ms)
✖ arbitrary own remedy item and stat keys survive queries commands and restore (201.336896ms)
ℹ tests 13
ℹ suites 0
ℹ pass 0
ℹ fail 13
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3014.554494

✖ failing tests:

test at tests/progression.test.ts:45:1
✖ total experience resolves thresholds, preserves overflow and reaches a null next threshold (253.436404ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + null
  - {
  -   experience: 0,
  -   floorExperience: 0,
  -   level: 1,
  -   nextExperience: 20,
  -   values: {
  -     attack: 4,
  -     defense: 1,
  -     maxHp: 20
  -   }
  - }
  
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:46:29)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: { experience: 0, level: 1, floorExperience: 0, nextExperience: 20, values: { maxHp: 20, attack: 4, defense: 1 } },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at tests/progression.test.ts:51:1
✖ curve rejects invalid thresholds and values and progression rejects bad initial experience (166.32064ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:52:403)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: undefined,
    operator: 'throws',
    diff: 'simple'
  }

test at tests/progression.test.ts:55:1
✖ gain accepts positive safe integers only and overflow leaves complete snapshot unchanged (140.658995ms)
  AssertionError [ERR_ASSERTION]: {"ok":true,"revision":1,"value":null,"events":[]}
  
  true !== false
  
      at fails (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:38:169)
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:56:86)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/progression.test.ts:59:1
✖ external rules support public capability replacement and reject malformed resolve fields atomically (278.987989ms)
  TypeError [Error]: Cannot read properties of null (reading 'experience')
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:60:91)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/progression.test.ts:63:1
✖ nonobject external rule results reject current state at assembly (178.334972ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:66:117)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: undefined,
    operator: 'throws',
    diff: 'simple'
  }

test at tests/progression.test.ts:69:1
✖ damage clamps at zero, growth leaves hp unchanged, healing clamps and full healing fails (215.36589ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + null
  - {
  -   hp: 20,
  -   maxHp: 20
  - }
  
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:70:29)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: { hp: 20, maxHp: 20 },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at tests/progression.test.ts:75:1
✖ maxHp must be a positive safe count and lowered curves cannot invalidate existing hp (183.727027ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:76:90)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: undefined,
    operator: 'throws',
    diff: 'simple'
  }

test at tests/progression.test.ts:80:1
✖ recovery at town consumes exactly one item and heals, including from zero (170.171844ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + null
  - {
  -   hp: 20,
  -   maxHp: 20
  - }
  
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:81:71)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: { hp: 20, maxHp: 20 },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at tests/progression.test.ts:84:1
✖ full hp, wrong location, missing item and inherited remedy failures roll back complete snapshots (172.762124ms)
  AssertionError [ERR_ASSERTION]: {"ok":true,"revision":1,"value":null,"events":[]}
  
  true !== false
  
      at fails (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:38:169)
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:85:22)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/progression.test.ts:89:1
✖ malformed external healing results roll back the actual inventory removal and healer write (177.66055ms)
  AssertionError [ERR_ASSERTION]: {"ok":true,"revision":1,"value":null,"events":[]}
  
  true !== false
  
      at fails (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:38:169)
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:91:121)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/progression.test.ts:94:1
✖ all remedy references and optional location requirements validate at assembly (162.469246ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:95:147)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: undefined,
    operator: 'throws',
    diff: 'simple'
  }

test at tests/progression.test.ts:100:1
✖ save restore and valid rule edits preserve total XP and actual hp (282.771846ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + null
  - {
  -   hp: 12,
  -   maxHp: 26
  - }
  
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:101:213)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: { hp: 12, maxHp: 26 },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at tests/progression.test.ts:104:1
✖ arbitrary own remedy item and stat keys survive queries commands and restore (201.336896ms)
  Error [EngineError]: $.modules[1].config.items: unsafe property __proto__
      at visit (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/json.ts:47:88)
      at visit (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/json.ts:50:23)
      at visit (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/json.ts:50:23)
      at visit (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/json.ts:41:23)
      at visit (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/json.ts:50:23)
      at copyJson (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/json.ts:55:16)
      at parseWorldDefinition (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:80:22)
      at assemble (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:193:22)
      at new WorldRuntime (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:262:22)
      at createWorld (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:433:10) {
    code: 'INVALID_JSON'
  }
```

Command: `node --test --test-name-pattern='external level bounds' tests/progression.test.ts`
Exit: 1. Executed assertion rejecting an impossible external level/floor.

```text
✖ external level bounds require enough distinct integer thresholds for the reported level (325.573529ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 823.519896

✖ failing tests:

test at tests/progression.test.ts:111:1
✖ external level bounds require enough distinct integer thresholds for the reported level (325.573529ms)
  AssertionError [ERR_ASSERTION]: {"ok":true,"revision":1,"value":{"experience":25,"level":3,"floorExperience":1,"nextExperience":null,"values":{"maxHp":20}},"events":[]}
  
  true !== false
  
      at fails (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:38:169)
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:112:3)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

## Exact final GREEN evidence

Command: `node --test tests/progression.test.ts`
Exit: 0.

```text
✔ total experience resolves thresholds, preserves overflow and reaches a null next threshold (550.021302ms)
✔ curve rejects invalid thresholds and values and progression rejects bad initial experience (1898.53418ms)
✔ gain accepts positive safe integers only and overflow leaves complete snapshot unchanged (198.137671ms)
✔ external rules support public capability replacement and reject malformed resolve fields atomically (2916.595233ms)
✔ nonobject external rule results reject current state at assembly (753.814826ms)
✔ damage clamps at zero, growth leaves hp unchanged, healing clamps and full healing fails (229.14454ms)
✔ maxHp must be a positive safe count and lowered curves cannot invalidate existing hp (2185.74954ms)
✔ recovery at town consumes exactly one item and heals, including from zero (141.167363ms)
✔ full hp, wrong location, missing item and inherited remedy failures roll back complete snapshots (134.574986ms)
✔ malformed external healing results roll back the actual inventory removal and healer write (1449.748176ms)
✔ all remedy references and optional location requirements validate at assembly (1207.06618ms)
✔ save restore and valid rule edits preserve total XP and actual hp (622.6267ms)
✔ arbitrary own remedy item and stat keys survive queries commands and restore (1472.977298ms)
✔ external level bounds require enough distinct integer thresholds for the reported level (181.713684ms)
✔ vitals independently checks consumed maxHp from an external progression capability (1724.380669ms)
✔ recovery validates external health inventory and location fields at their consumption boundaries (4659.077008ms)
✔ rebinding a valid external rule preserves accumulated XP while resolving its new curve (299.511863ms)
✔ progression supports arbitrary count stats without requiring a vitals-specific maxHp (155.660925ms)
✔ rule queries use inclusive threshold boundaries and remain side effect free (176.547437ms)
✔ healing near the safe integer maximum clamps before addition (127.526063ms)
ℹ tests 20
ℹ suites 0
ℹ pass 20
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 21531.300544
```

## Review fix round 1 — Unicode code-point ID bounds

Status: DONE. Addressed the Important/P2 finding in `task-1-review.md` against reviewed source 4901eb7.

The manual upper-length checks in `progression.ts` and `recovery.ts` used UTF-16 code-unit length, rejecting otherwise legal astral-character IDs. Both now count code points with string iteration (`[...value].length`) for the 128-character upper bound. The existing nonempty/type checks remain; stat keys still come from own `Object.entries`, values remain safe counts, and the host's reserved object-key behavior and public schemas are unchanged. Only these two implementation files and `tests/progression.test.ts` were changed in this fix round.

Three focused real-host regressions demonstrate:

- Built-in curve configuration and an external progression-rule provider accept stat keys of 65 and 128 astral characters.
- Recovery at a real, restricted location with an ID of 65 or 128 astral characters consumes exactly one item and heals successfully.
- Externally returned stat keys and current-location IDs of 129 code points are rejected. Current-location rejection specifically retains `INVALID_LOCATION`, and complete-snapshot rollback is checked.

The focused RED executed all three tests: both legal-boundary tests failed with actual assertions, while the 129-code-point rejection test already passed. After the two-line production fix, the same three tests passed. Scoped self-review verified the code-point semantics and retained guards. No entire focused suite/global suite/typecheck was rerun; no staging or commits were performed.

Exact command for both RED and GREEN:

`node --test --test-name-pattern='Unicode code-point boundaries' tests/progression.test.ts`

RED exit: 1.

```text
✖ Unicode code-point boundaries accept 65 and 128 astral stat characters (315.565915ms)
✖ Unicode code-point boundaries accept restricted locations of 65 and 128 astral characters (201.258562ms)
✔ Unicode code-point boundaries reject external 129-character stat and current-location IDs (480.831245ms)
ℹ tests 3
ℹ suites 0
ℹ pass 1
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1380.077

✖ failing tests:

test at tests/progression.test.ts:158:1
✖ Unicode code-point boundaries accept 65 and 128 astral stat characters (315.565915ms)
  AssertionError [ERR_ASSERTION]: Got unwanted exception.
  Actual message: "成长属性必须为有效ID与非负安全整数映射"
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:161:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: EngineError: 成长属性必须为有效ID与非负安全整数映射
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:75
        at guard (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:288:20)
        at Object.fail (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:302:55)
        at resolve (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/progression.ts:15:66)
        at Object.validate (file:///workspace/scratch/a43d3bcc68b1/text-world/src/modules/progression.ts:22:88)
        at file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:359:49
        at #enter (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:283:18)
        at #validateStates (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:358:48)
        at new WorldRuntime (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:269:25)
        at createWorld (file:///workspace/scratch/a43d3bcc68b1/text-world/src/engine/index.ts:433:10),
    expected: undefined,
    operator: 'doesNotThrow',
    diff: 'simple'
  }

test at tests/progression.test.ts:168:1
✖ Unicode code-point boundaries accept restricted locations of 65 and 128 astral characters (201.258562ms)
  AssertionError [ERR_ASSERTION]: {"ok":false,"revision":0,"error":{"code":"INVALID_LOCATION","message":"地点提供者没有返回有效当前位置"}}
  
  false !== true
  
      at ok (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:37:137)
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/progression.test.ts:175:22)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

GREEN exit: 0.

```text
✔ Unicode code-point boundaries accept 65 and 128 astral stat characters (933.921764ms)
✔ Unicode code-point boundaries accept restricted locations of 65 and 128 astral characters (344.230001ms)
✔ Unicode code-point boundaries reject external 129-character stat and current-location IDs (357.25515ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2018.802593
```
