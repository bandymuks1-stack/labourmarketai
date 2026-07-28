# ORGANIZATION ROLE ORCHESTRATION V1 — BUSINESS ORCHESTRATION ARCHITECTURE

| Field | Value |
|---|---|
| Status | **BINDING.** Business-orchestration layer of the product locks |
| Source | **Owner text, 2026-07-28 — recorded 1:1 in §1** |
| Machine half | `apps/web/lib/product-gate/organization-roles.ts` |
| Enforced by | `lib/guards/product-gate.test.ts` |
| Requires now | **Nothing rebuilt.** No orchestration engine, no schema change — this locks the contract and records the gap |

---

## 1. OWNER TEXT (recorded 1:1, 2026-07-28)

> **PAGRINDINIS PRINCIPAS** — Labourmarket.ai yra rinkos orkestratorius.
> Platforma pati nėra apribota vienu įdarbinimo modeliu. Platforma koordinuoja
> visą procesą tarp: kandidatų; organizacijų; klientų; partnerių; projektų.
>
> **ORGANIZATION ROLE MODEL**
> **Konkrečių įmonių pavadinimai architektūroje nėra naudojami.**
> **Naudojami tik organizacijų vaidmenys.**
> **Viena organizacija gali turėti kelis vaidmenis vienu metu.** Pavyzdžiai: Employer · Workforce Provider
> · Talent Provider · Client · Recruitment Partner · Training Provider · Payroll
> Provider · Logistics Provider · Verification Partner · Project Operator.
> **Sistema niekada neturi būti priklausoma nuo konkretaus juridinio asmens
> pavadinimo.**
>
> **DEFAULT ORCHESTRATION** — Jeigu klientas nepasirenka kito įdarbinimo
> modelio, arba platforma nustato, kad reikalingas tarpinis įdarbinimas, sistema
> automatiškai priskiria kandidatą tinkamai organizacijai pagal jos vaidmenis.
> **Tai vyksta automatiškai. Naudotojui nereikia priimti papildomų sprendimų.**
>
> **REAL AVAILABILITY** — **Klientams negali būti rodomi kandidatai, kurių
> platforma realiai negali pristatyti.** Sistema turi rodyti tik tuos kandidatus,
> kuriems egzistuoja realus ir iš anksto apibrėžtas įdarbinimo kelias.
>
> **EXPECTATION CONSISTENCY** — Platforma negali sukurti situacijos, kai:
> kandidatas sutinka; klientas sutinka; bet toliau nėra aiškaus proceso, kas
> organizuoja įdarbinimą. **Tokia situacija laikoma architektūros klaida.**
>
> **AI RESPONSIBILITY** — AI viso proceso metu žino: kokie organizacijų vaidmenys
> yra prieinami; kokį įdarbinimo modelį galima taikyti; kuris modelis yra
> numatytasis; kuris modelis pasirenkamas konkrečiai situacijai. **AI negali
> siūlyti tokio sprendimo, kurio platforma negali realiai įvykdyti.**
>
> **FUTURE PROOF** — Ateityje prie platformos gali būti prijungta neribotas
> organizacijų skaičius. **Tam neturi reikėti keisti architektūros.**
> **Pakanka naujai organizacijai priskirti reikiamus vaidmenis.**
>
> **PRODUCT PRINCIPLE** — Platformos tikslas nėra tik surasti kandidatą.
> Platformos tikslas yra užtikrinti, kad **nuo pirmojo AI pokalbio iki realaus
> darbo pradžios egzistuotų nenutrūkstama, aiški ir įvykdoma proceso grandinė.**
> Jeigu grandinė nutrūksta bet kuriame etape, tai laikoma produkto architektūros
> klaida, o ne naudotojo problema.

---

## 2. The role registry

Ten named roles, as a **registry** — never a closed type. One organization holds
**many** roles at once.

`employer` · `workforce_provider` · `talent_provider` · `client` ·
`recruitment_partner` · `training_provider` · `payroll_provider` ·
`logistics_provider` · `verification_partner` · `project_operator`

