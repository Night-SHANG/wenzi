# SDD ledger — plan: docs/superpowers/plans/2026-11-07-settlement.md

Baseline cb414feef8ede9f7486e1be68cc90c1160cd2134; branch feat/settlement-economy; records use Beijing (UTC+08), 2026-11-07. Full v0.8 baseline just delivered and independently verified; public fetch still exact baseline.

## Rulings

- Ruling: User's repeated continuous-batch instruction opts out of repeated design/method/project menus; complete this coherent economy slice through existing authorized publication — risk is reviewable scope rework, so design and boundaries remain explicit.
- Ruling: Keep dedicated clean checkout/new feature branch and existing fixed dependencies; do not duplicate worktrees or rerun unchanged383-test baseline — final exact-content gates cover changes; wrong baseline assumption would invalidate evidence, mitigated by clean public-fetch equality.
- Ruling: Three disjoint implementation lanes run in parallel; Root alone stages/commits and owns shared integration — avoids unnecessary serial waiting; wrong ownership could hide/overwrite files, so review packets and explicit owned paths are required.
- Ruling: Expand noncombat economy using existing crafting/planting/inventory; do not add an automatic production loop or transfer oldmarket private coins — avoids duplicate authorities and step-size-dependent catchup; cost is explicit start/collect operations and a new world identity instead of automatic old-world migration.
- Ruling: Make zero-XP quests usable without progression, while retaining current and frozen nonzero promises — removes a concrete unwanted RPG dependency; a wrong missing-dependency check would lose earned XP, so both catalog and accepted snapshots are tested.

## Preflight conflict scan

| Pair/task | Produced/consumed or internal check | Resolution |
| --- | --- | --- |
|1/2|wallet returns account+coins, price echoes side/item/quantity, shop rules define prices direction.|Use exact contract readers; commerce checks returned and actual before/after values; prices never move funds.|
|3/2|availability query with periodic half-open windows vs trade eligibility.|No events/free replenishment; normal closed quote is unavailable, not invalid world.|
|1/4|Integer wallet vs legacy fractional private market coins.|Newworld initializes explicit accounts/containers; no implicit cross-instance migration.|
|2/4|quote availability vs inventory capacity and binding hints.|View states quote preconditions; actual trade remains authority for capacity/late errors.|
|3/4|Calendar/time pure projection vs ongoing crafting/planting.|Clock belongs to existing time; changing hours never pauses/orders/refunds; exactclock swaps preserve jobs.|
|1|Stock batches crossing target; safe integer price.|Constant-time BigInt arithmetic, no unit loop or fractional currency.|
|2|Only trade counter owned; current catalog always live.|No frozen quotation or duplicate stock/coins; output readbacks/rollback before counter/event commit.|
|3|Unsorted/adjacent windows and week boundary vs closesInSeconds.|Sort/merge valid adjacent windows; reject overlap; wholecycle open returns null; no elapsed-day enumeration.|
|4|Two views/workshops and optional XP migration.|Chain normal text-view wrappers; progression required only where current/frozen nonzero terms promise it; exact1.0/1.1 saves.|

## Work state

Primary-code research and existing-pattern recon complete. Design and plan written; fresh builder check running. No production implementation yet. Root hand calculation is in spec; initial branch clean before these records. Next: resolve builder findings, commit design, extract briefs and dispatch three lanes while Root implements integration.

Builder check 2026-11-07T13:29:03+08:00: nothing important left; exact existing producers/consumers and boundaries checked. Source research copied to docs/settlement-source-research.md. Three lanes ready; no unresolved interface question.
