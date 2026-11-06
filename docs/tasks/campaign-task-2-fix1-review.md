# Task 2 fix round 1 — scoped independent review

**Verdict: ADDRESSED.** The prior P2 Unicode ID finding is corrected. No new breakage identified in the supplied fix diff, base `d076e1b`, head `8204f63`. Task 2's original review and Unicode addendum remain preserved in `task-2-review.md`; this report closes that specific finding.

Reviewed only `.superpowers/sdd/2026-11-07-campaign/task-2-fix1.diff` and the appended RED/GREEN evidence in `task-2-report.md`. Did not reopen the full original scope or rerun unchanged tests/global checks.

The one-line change at `src/modules/encounter-rules.ts:7` retains the string/nonempty guards and measures the upper bound with `[...value].length`. JavaScript string iteration counts supplementary characters as single code points, matching the existing `idSchema` length semantics. All existing uses of this helper receive the correction, including encounter IDs, location references/exits, loot keys and consumed stat keys. The fix does not alter the host's forbidden JSON key handling, protocols or schemas.

The six positive regressions independently cover encounter, location and loot IDs at both 65 and 128 supplementary code points. Each establishes successful catalog schema/query behavior before adding the duel consumer, then exercises assembly, start, active movement rollback, victory, restore and claim with the relevant reward/win key. The foreign-provider regression tests 129-code-point encounter/location/loot definitions against the exact `INVALID_ENCOUNTER_RULE` code and verifies the original pending-victory snapshot is unchanged before a successful claim.

Owner evidence records genuine behavior RED for the six valid-ID cases with the original helper (6 fail, 1 pass), followed by GREEN for the same focused command after the correction (7 tests, 7 pass, 0 fail; exit 0). The targeted command is `node --test --test-name-pattern='astral ID boundary' tests/encounters.test.ts`. These are attributed owner-run results, not a reviewer rerun. Code inspection and the focused evidence directly address the previously reproduced defect; no additional probe was needed.

No remaining finding or requested revision within this fix round. Root's remaining integration-wide gates are unaffected.
