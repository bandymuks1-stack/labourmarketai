# ENTITY BEHAVIOR MODEL V1 — WORLD BEHAVIOR ARCHITECTURE — FINAL WORLD LOCK

| Field | Value |
|---|---|
| Status | **BINDING.** The last layer of the world |
| Source | **Owner text, 2026-07-28 — recorded 1:1 in §1** |
| Machine half | `apps/web/lib/product-gate/behavior-model.ts` |
| Enforced by | `.github/scripts/product-gate.mjs` §6d + `lib/guards/product-gate.test.ts` |
| Changes | **No DB, no UI, no API, no migrations.** No functional change in this PR |

## The world is now fully locked

```
PRODUCT_CONSTITUTION                ← axioms + Product Gate
PRODUCT_VISION_LOCK_V1              ← the twelve elements
PRODUCT_UNIVERSE_LOCK_V2            ← the four pillars, map-as-platform
WORLD_STATE_UX_ARCHITECTURE_V1      ← how the world is operated (AI-first)
ORGANIZATION_ROLE_ORCHESTRATION_V1  ← who executes the work
UNIFIED_WORLD_MODEL_V1              ← WHAT things are      (Entity Type)
ENTITY_BEHAVIOR_MODEL_V1            ← WHAT THINGS CAN DO   (this document)
```

**The purpose of this lock:** the world must grow by **changing behavior**, not
by creating new tables, new modules or new architectures.

---

## 1. OWNER TEXT (recorded 1:1, 2026-07-28)

> **CORE PRINCIPLE**
> Entity Type nusako, **KAS tai yra**.
> Entity Behavior nusako, **KĄ tai gali daryti**.
> Entity Relationship nusako, **SU KUO tai susiję**.
> **AI nusprendžia, KURIS elgesys taikomas konkrečioje situacijoje.**
>
> **EXAMPLES**
> **Organization** gali: įdarbinti · organizuoti darbuotojų siuntimą · vykdyti
> atlyginimų administravimą · valdyti projektus · organizuoti mokymus.
> **Person** gali: kandidatuoti · priimti pasiūlymą · dirbti · vadovauti komandai
> · tapti mentoriumi.
> **Project** gali: priimti žmones · būti sustabdytas · būti užbaigtas.
> **Worksite** gali: priimti darbuotojus · turėti pamainas · turėti saugos
> reikalavimus.
> **AI Agent** gali: ieškoti kandidatų · analizuoti CV · rengti pasiūlymus ·
> stebėti pokyčius.
>
> **BEHAVIOR IS CONTEXTUAL**
> Tas pats Entity skirtinguose kontekstuose gali turėti skirtingą elgseną.
> **Todėl elgsena negali būti užkoduota vienoje lentelėje ar viename enum.**
> Ji turi būti išplečiama.
>
> **AI RESPONSIBILITY**
> **AI nesirenka puslapių. AI nesirenka modulių.**
> AI pasirenka: kokią Entity atidaryti, kokį Relationship naudoti, kokį Behavior
> pritaikyti, kokį veiksmą pasiūlyti.
>
> **NO SPECIAL CASES**
> **Negalima kurti architektūros, kur vienam Entity Type reikia specialios logikos.**
> **Jeigu naujam Entity Type reikia naujos architektūros, sprendimas laikomas neteisingu.**
>
> **ARCHITECTURE RULE** — Kiekvienas naujas PR privalo atsakyti: Ar naudojamas
> esamas Entity Type? Ar pakanka pridėti naują Behavior? Ar pakanka pridėti naują
> Relationship? Ar AI gali tuo naudotis nekeisdamas architektūros? Ar World Map
> gali tai atvaizduoti? Ar World State gali tai valdyti?
> **Jeigu atsakymas į paskutinį klausimą yra „ne", sprendimas turi būti perprojektuotas.**

---

## 2. How the rule is read

Two readings decide how the gate behaves, and both follow the owner's wording:

**(a) Behavior is a BINDING, never a column.** Because the same entity behaves
differently in different contexts, a behavior cannot be an enum on the entity or
a row in one fixed table. It is `(entity type × behavior × context)`, and the set
is open — `behaviorsFor()` never switches on the type, so a type it has never
seen resolves through the same code path.

