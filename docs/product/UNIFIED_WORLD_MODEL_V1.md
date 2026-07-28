# UNIFIED WORLD MODEL V1 — SINGLE DATA MODEL FOR THE ENTIRE PRODUCT

| Field | Value |
|---|---|
| Status | **BINDING.** The canonical world data model |
| Source | **Owner text, 2026-07-28 — recorded 1:1 in §1** |
| Machine half | `apps/web/lib/product-gate/entity-model.ts` |
| Enforced by | `lib/guards/product-gate.test.ts` |
| Changes | **No database, no tables, no UI, no API.** No migration is executed by this PR |

## The lock series

```
UNIFIED_WORLD_MODEL_V1          ← the world's DATA model (this document)
WORLD_STATE_UX_ARCHITECTURE_V1  ← how the world is operated (AI-first, one workspace)
PRODUCT_UNIVERSE_LOCK_V2        ← the four pillars, map-as-platform
PRODUCT_VISION_LOCK_V1          ← the twelve elements
PRODUCT_CONSTITUTION            ← axioms + Product Gate
ORGANIZATION_ROLE_ORCHESTRATION_V1 ← who executes the work
```

---

## 1. OWNER TEXT (recorded 1:1, 2026-07-28)

> **CORE PRINCIPLE** — Visas Labourmarket.ai pasaulis sudarytas iš Entity.
> **Entity yra vienintelė bazinė pasaulio esybė.**
> **Nė vienas būsimas modulis negali kurti naujos bazinės esybės.**
> Keičiasi tik Entity Type.
>
> **ENTITY TYPES** — Minimaliai sistema turi palaikyti: Avatar · Person ·
> Organization · Project · Job · Object · Worksite · Vehicle · Document ·
> Training · Event · AI Agent · League · Partner · Client · Team · Future Entity
> Types.
> **Naujam Entity Type negali reikėti architektūros pakeitimo. Pakanka jį užregistruoti.**
>
> **COMMON ENTITY MODEL** — Kiekviena Entity turi bendrą bazinį modelį.
> Minimalūs atributai: Entity ID · Entity Type · Name · Status · Location ·
> Timeline · History · Relationships · Permissions · Owner · Metadata · Tags ·
> Documents · Media · Actions · Visibility · Extensions.
> **Visi papildomi atributai yra plėtiniai.**
>
> **ROLES** — **Roles nėra Entity. Roles nėra Organization Type. Roles nėra
> Person Type. Roles yra dinaminiai priskyrimai.**
> Tas pats Person gali būti: Candidate · Employee · Team Leader · Client · Owner
> · Trainer · Partner.
> Ta pati Organization gali būti: Employer · Workforce Provider · Client ·
> Training Provider · Partner · Logistics Provider · Payroll Provider ·
> Verification Provider.
> **Projektas neturi būti ribojamas vienu vaidmeniu.**
>
> **RELATIONSHIPS** — **Pasaulis statomas ne lentelėmis, o ryšiais tarp Entity.**
> Pavyzdžiai: Person → works_on → Project · Organization → employs → Person ·
> Organization → owns → Project · Project → located_at → Object · Avatar →
> represents → Person · AI → recommends → Job.
> **Future ryšiai turi būti pridedami nekeičiant architektūros.**
>
> **WORLD STATE** — World State saugo: aktyvų Avatar; aktyvią Entity;
> pasirinktas Entity; aktyvius filtrus; AI tikslą; Context Panel; Map būseną;
> Conversation būseną; aktyvius veiksmus.
> **AI keičia tik World State. Komponentai persibraižo automatiškai.**
>
> **WORLD MAP** — World Map rodo Entity. **Jis nežino, ar tai žmogus, įmonė,
> projektas, darbas, objektas ar AI agentas.** Jis moka atvaizduoti Entity pagal
> tipą.
>
> **AI** — AI dirba tik su Entity. Jis negalvoja: "atidarau Worker". Jis galvoja:
> **"atidarau Entity"**. Tai galioja visoms pasaulio esybėms.
>
> **ARCHITECTURE RULE** — Kiekvienas naujas PR privalo atsakyti: Ar naudojama
> Entity? Ar reikalingas naujas Entity Type? Ar pakanka užregistruoti naują
> tipą? Ar kuriamas naujas Role? Ar kuriamas naujas Relationship? Ar naujas
> tipas automatiškai palaikomas World Map? Ar AI gali dirbti su šiuo Entity?
> **Jeigu atsakymas yra "ne", architektūra laikoma neteisinga.**

---

## 2. How the rule is read

One nuance matters, because it decides how the gate behaves:

> Needing a **new type**, a **new role** or a **new relationship** is FINE — the
> world is meant to grow that way. What is never fine is needing an
> **architecture change** to add them.

So the deciding question is not *"is anything new?"* but
**"is registering it enough?"**. That is the field the gate blocks on.

---

## 2a. ONE definition per concept — what this lock imports

**Object ≡ Entity.** The world "object" of `PRODUCT_UNIVERSE_LOCK_V2` and the
Entity of this lock are the same thing. **`Entity` is the canonical
architectural term**; "object" survives only as the map-layer word.

This lock therefore **imports** and does not restate:

| Concept | Defined in | Used here as |
|---|---|---|
| the shared property set | `universal-object-model.ts` (`UNIVERSAL_OBJECT_PROPERTIES`) | `COMMON_ENTITY_ATTRIBUTES`, derived |
| the organization roles | `organization-roles.ts` (`ORGANIZATION_ROLES`) | `ORGANIZATION_ROLES_UNIFIED`, re-export |
| the World State slots | `world-state.ts` (`WORLD_STATE_SLOTS`) | re-export |

