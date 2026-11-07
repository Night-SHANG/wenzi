# Task 3 report — Calendar projection and opening policies

记录：2026-11-07 13:34，北京时间（UTC+08）。Dispatch base `e3ee6ba`；分支 `feat/settlement-economy`。

## Result

DONE. Implemented only the assigned production/test files, plus this report:

- `src/modules/calendar.ts`: `calendarModule` (`calendar.cyclic`), public `CalendarStatus` and `readCalendar(ctx, value)`.
- `src/modules/availability.ts`: `availabilityAlwaysModule`, `availabilityScheduleModule`, public `AvailabilityStatus` and `readAvailability(ctx, value)`.
- `tests/calendar.test.ts`: 13 focused tests with real `time.step` / `time.continuous`, public third-party providers and real reconfigure/restore.

All three definitions use version `1.0.0`, stateVersion `1`, and strict empty states. No registry, worlds, UI, engine, contracts, dependencies or another lane's files were edited. No staging or commits performed.

## Implementation decisions and self-review

Calendar is a pure projection of the bound `time.now` provider; its validation and public reader verify finite nonnegative elapsed seconds within the existing time range, positive safe integer day/week dimensions, exact product bounds using BigInt, safe indexes and exact arithmetic relationships. It neither stores elapsed time nor emits/handles time events. `CalendarStatus` extends `JsonObject`, so public query results preserve the strict JSON type boundary without an unchecked external-value cast.

Schedule validates the public calendar response independently. Configuration permits unsorted dates/windows, rejects duplicate days and overlapping/out-of-range windows, and merges adjacent daily windows on a detached copy. Days and fractional seconds stay separate, avoiding unnecessary large absolute week offsets. Current opening uses `[start,end)` membership. End-of-day opening follows only configured consecutive days through wraparound; a completely open period returns `closesInSeconds:null`. Closed status searches only configured dates/windows for the next opening. Complexity is bounded by configured dates/windows (at most128 each), independent of elapsed days or the number of dates in the calendar week.

Always has no calendar requirement and can operate alone. Both opening policies accept only exact known `availability.always` / `availability.schedule`, version1.0.0/state1, empty object migrations. Calendar accepts only its exact own identity/version/state and an empty object. Unknown versions/identities, arrays, null and nonempty history reject rather than clear stored data.

Public availability reader validates all three exact fields and their relationships: open requires opens0 and a positive finite safe-range closing delay or null; closed requires a positive finite safe-range opening delay and closing null. Contradictory ordinary third-party results are rejected through a real public consumer, with snapshots preserved.

## RED / GREEN evidence

1. Wrote `tests/calendar.test.ts` before either production module existed.
2. RED: `node --test tests/calendar.test.ts` exited1; Node reported `ERR_MODULE_NOT_FOUND` for the not-yet-created `src/modules/calendar.ts` (1 test file failed, 0 passed). This initial RED proves missing implementation, rather than a behavior-level assertion failure; it is recorded explicitly to avoid overstating the evidence.
3. Implemented the two modules.
4. GREEN: `node --test tests/calendar.test.ts` exited0: 13 tests passed, 0 failed, 0 skipped/cancelled.

Focused coverage includes literal calendar projections at0/70/190, both real clocks, fractional seconds, exact open/close boundaries, rest-day next opening, adjacent windows, week-tail/head continuity, full-day continuity, whole-period open, MAX_SAFE_INTEGER elapsed and enormous sparse week dimensions, strict config/state schemas, malformed public provider results/readers, query snapshot purity, exact availability swaps and restore.

## Verification scope / concerns

Only the assigned focused test command was run; no full suite, preflight, build, compiled smoke or static typecheck was run in this lane. Root owns aggregate verification. Node type stripping is not a static typecheck claim.

No unresolved implementation or interface concern identified during self-review. Initial RED limitation is stated above; final behavior checks are the focused GREEN evidence.
