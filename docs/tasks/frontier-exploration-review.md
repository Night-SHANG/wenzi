# exploration：范围审查与修复复审

最终状态：已通过。以下保留初审发现和复审证据。

## 初审

# Task 1 scoped review

Reviewed range: `49affa9..3c99678`, using the supplied review package. Scope: location, gathering rules, gathering cooldown, simulation-time adapter, and their exploration tests. Reviewed the task brief, implementation report, relevant exact module contracts, and global constraints. The implementation report was treated as historical evidence, not proof of behavior.

## Spec Compliance: Needs fixes

The implementation matches the required module boundaries, exports, capability versions, state ownership, command/query shapes, frozen cooldown behavior, and simulated-time arithmetic. One Important gap remains in validation of an external location provider: a malformed `location.describe` result is accepted as successful reference validation.

## Strengths

- `src/modules/location.ts:17-42`: The location module has no gameplay dependencies; the graph and state schemas reject duplicate exits/visits, and validation checks start, edges, current, visited references, and inclusion of current in visited. Movement visits once and emits its event through the existing transaction context.
- `src/modules/gathering-rules.ts:6-18` and `src/modules/gathering.ts:16-26`: Policy data is separate from cooldown state. The consumer checks external rule identity, required strings, positive safe quantity, and finite bounded positive duration rather than relying on a TypeScript cast.
- `src/modules/gathering.ts:28-31,59-69` and `src/modules/simulation-time.ts:5-14`: Time is obtained through the consumer's bound capability, existing gatheredAt values form the backward-clock baseline, active deadlines are preserved, and new deadlines reject overflow and loss of strict forward progress before the inventory command. Inventory and cooldown changes use the existing shared transaction.
- `src/modules/gathering.ts:10-13,60,66` and `src/modules/location.ts:8-11`: Record ID lookups use the shared own-property helper; cooldown insertion uses an own data property. This supports legitimate prototype-name IDs without treating inherited keys as content.
- `tests/exploration.test.ts:45-124`: Tests use real registry/runtime composition, literal expected results, whole-snapshot comparisons for failed commands, restore/reconfigure behavior, an alternate bound clock, external rules, numeric boundaries, and own-property IDs. The supplied diff is limited to the five Task 1 files and makes no core/contracts/CLI change.

## Critical findings

None.

## Important findings

### I1 — Malformed external location descriptions pass reference validation

**Location:** `src/modules/gathering.ts:49` (the `validate` loop).

The loop calls `ctx.query('location', 'describe', { location: value.location })` and discards the result. The host validates query input and JSON compatibility, but does not validate a provider's result shape (`src/engine/index.ts:332-338`). Consequently, a provider returning `null`, or a description for a different ID, passes the required site-location reference validation as long as the query does not throw. `currentLocation` checking an ID later does not establish that the configured site has a valid description.

This conflicts with the global requirement to validate necessary fields of external capability results and the gathering contract requiring validation of every site's location reference. It matters for the explicitly supported replacement of built-in modules with compatible capability providers.

**Confirmed with one narrow probe:** Registered an external `location@1.0.0` provider with `current -> {id:'forest'}` and `describe -> null`, alongside the actual inventory, clock, gathering-rule, and gathering modules. `createWorld` accepted the assembly. `gather({site:'forestWood'})` then returned success with `{site:'forestWood',item:'wood',quantity:3,readyAt:30}` and committed inventory quantity 3. No source or test files were modified for the probe.

**Requested fix:** Check the necessary `describe` result fields at the capability boundary, including an object result with an ID equal to the requested location; reject malformed or mismatched results with a Chinese error before the assembly/reconfiguration/transaction can commit. Add focused external-provider cases for `null` and mismatched identity, checking rejection and snapshot preservation where applicable. Apply the same necessary-field principle to any other external result used to establish reference validity; a successful JSON-valued call alone does not validate its payload.

## Minor findings

None. No speculative formatting or refactoring gates were added.

## Validation performed

- Read the supplied patch and compared it with the exact Task 1 contracts and global constraints. A cut-off source portion in the initial combined tool response was retrieved to finish reading that hunk.
- Inspected shared numeric/schema helpers and inventory reference-query semantics for the named numeric/reference-validation risks. Inspected the host's read/query and validation paths for the named question of output validation and transaction ownership.
- Ran only the narrow malformed-location-provider probe described above. It exited successfully and demonstrated acceptance and committed gathering despite `describe -> null`.
- Did not rerun the already-reported 37 tests, the full suite, typecheck, build, or Preflight. No new claim is made about those historical test results.

## Task Quality: Needs fixes

Address I1 and verify the added focused cases. The remainder of this task is well scoped and follows the specified modular composition and cooldown design.


## 修复后复审

# Task 1 fix round 1 scoped re-review

Reviewed range: `a1233f6..c88dc98`, using the supplied isolated fix package and appended round-1 implementation evidence. Scope is the original Important finding I1 and new breakage introduced by this fix. No broader Task 1 or integration review was repeated.

## I1: ADDRESSED

`src/modules/gathering.ts:38-47` adds `checkLocation`, which validates that `location.describe` returns an object, has an ID equal to the requested location, has a nonempty string name and string description, and supplies unique nonempty bounded string exit IDs. `validate` now invokes this check for every configured site (`src/modules/gathering.ts:71-73`). The original `describe -> null` case and mismatched description identity now call `ctx.fail('INVALID_LOCATION', ...)` with Chinese presentation text before validation can finish.

The fix also applies the necessary envelope checks to the other reference probes (`src/modules/gathering.ts:48-62`): container list must have an items array and limits object, and item count must return a nonnegative safe integer quantity. These checks do not add state ownership, change capability contracts, reinterpret deadlines, or bypass the existing transaction mechanism.

## Regression coverage reviewed

The three added cases in `tests/exploration.test.ts:146-165` exercise actual registry/runtime composition:

- Malformed and mismatched location descriptions fail assembly with `INVALID_LOCATION`, including the original null result.
- A valid external location permits real gathering with the exact result `{site:'forestWood',item:'wood',quantity:3,readyAt:30}`. Subsequent null/mismatched provider updates must fail with complete snapshot equality. Reconfiguration with the same malformed values must reject and preserve the original world's snapshot and committed inventory.
- Invalid external inventory list/count envelopes fail transactions with complete snapshot equality.

The fixture used for reconfiguration returns its configuration override from the provider query, so the rejection exercises the consumer's new validation rather than a fixture input assertion. The successful external-location path also prevents the new validator from merely rejecting every replacement provider.

The implementation report records RED at 15 passing / 3 failing tests, then GREEN at 18 passing / 0 failing tests. Those counts are historical evidence from the implementer; this re-review assessed the actual isolated diff and did not rerun the suite.

## New breakage findings

- Critical: none.
- Important: none.
- Minor: none.

No unrelated observations were identified within this fix scope. No additional probe was warranted by the diff, and no tests, index, branch, or source files were changed during re-review.

## Task Quality: Approved

I1 is addressed. This approval covers the isolated fix; whole-batch validation remains with root.
