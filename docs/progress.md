# Implementation ledger — docs/superpowers/plans/2026-11-06-runtime.md

## Preflight decisions

| Task/interface | Check | Ruling |
| --- | --- | --- |
| 1 host | Public contracts and failure cases align | Implement exact contracts; gameplay-free core |
| 2 systems | All module names and capability versions explicit | provider(capability) exposes binding ID for event-source checks |
| 3 adventure | Independent capability family | Same host, no mandatory operating systems |
| 4 integration | Consumes Task 1 exports and Task 2/3 definitions | Root writes world data only after checking actual schemas |
| 1 ↔ 2/3 | src/contracts.ts shared read-only | Root owns contract edits and immediately notifies agents |
| 2 ↔ 3 | Separate files, only array exports combined | Parallel implementation is safe by ownership |
| All ↔ 4 | One shared git index | Root alone commits complete coherent batches |

Ruling: Continue implementation under the user's explicit “继续” and prior autonomous execution preference; do not add a new design approval stop.

Ruling: Apply independent parallel work from the user's long-term development rule §27 over the skill's generic sequential-implementer recommendation. Source files have disjoint owners; integration remains sequential.

Ruling: New isolated project directory and feature branch; no existing repository or branch is modified. No remote repository selected or created.

Ruling: This is the reusable technical foundation and author CLI. Formal visual UI remains at the documented sample-review stage; no unapproved visual design is implemented.

## Status

- Contracts and task briefs written.
- Host, systems, adventure: dispatched next; no passing test claims yet.
- Dependencies: installation in progress.
