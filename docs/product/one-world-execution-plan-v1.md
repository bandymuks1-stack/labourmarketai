# ONE WORLD — execution plan v1

| Field | Value |
|---|---|
| Authority | `docs/product/PRODUCT_UNIVERSE_LOCK_V2.md` |
| Rule | **All product growth extends ONE living world. No new modules.** |
| Scope of this document | The plan only. Nothing migrated, nothing removed |

## The one sentence this plan exists to enforce

> Every future piece of work either **registers a new object type**, **adds a
> capability to an existing object**, or **teaches the AI a new action over
> objects that already exist**. If it does none of those three, it is a module,
> and modules are what this lock forbids.

---

## Phase 0 — Make the World Map a platform (blocks everything else)

The lock says a new object type must be **registered**, not require map
re-architecture. Today it does require it (`PRODUCT_UNIVERSE_LOCK_V2` §4), so
this phase is not optional and not parallelisable.

| Step | What | Done when |
|---|---|---|
| 0.1 | Turn `SPATIAL_ENTITY_KINDS` from a closed union into a **runtime registry** keyed by `object_type` | Adding a type is a registry entry, not a type edit |
| 0.2 | Move the render contract from a closed union into a **property of the registered type** | `SpatialRenderContract` is data; two types may share a contract |
| 0.3 | Give the registry the Universal Object Model shape (the 17 properties), with the honest per-type "not applicable / not yet collected" | An object without a timeline is visibly incomplete, never silently missing |
| 0.4 | Prove it: register a **fourth** type end-to-end **without touching map architecture files** | The Product Gate stays green while a new type appears |

**Acceptance: step 0.4 is the whole phase.** If a fourth type still needs an
edit to `spatial-entities.ts`, the phase failed.

---

## Phase 1 — The world becomes alive (per-object capabilities)

Objects may *appear, disappear, change state, move, communicate, invite, accept,
perform actions and accumulate history*. Today most carry state but no history
and no timeline.

| Step | What |
|---|---|
| 1.1 | Timeline + History as first-class object properties (not per-domain tables) |
| 1.2 | Object events feed the Work Journal where the actor is an avatar |
| 1.3 | Object actions become **AI-invocable** — the conversation is the only initiator |

---

## Phase 2 — Register the object types the vision already names

In the owner's example order, each as a **registry entry**, each with the nine
answers. None of these may require Phase 0 to be redone.

`construction_site` · `factory` · `warehouse` · `office` · `training` ·
`event` · `vehicle` · `meeting_point` · `temporary_zone` · `league` ·
`partner` · `ai_agent`

**`ai_agent` is deliberately last and deliberately included** — the lock says AI
agents are world objects too, which means the same registry, the same timeline,
the same history.

---

## Phase 3 — Consolidation (the surfaces that already exist)

This is the previously-mapped work
(`docs/audits/product-vision-surface-assignment-v1.md`), now re-framed as
*"fold surfaces back into the four pillars"* rather than *"delete screens"*:

| Wave | Content | Pillar it returns to |
|---|---|---|
| 3.0 | Decide `/dashboard/advanced` (keep / fold / demote) | AI Conversation |
| 3.1 | Setup surfaces → the conversation | AI Conversation |
| 3.2 | inbox · bookings · service-requests · candidates → AI opens context | AI Conversation |
| 3.3 | `assist` → the conversation | AI Conversation |
| 3.4 | opportunities · listings · intelligence → **map layers** | World Map |
| 3.5 | journal/voice · gallery · privacy · company/planning · activity | Journal / Avatar |

---

## Phase 4 — The two gaps the vision names and the product lacks

| Gap | Why it is Phase 4, not Phase 0 |
|---|---|
| **Objects as first-class entities with history** | Needs Phase 0's registry and Phase 1's timeline; building it before them would hardcode a type again |
| **Reputation / Leagues (user-facing)** | Needs Phase 1.2 — reputation computed only from real journal evidence |

---

## The test every future PR must pass

```
Does it register an object type?          → allowed
Does it add a capability to an object?    → allowed
Does it teach the AI an action?           → allowed
None of the three?                        → it is a module → REFUSED
```

Mechanically: the seventeen declaration answers, the nine universe questions
(four of them blocking), and the `map_architecture_change` rule.

---

## Sequencing rule

**Phase 0 blocks Phases 2 and 4.** Phase 3 may run in parallel — consolidating
existing surfaces does not depend on the registry.

Building Phase 2 or 4 before Phase 0 would hardcode object types into a map
that is not yet a platform, which is precisely the failure the lock names.

---

*Plan only. Nothing was migrated, removed or built. Execution begins on the
owner's approval, phase by phase.*
