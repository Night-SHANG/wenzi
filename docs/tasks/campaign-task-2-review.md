# Task 2 independent spec and quality review

## Verdict

**Spec: REVISIONS REQUIRED. Quality: REVISIONS REQUIRED.** One confirmed P2 correctness finding in the supplied owned-file diff `review-task-2-3c8ba01..d076e1b.diff` (base `3c8ba01b3cb70c58aeeb18b4000263837c7df222`, head `d076e1b6a7b061280dee529cf606e6d06e9a273b`). This amended verdict supersedes the initial PASS after root identified the Unicode-length boundary for a bounded follow-up review.

This is an independent implementation review, not a new claim that the unchanged focused suite was rerun. Root's complete Preflight/build/release verification remains outstanding and outside this task.

## Reviewed evidence and scope

Read the task brief and owner report, the exact public capability preamble and complete encounter/combat section of `docs/superpowers/specs/2026-11-07-campaign-design.md`, all four files in the supplied diff, and the corresponding current implementation. Read existing inventory/location/time helpers and host transaction/JSON/restore boundaries solely to verify the public capability and rollback assumptions. No judgment is based on parallel owners' unreviewed changes.

Reviewed production files: `src/modules/encounter-rules.ts`, `src/modules/combat-rules.ts`, and `src/modules/encounters.ts`. Reviewed tests: `tests/encounters.test.ts`. The supplied change does not modify core/contracts, dependencies, registry, CLI, or other owners' files.

The report correctly distinguishes import-only initial RED from behavioral RED, and fixture ambiguity/null-handling corrections from production failures. The reported 15/15 focused run and the subsequent 1/1 corrected retreat assertion run are owner-run evidence; I did not rerun them. Root separately reports actual-provider integration 7/7. The initial review ran no executable checks. The bounded follow-up ran only the three-case real-host Unicode probe below; no unchanged suite or global checks were rerun.

## Confirmed finding — P2: valid Unicode IDs rejected by the duel consumer

**Reference:** `src/modules/encounter-rules.ts:7` (`isId`), consumed by `readEncounter` at lines 11–14 and `src/modules/encounters.ts:18,20,25`.

The existing `idSchema` specifies `maxLength: 128`, which the host's JSON Schema validation measures in Unicode code points. The new helper instead uses JavaScript `value.length`, which measures UTF-16 code units. Consequently IDs containing supplementary Unicode characters can pass the public schema but fail the encounter consumer. This violates the binding preamble that IDs follow the existing `idSchema` and prevents assembly of otherwise valid worlds. The existing short BMP Unicode test does not cover this boundary.

**Narrow real-host reproduction, confirmed:** Set `const unicode = '😀'.repeat(65)` (65 code points, 130 code units). Assemble the existing capacity, inventory, location, step time, encounter catalog and combat modules with a well-defined public progression/vitals fixture. In separate cases use `unicode` as (1) the encounter catalog key, (2) the existing current/location reference, or (3) the existing loot item key. Before adding `encounters.duel`, each world assembles and catalog `get` succeeds. Add `encounters.duel` with `{container:'player'}` to the otherwise identical definition. World creation fails as follows:

| ID use | Schema/catalog without duel | With duel |
| --- | --- | --- |
| Encounter ID | Accepted; `get` succeeds | `INVALID_ENCOUNTER_RULE` |
| Location ID | Accepted; `get` succeeds | `INVALID_LOCATION` |
| Loot item ID | Accepted; `get` succeeds | `INVALID_ENCOUNTER_RULE` |

The probe ran via `node --input-type=module` on stdin, importing actual existing host/catalog/inventory/location/time/combat/encounter modules. Assertions verified the character counts, successful baseline assembly/get, and exact rejection code for each case. It exited 0 with all three reproductions confirmed. No probe file or production/test edits were made.

**Requested correction:** Align this helper's length semantics with existing `idSchema` (Unicode code-point count), preserving existing nonempty/max-length behavior and the host forbidden-key policy. Add a focused regression covering a valid supplementary-character ID beyond 128 UTF-16 units and rejection beyond 128 code points, including the encounter/location/loot consumer paths. This finding is bounded to the shared helper and its existing consumers; no broader review or core/schema change is requested.

