# Task 1 — Equipment ownership and frozen catalogs

Status: DONE. Ready for the independent review and root integration gates.

## Scope

Owned changes only:

- `src/modules/equipment-rules.ts`
- `src/modules/equipment.ts`
- `tests/equipment.test.ts`
- this report

No registry, world, host, shared-contract, package or other worker edits. No staging or commits. No global suite, typecheck or build; the plan Global Constraints explicitly reserve these for root.

## Implementation

`equipment.catalog` exports `equipmentRulesModule`, provides `equipment-rule@1.0.0`, and returns the specified get/list shapes. The schema reuses capacity helpers and accepts signed safe-integer modifiers, unique tags and Unicode IDs measured in code points. Runtime readers independently validate external catalog results and compare every listed definition with its get result.

`equipment.slots` exports `equipmentModule`, provides `equipment@1.0.0`, and requires only equipment-rule and inventory. Configured slots are standalone, nonempty and unique. Saved slots must match that exact set, and frozen terms must identify their saved slot. Frozen terms are independent of later catalog edits/deletion; inventory still must recognize every current catalog and frozen item.

Equip removes exactly one incoming item before returning exactly one outgoing item, then writes the new frozen terms. Unequip returns one unit before clearing its slot. All calls use the existing inventory and host transaction. Inventory lists/counts, operation result quantities and observed post-operation quantities are checked at consumption boundaries. Failures, including after downstream partial writes, restore the full snapshot.

Status derives signed modifier sums and deduplicated tags from frozen slots on every query, checking every intermediate sum for safety. List reports current catalog terms, backpack quantities and local equippability; it does not claim arbitrary external capacity policies will permit a swap. Querying never writes. Equip/unequip return the same current status object; no command return shape was prescribed by the binding design.

## TDD evidence

Initial production files were runnable export scaffolds with no-op equip/unequip and empty query results, allowing tests to reach real assertions rather than fail imports.

Command: `node --test tests/equipment.test.ts`

1. Behavioral RED: exit 1; 10 tests, 0 passed, 10 failed. The first assertion observed backpack sword quantity `1`, expected `0` after equip. Other explicit failures included missing rejection, empty list/totals and absent validation. No import-only failures.
2. Initial implementation run: exit 1; 8 passed, 2 failed. Those failures exposed the test fixture reusing mutable catalog objects across setup calls; the invalid-catalog test contaminated later independent worlds. Changed the fixture to clone the declared catalog per world. This was a test-isolation correction, not an expectation weakened to match production.
3. GREEN after fixture correction: exit 0; 10 tests passed, 0 failed.
4. Added focused external-boundary and saved-state cases after initial GREEN. These supplemental tests passed on their first run; they are additional validation, not claimed as separate observed RED cycles.
5. Latest complete focused run: exit 0; 14 tests passed, 0 failed, approximately 7.76 seconds. No warnings or skipped tests.

## Verified behavior

- Exact real inventory conservation through equip, swap and unequip; other containers unaffected.
- Full distinct-slot bag swaps succeed only when incoming is removed first; overflowing returns and unavailable stock restore complete snapshots.
- Invalid/mismatched slots, empty slots, unknown items and same-item repeats reject clearly.
- Status/list exact shapes, per-instance slot independence, live totals/tag deduplication and snapshot-pure queries.
- Frozen terms survive edited and deleted catalog entries, then save/restore. A new equip uses new terms. Underlying inventory deletion or bad current catalog still rejects.
- Independent equipment instances use disjoint containers; existing physical capacity policy is authoritative.
- Ordinary own keys such as toString/valueOf/hasOwnProperty, quotes/spaces, and 128 astral-character item/slot/tag/modifier IDs survive equip/restore/return; overlong IDs reject.
- Invalid modifier/count values, duplicate tags/list IDs, external get/list disagreements, count/list disagreements, malformed command results and downstream partial writes reject without persisted changes.
- Positive aggregate overflow and negative underflow reject atomically; altered frozen fields and mismatched saved slot sets reject on restore.

## Self-review and remaining gates

Reviewed the complete new module sources and test changes against Task 1 and the binding Equipment/Global sections. Checked actual public capability calls, transfer order, own-key handling, schema/runtime agreement, safe intermediate arithmetic, read-only queries and frozen/current separation.

Ran `git diff --check --no-index /dev/null <path>` for both new module files and the test file. Each produced no whitespace diagnostics; exit 1 is normal for these no-index new-file differences, not a whitespace error.

No known implementation concerns remain. Root still owns independent spec/quality review, global typecheck, full tests, integration, build and compiled release gates; this report does not claim those unrun gates passed. No copied or translated upstream game code, data or assets; no new dependency.
