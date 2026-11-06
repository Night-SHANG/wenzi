# Bounded final parser correction report

Recorded 2026-11-07 01:39 Beijing time (UTC+08:00), Node.js v24.22.1.

## Scope and finding

Read the complete final-review.md and final-fix-brief.md before implementation. The sole open finding was the P3 compatibility regression at src/presentation/actions.ts:14: a legal legacy instance ID beginning with `{` was unconditionally interpreted as complete Command JSON. The README headline finding was already closed by root and was not changed in this lane.

Changed only:
- src/presentation/actions.ts
- tests/command-text.test.ts
- tests/cli.test.ts
- .superpowers/sdd/2026-11-07-campaign/final-fix-report.md (this report)

No host, contracts, module, dependency, world, global-test, build, staging, commit, publication, or other documentation changes were made by this lane. Existing root-owned working-tree changes were left alone.

## Correction and self-review

The adapter now attempts full JSON decoding for leading-brace text, falls through to the existing legacy grammar only on a JSON SyntaxError, and validates the resulting command with the same public parseCommand path in both forms. Command validation is outside the JSON parsing catch. A successfully decoded but structurally invalid object therefore cannot be reinterpreted as a legacy command.

The parse result uses undefined as the syntax-failure sentinel; JSON.parse cannot produce undefined for valid JSON. Non-SyntaxError failures are rethrown. No gameplay-specific parser or generic framework was added.

Added regressions cover brace-prefixed legacy targets with object input and without input, full JSON using that same target, and structurally invalid JSON that also resembles a two-token legacy command. The latter cases assert INVALID_COMMAND for a missing action, an unknown field, and array/null inputs. These make an accidentally broad catch/fallback observable.

The new real CLI test renames the actual frontier location instance and all bindings/demo targets to `{map`, moves to forest through legacy text, then returns to town through full JSON. The saved revision is exactly 2. Subsequent malformed JSON, unknown-field JSON, and array-input JSON produce exactly three rejection reports and no additional revision/location change. Existing quoted/whitespace-ID, unsafe-JSON, nonobject, ordinary legacy and save/load rejection coverage remains intact.

Self-review inspected the complete owned-file diff after the passing covering run. The JSON validation catch boundary, literal expectations, real child-process CLI dispatch, actual saved-state assertions, fixture cleanup, and unchanged schema validation were checked. `git diff --check` exited 0 with no whitespace diagnostic.

## Behavioral RED evidence

Command:

```bash
node --test --test-name-pattern='brace-prefixed|syntactically valid JSON' tests/command-text.test.ts tests/cli.test.ts
```

Exit code: 1

Captured output:

```text
✖ interactive legacy commands dispatch to brace-prefixed targets and reject malformed commands without mutation (1305.923169ms)
✖ legacy commands accept brace-prefixed targets with and without JSON input (1.569392ms)
✔ syntactically valid JSON commands never fall back after structural validation fails (3.717621ms)
ℹ tests 3
ℹ suites 0
ℹ pass 1
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1529.125676

✖ failing tests:

test at tests/cli.test.ts:92:1
✖ interactive legacy commands dispatch to brace-prefixed targets and reject malformed commands without mutation (1305.923169ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  0 !== 2
  
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/cli.test.ts:115:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 2,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/command-text.test.ts:12:1
✖ legacy commands accept brace-prefixed targets with and without JSON input (1.569392ms)
  SyntaxError [Error]: Expected property name or '}' in JSON at position 1 (line 1 column 2)
      at JSON.parse (<anonymous>)
      at parseActionCommand (file:///workspace/scratch/a43d3bcc68b1/text-world/src/presentation/actions.ts:14:51)
      at TestContext.<anonymous> (file:///workspace/scratch/a43d3bcc68b1/text-world/tests/command-text.test.ts:13:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
```

These are behavior failures against the original production parser, not import/scaffold failures. The direct parser fails with the reported SyntaxError. In the real CLI, the first movement is rejected, so the return-to-town attempt cannot yield the expected two successful movements; the saved revision is 0 instead of 2. The structural-JSON rejection guard already passes and was retained.

## Covering GREEN evidence

Command:

```bash
node --test tests/command-text.test.ts tests/cli.test.ts
```

Exit code: 0

Captured output:

```text
✔ farm CLI executes actual modules and emits a restorable snapshot (1088.019837ms)
✔ narrative world runs without loading inventory, combat or time (910.485811ms)
✔ an external module and world load through public registration (1068.699751ms)
✔ invalid JSON world fails with a nonzero status and useful error (1145.027449ms)
✔ interactive save/load keeps successful state after a rejected command (910.362636ms)
✔ interactive JSON commands address whitespace and quoted IDs while malformed input preserves state (1122.634481ms)
✔ interactive legacy commands dispatch to brace-prefixed targets and reject malformed commands without mutation (1018.497243ms)
✔ early argument errors honor json mode and end-of-options remains positional (834.147148ms)
✔ generic action text round-trips arbitrary IDs and remains compatible with legacy commands (3.413836ms)
✔ legacy commands accept brace-prefixed targets with and without JSON input (0.560539ms)
✔ syntactically valid JSON commands never fall back after structural validation fails (2.689766ms)
✔ generic command text rejects unknown fields, nonobjects, invalid identifiers and unsafe JSON (3.14192ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8272.235985
```

Result: 12 tests passed, 0 failed, covering both complete test files.

## Limits, risks, and handoff

Complete valid JSON takes precedence over the legacy grammar. An ambiguous string that is itself valid JSON but fails Command structure remains rejected; only syntax-failing text can become a legacy command. This is intentional and preserves the review's validation requirement. Legacy tokens and their optional JSON input still pass through public command validation, and invalid text cannot directly mutate the runtime.

This lane ran only the focused RED command and the two covering test files. It did not run global tests, typecheck, preflight, build, or compiled smoke, and does not claim those post-correction gates passed. Parser/test changes invalidate earlier source evidence; root owns refreshing the affected fingerprinted integrated gates and compiled artifacts before release.

All four owned files are frozen for root review/staging after this report. No additional fix wave or commit was performed.