**(b) Question six escalates.** All six answers block, because *NO SPECIAL CASES*
already declares that needing new architecture for a type makes the decision
wrong. But the owner singled out the last one: if **World State cannot control
it**, the decision must be **redesigned**, not merely reviewed. The gate carries
that as `redesignRequired`.

---

## 3. Behavior registry (seeded from the owner's examples)

| Entity Type | Behavior | Context |
|---|---|---|
| organization | `employ` | as_employer |
| organization | `arrange_worker_placement` | as_workforce_provider |
| organization | `administer_payroll` | as_employer |
| organization | `manage_projects` | any |
| organization | `organize_training` | as_training_provider |
| person | `apply` · `accept_offer` | as_candidate |
| person | `work` | as_employee |
| person | `lead_team` | as_team_leader |
| person | `mentor` | any |
| project | `accept_people` · `be_paused` · `be_completed` | while_active |
| worksite | `accept_workers` | while_active |
| worksite | `have_shifts` | any |
| worksite | `have_safety_requirements` | on_site |
| ai_agent | `find_candidates` · `analyse_cv` · `prepare_offers` · `monitor_changes` | any |

This is a **seed, not the closed set**. Adding a behavior is `registerBehavior()`
— data. No union edit, no migration, no module.

---

## 4. SPECIAL-CASE AUDIT (verified 2026-07-28 against the codebase at `611ad0f6`)

**The headline: there is no behavior layer in the product at all.** Zero files
match a behavior or capability registry.

| Area | Evidence | Breaks |
|---|---|---|
| **No behavior layer exists** | 0 matches for `entityBehavior` / `entity_behavior` / `behaviorRegistry` / `EntityCapability` across `lib`, `app`, `components` | no special cases |
| **Actions keyed to actor ROLE** | `lib/conversation/action-registry.ts`: `subject: Role` over the closed union `worker\|company\|agency\|customer`; 30 actions namespaced worker (15) / company (10) / agency (5); **`customer` holds 0** — a fourth actor type with no behaviors at all | behavior is contextual |
| **Preconditions name types directly** | `ActionPrecondition` is a closed union: `has_worker_row` (5 uses), `has_company` (5), `has_agency` (3), `has_agency_connection` (1) | behavior is contextual |
| **Executors split by actor type** | `worker-executors.ts` (193 lines) + `company-executors.ts` (233 lines) — a new actor type means a **third module** | no special cases |
| **Every action is anchored to a page** | `advancedRoute` is a **required** field on all 30 descriptors; **9 of 30** still execute as handler kind `deep_link` | AI selects no pages |
| **The map renders per-kind by design** | `SPATIAL_ENTITY_KINDS` is a closed 3-value union, and the source comment states *"The three kinds NEVER share a rendering contract"* | no special cases |
| **Detail routes are per-type** | `/dashboard/people/[workerId]`, `/dashboard/projects/[id]`, `/dashboard/communication/[conversationId]`, `/dashboard/admin/users/[id]` — **there is no `/entity/[id]`** | AI selects no pages |

**Verdict: `special_case_per_actor_type`.** The product today implements the
owner's examples as bespoke features per actor type, not as behaviors of
entities.

### The one thing that is already right

`lib/conversation/action-registry.ts` is a genuinely good registry — declarative,
LLM-proposable-but-never-LLM-executable, precondition-aware, i18n-keyed, with a
confirmation tier per action. **It is keyed to the wrong axis, not built wrong.**
It needs **re-keying from `Role` to `(entity, context)`** — not replacing. That
is why the migration below is cheap.

---

## 5. MIGRATION PLAN (plan only — nothing executed)

Additive and reversible. **No module is deleted**; the existing registry keeps
working while the key moves.