The attribute set is **derived**: every object property, renamed through
`OBJECT_TO_ENTITY_ALIASES` (`object_id`→`entity_id`, `object_type`→`entity_type`,
`custom_extensions`→`extensions`), plus the two the entity layer contributes —
**name** and **owner**. The object-specific semantics — **geometry**, **events**
and the visibility/visualization contract — are entity semantics carried on the
same rows, so they ride along unchanged.

**Gate questions this lock owns:** `registrationIsEnough` (the growth mechanism)
and `aiCanWorkWithIt`. The map question is **not** re-asked here — the canonical
one is `addableWithoutMapChange`, owned by `PRODUCT_UNIVERSE_LOCK_V2`, and this
lock's validator reads that field.

---

## 3. CONFORMANCE AUDIT (verified against production, 2026-07-28)

| Requirement | Today | Evidence |
|---|---|---|
| One base entity | **NO** | **131 base tables**; no `entity` table exists |
| Relationships, not tables | **NO** | no relationship table; the world is joined through ~30 link tables (`agency_workers`, `company_workers`, `project_members`, `project_worker_assignments`, `project_clients`, `conversation_participants`, …) |
| Generic relationship registry | **NO — but partly present** | `relationship_types` exists and holds `owner, employee, manager, consultant, collaborator, freelancer, unemployed, student, volunteer` — an **employment-relationship vocabulary scoped to `engagement_contexts`**, not a generic predicate registry |
| Roles are dynamic assignments | **NO** | roles live in typed columns: `organizations.organization_type` (single, closed CHECK) and `profile_roles` |
| A new type needs no architecture change | **NO** | a new concept today means a new table + RLS + migration |
| Common entity model (17 attributes) | **PARTIAL** | most tables carry `id/status/created_at/updated_at`; almost none carry `timeline`, `history`, `relationships`, `visibility`, `tags`, `extensions` as first-class |

### The same concept lives in several tables

| Concept | Tables today |
|---|---|
| **Person** | `profiles` (31) + `workers` (31) + `candidate_drafts` |
| **Organization** | `organizations` (9) + `companies` (6) + `agencies` (3) + `customers` |
| **Job** | `job_demands` + `marketplace_listings` + `service_offerings` |
| **Document** | `worker_documents` + `customer_request_attachments` + `conversation_message_attachments` + `journal_entry_photos` |

**Verdict: the product is table-per-concept, not entity-based.**

### The precedent that makes this credible

**`organizations` has already done exactly this migration.** It unified
`companies` (6) + `agencies` (3) into 9 rows and kept `legacy_company_id` /
`legacy_agency_id` as the bridge. The Entity migration is therefore not a
theory in this codebase — it is a pattern that has already shipped once.

---

## 4. MIGRATION PLAN (plan only — nothing executed)

Additive, reversible, one concept at a time. **No table is dropped**; legacy
tables become views or keep a `legacy_*_id` bridge, exactly as `organizations`
did.

| Step | What | Risk | Depends on |
|---|---|---|---|
| **E.1** | `entities` table: the 17 common attributes, `entity_type` as **text with no CHECK** (a type is registered, never constrained) | low — additive | — |
| **E.2** | `entity_relationships`: `(from_entity, predicate, to_entity, metadata)` + a `relationship_predicates` registry seeded from today's link tables | low — additive | E.1 |
| **E.3** | `entity_roles`: many-to-many dynamic assignments, replacing `organization_type` **as the source of truth** (the column stays for display) | medium | E.1 |
| **E.4** | Backfill **Organization** first — the precedent already exists | low | E.1–E.3 |
| **E.5** | Backfill **Person** (`profiles` + `workers` → one entity, two extensions) | medium — the largest read surface | E.4 |
| **E.6** | Backfill Project · Job · Document · Object | medium | E.5 |
| **E.7** | World Map reads `entities` + `entity_relationships` and renders **by type**, so it stops knowing what things are | high — the map platform work (Phase 0 of the one-world plan) | E.6 |
| **E.8** | The AI opens an **Entity**, never a Worker/Company/Project screen | high | E.7 |

**Sequencing rule:** E.7 is the same work as *"make the World Map a platform"*
(`PRODUCT_UNIVERSE_LOCK_V2` §4) — they are one job, not two. Doing E.1–E.6
without E.7 leaves the map still knowing types; doing E.7 without E.1–E.6
leaves it rendering nothing.

**Rollback:** every step is additive and paired with a rollback; the legacy
table remains authoritative until its backfill is proven, so any step can be
abandoned without data loss.

---

## 5. The seven mandatory answers

| # | Question | Field | Blocks when |
|---|---|---|---|
| 1 | Does it use Entity? | `usesEntity` | false |
| 2 | Does it need a new Entity Type? | `needsNewEntityType` | never — growth is allowed |
| 3 | **Is registering it enough?** | `registrationIsEnough` | **false** |
| 4 | Does it create a new Role? | `createsNewRole` | never — roles are dynamic |
| 5 | Does it create a new Relationship? | `createsNewRelationship` | never — predicates are registered |
| 6 | Is the new type automatically supported by World Map? | `mapSupportsAutomatically` | false, when a new type is introduced |
| 7 | Can the AI work with this Entity? | `aiCanWorkWithIt` | false |

RED codes: `not_entity_based` · `registration_not_enough` ·
`map_does_not_support_type` · `ai_cannot_work_with_entity` · `new_base_entity`.

---

*Locked. Amended only by explicit owner decision recorded here.*
*No migration was executed, and no database, table, UI or API was changed by this PR.*
