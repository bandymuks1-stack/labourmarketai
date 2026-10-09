# 0022 — Task-local instructions are not permanent restrictions

Status: ACCEPTED (owner, 2026-10-09). Durable interpretation rule for every agent and parallel lane.

## Rule

When the owner says not to mix, interrupt, alter or touch an existing system while
another task is being completed, that means: **keep the current task isolated and
preserve the existing system during that task.**

It does NOT mean:

- never investigate known failures later;
- permanently freeze that system;
- ignore existing defects;
- stop improving reliability;
- remove it from the completion programme;
- wait for another owner instruction before fixing an already-known technical defect.

## Equivalences

| Narrow instruction | Is not |
|---|---|
| preserve during unrelated work | permanently freeze |
| do not mix tasks | do not fix later |
| do not replace existing functionality | do not improve existing functionality |
| leave this unchanged for this implementation | the owner permanently prohibited changes |
| separate issue | ignored issue |

## How to read ambiguous wording

Only treat something as permanently prohibited, deferred, removed from scope or
owner-gated when the owner **explicitly** made that decision. If the wording can
reasonably have both a task-local and a permanent reading, preserve the owner's
established product direction and choose the narrower, task-local reading. Do not
silently create a permanent restriction, and do not create a new owner gate or a new
restriction on a feed or system from a narrow execution instruction.

## Origin

2026-10-09: "run Sweden and Norway in parallel / do not disturb the Swedish feed while
activating NAV" was read as "leave the known Swedish cadence failures alone". The owner
corrected it: the Swedish failures are an independent reliability defect to diagnose and
repair without changing the Swedish feed's intended behaviour.

## Related

Failure notifications are never disabled to hide a problem. The fix is incident
de-duplication and self-recovery, so the owner is not notified repeatedly about the same
unresolved technical problem.