| Step | What | Risk | Depends on |
|---|---|---|---|
| **B.1** | Add `entityType` + `context` to `ConversationActionDescriptor` alongside `subject: Role`; both keys valid, `Role` derived | low — additive, no behavior change | — |
| **B.2** | Replace type-named preconditions (`has_worker_row`, `has_company`, …) with a **context predicate** evaluated from relationships | medium | B.1, E.2 (relationships) |
| **B.3** | Merge `worker-executors` + `company-executors` into **one** executor that resolves by binding, so a new actor type adds no module | medium | B.1 |
| **B.4** | Give `customer` its behaviors — the audit's proof that the current axis is wrong | low | B.3 |
| **B.5** | Make `advancedRoute` **optional**, and drive the remaining 9 `deep_link` actions inline | medium — this is what stops the AI selecting pages | B.3, World State |
| **B.6** | Map renders by binding, so the three kinds share one rendering contract | high — same job as E.7 / map-as-platform | E.7 |
| **B.7** | One `/entity/[id]` surface replaces the per-type detail routes | high | B.5, E.8 |

**Sequencing rule:** B.6 is the *same job* as `UNIFIED_WORLD_MODEL_V1` E.7 and
`PRODUCT_UNIVERSE_LOCK_V2` §4 (map-as-platform). Three locks name one piece of
work — it is done once.

**Rollback:** every step keeps the old key valid until its replacement is proven,
so any step can be abandoned without data loss. Nothing here is executed by this
PR.

---

## 6. The six mandatory answers

All six questions are still asked. Three are answered by fields **this lock
owns**; three are answered by the **canonical field of the lock that already owns
that question**, so no fact is judged twice.

| # | Question | Canonical field | Owned by | Code when false |
|---|---|---|---|---|
| 1 | Does it use an existing Entity Type? | `needsNewEntityType` | UNIFIED_WORLD_MODEL_V1 | *(never blocks — growth is allowed)* |
| 2 | Is adding a new Behavior enough? | `newBehaviorIsEnough` | **this lock** | `behavior_not_enough` |
| 3 | Is adding a new Relationship enough? | `newRelationshipIsEnough` | **this lock** | `relationship_not_enough` |
| 4 | Can the AI use it without an architecture change? | `aiCanWorkWithIt` | UNIFIED_WORLD_MODEL_V1 | `ai_cannot_work_with_entity` |
| 5 | Can the World Map render it? | `addableWithoutMapChange` | PRODUCT_UNIVERSE_LOCK_V2 | `requires_map_architecture_change` |
| 6 | **Can World State control it?** | `worldStateCanControlIt` | **this lock** | `world_state_cannot_control_it` → **REDESIGN** |

**Why Q1 changed owner.** This lock used to block whenever a new Entity Type
appeared, while `UNIFIED_WORLD_MODEL_V1` says a new type never blocks on its own.
One fact, two locks, opposite verdicts. The Unified World Model wins: growth is
allowed, and **`registrationIsEnough` is the single mechanism** that decides.
Q2 and Q3 are that same mechanism applied to the other two registries — register
a behavior, register a relationship — which is why they stay here and still block.

---

## 7. The TRANSITIONAL WAIVER — honest until E.7 / B.6 exist

Four locks now ask whether the World Map carries a surface and whether World
State controls it. Until **E.7** (map platform) and **B.6** (behavior binding)
ship, the honest answer for a real surface is *not yet* — and every lock says
nothing has to be rewritten today. Without a transition, the only green path
would be to answer untruthfully.

So a declaration may carry **one** `transitionalWaiver`:

| Property | Rule |
|---|---|
| `ownerApproval` | **Required.** An unapproved waiver is just an unanswered question |
| `fields` | Only `reflectedOnMap`, `addableWithoutMapChange`, `worldStateCanControlIt` |
| `enablingStep` | `E.7` or `B.6` — the work that makes it unnecessary |
| Expiry | **Automatic.** The gate computes readiness *from the code*: when the map stops being a closed per-kind union, every waiver becomes `waiver_expired` |
| Visibility | Always reported as `transitional_waiver_in_use` — a waived PR is never silently green |

**It can never excuse** `usesEntity`, `registrationIsEnough`, `newBehaviorIsEnough`
or `newRelationshipIsEnough`. Those are what keep the world one world; only the
*readiness* answers may wait, because only they depend on architecture that does
not exist yet.

---

*Locked. Amended only by explicit owner decision recorded here.*
*No functional change was made: no database, table, UI, API or migration was touched by this PR.*
