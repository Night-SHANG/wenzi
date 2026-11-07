# Task3 independent review — calendar and availability

Reviewed1c60a2e..84276df on 2026-11-07 Beijing. Reviewer review_calendar_v09, read-only.

## Spec compliance: Approved

calendar.ts:16/23/37/47 projects bound time using exact specified relations, bounded dimensions/period and empty state. availability.ts:15/27/44/82/90 implements dependency boundaries, half-open windows, adjacency, midnight/week wrap continuity, whole-period open, strict public reads and known empty migrations. availability.ts:57/66 bounds searches by configured dates/windows, never elapsed days or calendar period.

## Strengths

Public calendar validation is centralized (:23/44). Schedule normalization copies before sorting/merging (:31/34/53). Public status checks reject contradictory/unknown fields (:15). calendar.test.ts:33/56/127 exercises real clocks, boundary/fractional times, wraparound, sparse enormous periods, malformed providers, purity/reconfigure/restore. Report honestly limits initial missing-module RED and focused13/13 evidence.

## Findings and quality

Critical: none. Important: none. Minor: none. **Task quality: Approved.** Narrow state/dependency ownership and bounded algorithms match the specified boundary semantics.

## Cannot verify from diff

Hours changing without changing already-paid crafting orders is a cross-task integration requirement. Root assigned this explicitly to the world lane; settlement-world.test.ts's paid-workshop case changes hours to closed, completes both frozen jobs and rejects a new trade. The focused9/9 run records this case; final suite also covers it.

## Checks

Initial combined output cut off availability's opening hunk, recovered only that missing diff segment/spec section. One named outside-diff check verified casts rely on bounded strict schemas: capacity.ts:3–9. No tests rerun and no checkout/Git changes.