**Adding a role must be data.** If connecting a new organization requires a
migration, the architecture has failed the future-proof rule.

### Entity names

| Where | Allowed? |
|---|---|
| Architecture / logic / routing / matching | **NEVER** |
| Legal copy (data controller, selling entity, Terms) | **Yes** — GDPR requires naming the controller |

---

## 3. Employment models and the default

A model is **executable** only when the roles it needs actually exist.

| Model | Requires roles | Default |
|---|---|---|
| `direct_employment` | employer + client | no |
| `intermediated_employment` | workforce_provider + client | **YES** |
| `talent_introduction` | talent_provider + employer + client | no |

Default orchestration assigns the responsible organization **automatically, by
role** — the user makes no extra decision.

---

## 4. The chain that may never break

```
first AI conversation
  → candidate + client agree
    → an employment model that the platform CAN execute
      → an organization RESPONSIBLE for organising it
        → real work starts
```

`validateFulfilmentChain()` returns a break for each failure:

| Break | Meaning |
|---|---|
| `no_delivery_path` | no model is executable — **this candidate may not be shown at all** |
| `model_not_executable` | the AI proposed something the platform cannot do |
| `no_responsible_organization` | both sides agreed and nobody organises it — **architecture error** |
| `no_default_model` | an undecided client has no path |

---

## 5. WHERE THE PRODUCT STANDS TODAY (recorded, not fixed)

Verified 2026-07-28 against production and the codebase.

| Requirement | Today | Evidence |
|---|---|---|
| One organization holds several roles | **NO** | `organizations.organization_type` is a **single** text column |
| Roles are registered, not hardcoded | **NO** | closed CHECK: `company \| agency \| team \| other` |
| Adding a role needs no migration | **NO** | a new role means altering that CHECK — **the exact failure the future-proof rule names** |
| An employment-model concept exists | **NO** | 0 hits for `employmentModel` / `employment_model` / `fulfilment` in the codebase |
| The fulfilment chain is validated | **NO** | nothing checks that someone is responsible after both sides agree |
| Architecture depends on an entity name | **NO — this one is clean** | `UAB "Nonstop Group"` appears only in legal copy (`lib/privacy/consent-definitions.ts`, Terms), never in logic |

**Production reality:** 9 organizations, using only `company` and `agency`.

**Verdict: today the platform is a single-type organization directory, not a
role-based orchestrator.** Three of the six requirements are unmet at the schema
level, and the two most consequential — *real availability* and *expectation
consistency* — have no enforcement at all: a candidate can be shown, both sides
can agree, and nothing guarantees anyone is responsible for employing them.

By the owner's own definition, that gap is **a product architecture error, not a
user problem**. It is recorded here, not fixed: this slice changes no schema.

---

## 6. What closing it requires (plan, not work)

| Step | What | Depends on |
|---|---|---|
| **O.1** | `organization_roles` as a **many-to-many registry** (org ↔ role), replacing the single `organization_type` as the source of truth | owner-gated migration |
| **O.2** | Employment models as data, with `requiredRoles` | O.1 |
| **O.3** | Default orchestration: auto-assign the responsible organization by role | O.2 |
| **O.4** | **Real availability filter** — a candidate with no delivery path is never shown | O.2 |
| **O.5** | Chain validation at agreement time — no agreement may complete without a responsible organization | O.3 |
| **O.6** | The AI reads available roles + executable models, so it can never propose the impossible | O.2 |

`organization_type` is **not deleted** by this plan — it stays as a display/legacy
attribute while roles become the truth.

---

## 7. The five orchestration answers

Any PR touching matching, delivery or agreement must answer:

1. Does it depend on **roles** rather than a specific legal entity?
2. Does it allow one organization to hold **several roles**?
3. Is there an employment model the platform **can actually execute**?
4. Is an organization **responsible** for organising the employment?
5. Is the chain **unbroken** from the first AI conversation to the start of work?

---

*Locked. Amended only by explicit owner decision recorded here. Nothing was
migrated, rebuilt or removed by this slice.*
