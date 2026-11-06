# v0.6 bounded final correction — independent scoped rereview

**Previous P3 finding: ADDRESSED.**

**Task 4 specification verdict after this correction: PASS.**

**Task 4 code-quality verdict after this correction: PASS.**

**Whole-branch source review gate: PASS; ready to proceed to the remaining release gates.** No open Critical, Important or Minor finding remains from the final review. The original whole-branch report and its evidence/declined-judgment limits remain applicable; this report closes its sole outstanding parser issue and does not claim a second full review or completed publication.

## Scope

Reviewed the exact supplied `review-4a0d753..1fc60e2.diff` once, plus `final-fix-report.md`. Base is `4a0d753c7356b1e1946c12709638113fdc569f20`; corrected head is `1fc60e2ef7a191a99d9f980e1b056bda0f79780f`. The fix touches only `src/presentation/actions.ts`, `tests/command-text.test.ts`, and `tests/cli.test.ts`. Root's concurrent documentation/evidence updates were not treated as new source changes. The already-closed README headline issue was not reopened.

## Why the finding is addressed

At `src/presentation/actions.ts:14`, leading-brace text is now attempted as full JSON, but a JSON syntax failure can proceed to the existing legacy token grammar. The previously reproduced `{map move {"to":"forest"}` input therefore reaches the legacy parser with its original target and object input. Legacy input without an explicit argument object also remains supported.

The catch covers only `JSON.parse`. The call to `command(value)` is outside it, so a syntactically valid JSON value that fails public Command validation cannot be silently reinterpreted as a different legacy command. Both forms still pass through the unchanged public `parseCommand` boundary and the adapter's nonempty receipt-ID check. The `undefined` sentinel is unambiguous because JSON parsing cannot successfully produce `undefined`; unexpected non-SyntaxError exceptions are rethrown.

The new unit cases at `tests/command-text.test.ts:12` cover the reported brace-prefixed target with and without input, plus full JSON using the same target. The cases at `tests/command-text.test.ts:18` specifically require `INVALID_COMMAND` for successfully decoded but structurally invalid JSON, including strings that a mistakenly broad fallback could otherwise treat as legacy tokens. This checks the meaningful error-boundary risk rather than mirroring the parser's implementation.

The new actual CLI case at `tests/cli.test.ts:92` renames the real frontier location instance and bindings to `{map`. It moves to forest through legacy text and returns to town through full JSON. The saved revision must equal two and the actual location must be town. Subsequent malformed syntax, an unknown Command field, and an array input must produce exactly three rejection reports without another revision or location change. This directly covers the original user-visible regression through the real child-process CLI and saved state.

## Evidence and new-breakage assessment

The correction report records the focused pre-fix run as **3 tests: 2 failed, 1 passed**. Both failing cases match the demonstrated defect: direct parsing throws the original SyntaxError, and actual CLI movement fails to produce the expected two committed actions. The structural-validation guard already passed, which the report states accurately.

After the correction, the complete two covering files report **12 tests passed, 0 failed**, exit 0, with the existing whitespace/quoted-ID, ordinary legacy, unsafe JSON, early-JSON error and save/load cases included. These are implementer-run results inspected in the supplied report; they were not independently rerun here.

**No new breakage identified in the fix diff.** The change is local, preserves command validation, introduces no new gameplay/host behavior, and has direct regression coverage. No additional probe was necessary to resolve this small correction after reading the actual control flow and the meaningful RED/GREEN evidence.

## Declined judgments and verification limits

- Complete valid JSON intentionally takes precedence over legacy token interpretation. Syntax-invalid JSON-looking text that is independently a valid legacy command may use that grammar; this is the requested compatibility behavior, not a requirement to reject every brace-prefixed string.
- Prior nonblocking scope rulings remain in the original final review/ledger. This rereview does not reopen unchanged modules, worlds, migrations, provider contracts or broader product scope.
- Refreshed Preflight/build/compiled smoke, archive verification and publication remain root-owned gates. Earlier fingerprints cannot certify the changed parser/tests. Root has begun refreshing the required gates; this scoped verdict certifies the source correction, not the outcome of those executions or a published release.

No unchanged test suites, global checks, source edits, index operations, commits, branch changes or subagents were used by this rereview. This report is its only written file.
