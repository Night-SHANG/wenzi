# Task 1 fix round 1 scoped re-review

**Finding verdict: ADDRESSED. Spec correction: PASS. Scoped quality verdict: PASS; no new actionable breakage found in this diff.**

Reviewed the supplied `task-1-fix1.diff` once (`4901eb7..84b7de9`) and the appended fix-round evidence in `task-1-report.md`. The review is limited to the original Unicode-length finding, its two-line production correction, and its three new regression tests.

`src/modules/progression.ts:15` and `src/modules/recovery.ts:8` now use string iteration for the upper bound (`[...key].length` / `[...value].length`), matching the shared schema's Unicode code-point counting. The retained `.length` checks only distinguish empty from nonempty strings, for which code-unit and code-point counting agree. Recovery retains the string-type check; progression still validates safe-count values. These changes preserve the 128-code-point bound and leave core, contracts, schemas, reserved-key policy, ownership, and transaction behavior untouched.

The added tests at `tests/progression.test.ts:158–186` exercise built-in and external progression-rule stat keys containing 65 and 128 astral characters, successful recovery at real restricted locations with those lengths, external stat/current-location IDs containing 129 code points, and complete-snapshot rollback. The current-location rejection explicitly checks `INVALID_LOCATION`. The production correction directly covers the original two reproductions, and the new tests assert their successful behavior rather than merely testing a helper.

**Evidence:** The appended report records `node --test --test-name-pattern='Unicode code-point boundaries' tests/progression.test.ts`: assertion RED with 3 executed tests (2 failures, 1 existing rejection pass), followed by GREEN with the same 3 tests passing, exit 0. This is attributed to the implementer's recorded run; no fresh test execution is claimed by this re-review. Source inspection found no uncovered concrete risk requiring another runtime probe, so the unchanged 20-test suite and global checks were not rerun.

**Limits:** No unrelated modules or earlier unaffected behavior were re-reviewed. Complete Preflight, integration, packaging, and branch readiness remain outside this scoped verdict. Only this review file was written; no source/test edits, staging, commits, or additional agents were used.