## Contract and implementation checks

- Public manifests, names, versions, dependencies, query/command arguments and response shapes match the binding spec. `combat.difference` accepts nonnegative safe integer operands and computes minimum-one damage independently of encounter/vitals/reward state (`combat-rules.ts:3–7`).
- Current catalog validation is independent of frozen state. It checks list/get entry identity, duplicate IDs and all definition fields, then validates current item/location references (`encounters.ts:30–41,52–60`). Frozen battles are checked directly against their saved references, without fetching their former catalog ID, so valid edits/deletions preserve the enemy and rewards.
- Start gates cover an existing battle, location, life and saved cooldown. Battle snapshots contain the specified frozen values (`encounters.ts:65–71`). Attack reads current player combat stats, validates both damage results, skips retaliation on a lethal player hit, validates the vitals mutation response, and persists the resulting phase (`encounters.ts:73–79`).
- Validation enforces active/victory/defeat enemy-HP invariants and living players for active battles. Defeat is allowed to retain its terminal phase after healing (`encounters.ts:59–61`); attack explicitly requires active phase. The movement event veto compares `event.source` with the actual location binding (`encounters.ts:90`).
- Claim checks the frozen location; applies loot, then positive XP; checks returned counts/experience; increments claimed wins; then writes cooldown and clears the battle (`encounters.ts:81–86`). Existing host nested calls share one transaction and commit only after event processing and all validation, so later reward, wins-overflow, clock or validation failures discard all writes and preserve pending victory. Zero XP avoids an illegal zero gain. Retreat uses the same cooldown calculation for any phase without rewards/wins (`encounters.ts:43–46,88`).
- Counts use safe integer bounds; cooldown/time values use the existing finite nonnegative numeric bound. Positive cooldown that cannot advance the timestamp rejects, as does overflow. The clock baseline includes saved battle and cooldown start times (`encounters.ts:29,43–46,56–57`). Old cooldown/win IDs do not require a current catalog entry.
- Own-property accesses and explicit property writes handle legal prototype-like IDs. The unchanged host JSON boundary still rejects the established forbidden JSON keys. External values consumed by these modules are checked for identity, envelope, range and relevant cross-field consistency; mutation return values are checked before completing the transaction.
- Tests cover the specified numerical wolf sequence, absence of early rewards, repeat failure, source-filtered movement with rollback, defeat/healing, all retreat phases, late loot and XP failures with complete snapshots and retries, restore/time-provider replacement, frozen catalog changes/deletions, reference failures, malformed providers, precision/overflow and legal special IDs. The corrected retreat loop reads the loop's own world. Explicit bindings in the external-provider fixture avoid the previously disclosed ambiguity masking the intended checks.

## Declined judgments and limits

- Did not demand validation of inventory list item/limit fields that this consumer never uses: the container query is an existence/envelope check, while each referenced reward item is checked through `inventory.count`. The existing public count contract rejects unknown items and containers; requiring inspection of provider internals would violate the module boundary.
- Did not require consumers to re-read a provider's private state after every successful mutation or defend against a provider returning plausible but deliberately dishonest values. Checked mutation return fields and post-transaction module validation are the relevant public contract in this trusted-module host.
- Did not require an active frozen battle's location to equal a reconfigured provider's current location during restore. The specification requires a source-filtered movement veto and reference existence; it does not prescribe an additional binding/reconfiguration restriction.
- Did not classify dense one-line formatting as a release defect. It does reduce ease of future review, but no concrete error or contract ambiguity resulted here and the repository uses the same compact module style.
- Did not treat the honest import-only RED history as proof of behavior-first TDD, nor as a functional defect in the final implementation. Current code, assertions and stated run evidence were assessed separately.

The P2 finding above must be corrected before accepting Task 2. The remaining original review judgments stand; this review does not substitute for root's remaining integration-wide gates.
