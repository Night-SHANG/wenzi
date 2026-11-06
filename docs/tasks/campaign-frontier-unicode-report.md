# Frontier Unicode interoperability correction

Recorded: 2026-11-07 01:27 Beijing time (UTC+08:00).

## Scope and root cause

Owned files only:

- `src/modules/gathering.ts`
- `src/modules/crafting.ts`
- `tests/gathering.test.ts` (new; exact path did not previously exist)
- `tests/crafting.test.ts`
- This report.

Actual built-in inventory, recipe, gather-rule and location providers accept `idSchema` IDs up to 128 Unicode codepoints. The gathering rule item and description exit checks, and crafting's ID helper, previously counted UTF-16 code units with JavaScript `.length`. Thus 65 supplementary-plane emoji are schema-valid at 65 codepoints but rejected by consumers at 130 code units. Gathering's current-location reader had no upper bound; a concrete external 129-codepoint current ID was accepted by the `sites` query.

The correction counts codepoints with string iteration in those existing checks. It also bounds gathering's consumed current ID at 128 codepoints. No core, contracts, dependencies, registry, provider modules or new validation framework changed.

Both affected implementation versions advance `1.0.0` → `1.0.1`; stateVersion remains 1 and capability versions remain `1.0.0`. Each explicit migration accepts only the identical module ID, implementation version `1.0.0`, stateVersion 1 and returns the original state unchanged. The host continues schema and cross-capability invariant validation. Other origins reject; there is no guessed historical state or reset.

## Tests and behavior

Fourteen new focused cases exercise:

- Real built-in providers with 65 and 128 supplementary-plane codepoint item, recipe and location IDs; successful gathering and paid crafting/collection prove interoperability.
- Real location descriptions containing long exit IDs and actual long current IDs.
- External 129-codepoint gathering item/exit/current IDs; queries and commands reject malformed current IDs with `INVALID_LOCATION`, preserving the complete snapshot.
- External 129-codepoint recipe IDs and input/output item keys on both list and get boundaries; external current IDs fail without consuming inventory.
- Genuine dispatched gathering cooldown and paid crafting job restored from version-1.0.0 registrations into 1.0.1. Cooldown retains 20 remaining seconds and inventory, and the paid job retains its original frozen terms and 15 remaining seconds; final collection/gathering happens once at the deadline.
- Unsupported module identities, versions (both older and newer) and state versions; malformed old cooldown schema/references/order and malformed paid-job schema/references/order remain rejected by restore.

The legacy registrations use the same exported module with its manifest pinned to 1.0.0, operating on ASCII fixtures where the old and corrected checks have identical semantics. The saved state is produced by real dispatch (including actual inventory deductions and time advancement); tests do not invent a paid-job or cooldown history.

## RED evidence

Before any production edits:

```text
node --test --test-name-pattern='frontier Unicode' tests/gathering.test.ts tests/crafting.test.ts
```

Exit code 1. Exact summary:

```text
ℹ tests 14
ℹ suites 0
ℹ pass 5
ℹ fail 9
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4062.914655
```

Executed behavioral failures, not imports/scaffolding failures:

- Crafting real-provider 65- and 128-codepoint cases: `Error [EngineError]: 配方提供者返回了无效配方`, code `INVALID_RECIPE` at `readRecipe`.
- Gathering real-rule 65- and 128-codepoint item cases: `Error [EngineError]: 采集规则返回了无效内容：wood`, code `INVALID_GATHER_RULE`.
- Gathering real-location 65- and 128-codepoint exit/current cases: `Error [EngineError]: 地点能力没有返回有效的地点描述：forest`, code `INVALID_LOCATION`.
- Gathering external 129-codepoint current-ID query: `AssertionError [ERR_ASSERTION]: Missing expected exception.`
- Both old-version restore cases: expected implementation version `1.0.1`, actual `1.0.0`.

After applying the codepoint bounds and implementation-version bumps, but before adding migrations:

```text
node --test --test-name-pattern='frontier Unicode.*patch restores' tests/gathering.test.ts tests/crafting.test.ts
```

Exit code 1. Exact relevant output:

```text
✖ frontier Unicode crafting patch restores genuine paid 1.0.0 job with frozen outputs and remaining time (549.178756ms)
✖ frontier Unicode gathering patch restores genuine 1.0.0 cooldown without resetting time or inventory (548.890303ms)
ℹ tests 2
ℹ suites 0
ℹ pass 0
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 987.772212
```

Both failed with code `MIGRATION_REQUIRED` and the respective exact messages:

```text
crafting: code identity/version/state format changed; explicit migration required
gathering: code identity/version/state format changed; explicit migration required
```

## GREEN evidence

After adding the two strict identity migrations:

```text
node --test --test-name-pattern='frontier Unicode' tests/gathering.test.ts tests/crafting.test.ts
```

Exit code 0. Exact output:

```text
✔ frontier Unicode crafting accepts 65 codepoint recipe item and location IDs from real providers (420.989495ms)
✔ frontier Unicode crafting accepts 128 codepoint recipe item and location IDs from real providers (364.541831ms)
✔ frontier Unicode crafting rejects external 129 codepoint recipe and item IDs (1506.749596ms)
✔ frontier Unicode crafting rejects external 129 codepoint current location without consuming inputs (263.770636ms)
✔ frontier Unicode crafting patch restores genuine paid 1.0.0 job with frozen outputs and remaining time (376.013933ms)
✔ frontier Unicode crafting patch rejects unsupported migration origins and malformed legacy paid jobs (1860.347453ms)
✔ frontier Unicode gathering accepts 65 codepoint item IDs from real rules and inventory (384.585108ms)
✔ frontier Unicode gathering accepts 65 codepoint exits and current IDs from real locations (532.232334ms)
✔ frontier Unicode gathering accepts 128 codepoint item IDs from real rules and inventory (235.565778ms)
✔ frontier Unicode gathering accepts 128 codepoint exits and current IDs from real locations (449.631556ms)
✔ frontier Unicode gathering rejects external 129 codepoint rule items and location exits (486.653725ms)
✔ frontier Unicode gathering rejects external 129 codepoint current IDs before returning sites (249.46095ms)
✔ frontier Unicode gathering patch restores genuine 1.0.0 cooldown without resetting time or inventory (423.857083ms)
✔ frontier Unicode gathering patch rejects unsupported migration origins and malformed legacy cooldowns (1696.929874ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5181.314843
```

Owned-file whitespace verification:

```text
git diff --check -- src/modules/gathering.ts src/modules/crafting.ts tests/gathering.test.ts tests/crafting.test.ts
```

Exit code 0, no output. Read-only owned production diff review confirms only the bounds, implementation versions and migrations changed. No staging or commits performed.

## Risks and limits

- Verification intentionally ran only new focused test patterns, as explicitly required by the parent task and campaign plan. Unchanged suites and global preflight/build/runtime gates belong to root integration; this report does not claim they ran here.
- Supplementary-plane Unicode codepoint counting matches existing schema semantics; it does not introduce grapheme counting or Unicode normalization.
- String spreading allocates one array per checked ID, bounded by the existing JSON input limits; this is the minimal local correction, with no shared helper/framework added.
- Unsupported migration origins continue to fail explicitly. Only the known unchanged state format is preserved; no state-history reconstruction is attempted.

Status: DONE within owned scope; no known blocker.
