# OWNER RELEASE GATE — first safe real use (2026-09-17)

Baseline: production `e5d0ada7` (health ok; auth + db green). Source of
evidence: `FINAL_RELEASE_READINESS_BOARD_2026-09-17.md` and the merged receipts
(#1751 #1753 #1754 #1755). This packet is READ / CLASSIFY / PREPARE — no code
changed, no production data touched, no CONFIRM pressed.

`FINAL_PREMIUM_VISUAL_TARGET = DEFERRED` (visual foundation #1751 accepted for
release work; no Player Card / motion / calendar / historical polish in this cycle).

---

## A. FIRST SAFE RELEASE — what can be handed to real users TODAY

A **controlled pilot with payments disabled**, on the five routed UI locales
(`lt en ru nl de`):

| Actor | What works today on production | Value delivered |
|---|---|---|
| **Worker** | Google sign-in → profile / Living CV → chat-first Work Journal → confirmations → Work in Numbers → opportunities board → express interest → booking → engagement → project assignment → own calendar (journal days + organization-recorded days) | a verified, growing work record and a route to real offers |
| **Employer** | Google sign-in → organization workspace → "I need workers" (headcount · profession · country/object · date · shift · pay · certificates/languages → canonical `customer_requests`) → matched people with reasons → contact → booking → assignment (overlap warning, never a block) → capacity / planning zone → journal review | a filled need with a documented trail |
| **Nonstop (agency)** | same organization workspace as `staffing_agency` (Model B) → declare capacity (`agency_offer`, unmetered) → candidate pool → match one worker to a demand → offer → worker consent → assignment → calendar → evidence | one worker placed per operation, with consent on record |
| **Institution** | organization declares education → invites a learner **as a student** → learner accepts → programme / cohort / cohort member (`set_education_cohort_member_v1`) → practice recorded as work on the learner's profile → competency | a learner whose practice becomes evidence |

Messages between people of different locales are delivered with the
**original text and a language badge** (translation renders the moment the
owner records the grant in B2 — no redeploy needed beyond the grant PR).

Nothing in this release can charge anyone: `PAYMENTS_ENABLED=false` in code,
every LMC spend/purchase flag `false`, the live Stripe key path
`stripe_live_blocked` until the owner-armed activation (MKT-7). The open-needs
ceiling (€0 = 1 need · €99 = 10) is **permissive by design while billing is
disabled** — a pilot organization may hold more than one open need for free,
and that is stated, not hidden.

## B. OWNER ACTIONS BEFORE RELEASE — only what is genuinely necessary

| # | Action | Class | Why it gates first use |
|---|---|---|---|
| B1 | ~~Settle the historical session `47627d4a`~~ **DONE 2026-09-17 under the owner's own session (Chrome)**: Donatas 800 h → `period_aggregate` 2025-06-01→2025-11-30 remote=true; Ramūnas 165 h → `period_aggregate` 2025-07-01→2025-11-30 remote=null; both source texts ("16 month") verbatim; CONFIRM ×2 → **158/158 rows committed, 2329 h = 2329 h**, 7 people (unlinked, `employee` default — correct per person in the roster if needed), 17 objects (+1 orphan twin `work_objects 922a0e9f` "Travers 19" from the plan race fixed in #1765 — owner archive/delete). Even monthly reading = read-side projection (#1764). Per-row decision form (#1763). Notes edit path = RED (no UPDATE RLS on sessions) or GREEN_EXTEND via an `evidence_import_events` CHECK widening — not done. | OWNER_HUMAN_ACTION — CLOSED | Roster-link OFFERS are available on all 7 rows (`/dashboard/company/people`); offering and accepting remain human acts. |
| B2 | ~~Record ONE egress grant~~ **DONE — RED-2 APPROVED (option 1, Gemini only) and applied in code 2026-09-17**; DeepL deferred (owner may add `DEEPL_API_KEY` + `AI_DEEPL_ENABLED` + its own grant row later). | RED decision — CLOSED | Cross-language threads render in the viewer's locale once the carrying deploy is live; badge mode remains the fallback for every refusal/failure. |
| B3 | **Hand the four walk scripts (D) to one real person per actor** and record HUMAN_UI_PROVEN yourself. | OWNER_HUMAN_ACTION | The only way the count moves. |
| B4 | GOV-1: add a READ-ONLY `SUPABASE_DB_URL` GitHub Actions secret. | EXTERNAL_ACTION | Does **not** block users; it unblocks the CI ledger gates. Do it when convenient. |

Everything else in the RED list is **SAFE_TO_DEFER** or **FEATURE_SPECIFIC** (C).

## C. SAFE TO DEFER — does not block first controlled use

| Item | Affects | First-use blocker? | What fails if deferred | Minimum owner decision | Can first release operate without it? |
|---|---|---|---|---|---|
| `translate_message` grant (B2) | every cross-locale thread / instruction | **no** for same-locale or LT/EN/RU/NL/DE pilots who accept originals; **yes** for a pilot whose promise is reading in own language | reader sees the original + badge | one grant row (gemini) | yes (badge mode); FEATURE_SPECIFIC_BLOCKER for the multilingual promise |
| Full language coverage incl. `ka` `uk` (E) | non-routed-locale users | **yes for a Georgian/Ukrainian-speaking worker cohort**, no for the five routed locales | a `ka`/`uk` speaker gets an EN/RU/PL UI and cannot stamp `ka`/`uk` as their message language | ONE consolidated DB CHECK widening (RED) + UI locale promotion (catalog backfill) — see E | yes for lt/en/ru/nl/de cohorts; FEATURE_SPECIFIC_BLOCKER for ka/uk cohorts |
| CAL-7 clash override receipt | employer / Nonstop planner | no | the planner still sees the clash and decides; the deliberate acceptance is not written as a receipt | a receipt row/object (RED packet 2026-09-08) | yes — DETECT → WARN → DECIDE is live; audit of the override is missing |
| Subject refusal write path | a person an organization recorded | no | the person can SEE the record, cannot refuse it in-product (can refuse the roster LINK, which is what makes it theirs) | subject-only INSERT policy / SECURITY DEFINER RPC (RED packet 2026-09-08) | yes — refusing the link already withholds consent |
| Brigade as a unit (E6 / WRK-6) | Nonstop brigade placements | no — individual placements work | no whole-brigade offer/assignment | demand-scoped consent relation + team→project FK (RED, ARCH-4) | yes; FEATURE_SPECIFIC_BLOCKER for brigade operations |
| RPL / recognised equivalence (ARCH-2) | institutions, experienced workers | no | "five years of real work" reads as "certificate missing" for formal requirements | owner-deferred by design | yes |
| MKT-7 payments | monetized use only | **no** for the pilot | nobody can be charged; ceilings unenforced (pilot behaviour) | two independent owner acts to arm live charging + then the ceilings enforce | yes — SAFE_TO_DEFER for pilot; RELEASE_BLOCKER only for the day you want to charge |
| GOV-1 CI secret | agents/CI, not users | no | ledger gates run without the live check | add the secret | yes |
| ORG-5 (manager cannot read roster) | organization managers who are not owners | no (owner accounts see everything) | a manager sees an empty roster | keep the boundary or widen `owns_company` (RED) | yes — pilot organizations run as the owner account |
| EVID-2 (self-confirmation) | a worker who manages their own org | no | a self-confirmed entry is classified weaker, not blocked | block in `review_journal_entry` or keep the classification | yes |
| EVID-6 (v1 select policy) | experience-record replies | no | the surface withholds the reply already | correct the policy (RED) | yes |

**No RELEASE_BLOCKER exists for a controlled pilot in the five routed locales with payments disabled.**

## D. FOUR HUMAN WALKS — shortest real production path to first value

All on `https://labourmarket.ai`, own Google account, own real data. Each walk ends when the stated value is visible. Mark HUMAN_UI_PROVEN only if the person understood the screen without help.

### D1 · WORKER (≈10 min)
1. Sign in with Google → pick your language → `/dashboard/profile`: profession, country, one language, availability. **Value check:** the Player Card reads as *you*.
2. `/dashboard/journal`: type one sentence about yesterday's real work ("klijavau plyteles 6 val. objekte …"). Save. Then one more day.
3. `/dashboard/work-in-numbers`: your days and hours appear; nothing is inflated.
4. `/dashboard/opportunities`: open one relevant opportunity, read what it needs from you, press *interested*.
5. Wait for the employer's reply in `/dashboard/communication`; accept the offer → it appears in `/dashboard/planning` as a commitment; after the day, log it in the journal.
**First value:** a real work record and one real conversation with an employer.

### D2 · EMPLOYER (≈10 min)
1. Sign in → `/dashboard/company` (create the organization if new).
2. `/dashboard/company/needs` → state the need in one sentence or the form: headcount, profession, country/object, start date, shift, pay, certificates/languages → save. It is now a canonical need.
3. Matching: open the need's matched people; read *why* each fits; open one Player Card.
4. Contact one worker → `/dashboard/communication` → propose → booking → on acceptance `/dashboard/company/projects` assign them to the project (watch the overlap notice if any).
5. `/dashboard/company/planning`: the commitment and the four-week capacity line are visible. After work happens, review the worker's journal entry (confirm).
**First value:** one need, one real candidate contacted, one commitment on the calendar.

### D3 · NONSTOP / AGENCY (≈15 min)
1. Sign in as the Nonstop organization (`staffing_agency`) → `/dashboard/company`.
2. Bring people in: `/dashboard/company/people` — invite real workers (they accept with their own Google account) *or* import the historical file (B1 path) and offer roster links.
3. `/dashboard/company/needs` → state capacity ("turime N suvirintojų …") — an `agency_offer`, not a need.
4. Take one real employer demand (D2 step 2 from a client, or your own client's need) → match → offer ONE worker → the worker consents in their own account → assign → `/dashboard/company/planning` shows the commitment.
5. After the shift: the worker logs it; Nonstop confirms it; the hours appear in the worker's Work in Numbers and on the calendar.
**First value:** one consented placement with evidence, no spreadsheet.

### D4 · INSTITUTION (≈10 min)
1. Sign in as the institution's organization → `/dashboard/company/settings` → declare *education / training provider* (keep employment if it also employs).
2. `/dashboard/company/education` → create one real programme and one cohort.
3. `/dashboard/network?type=join_organization&org=<org id>` → invite one real learner **as a student** → share the link; the learner accepts with their own Google account.
4. Back in education: add the accepted learner to the cohort.
5. The learner logs one real practice day in their journal; the institution reviews it; it shows on the learner's profile as practice (not employment).
**First value:** one learner whose practice is evidence on their own living CV.

## E. LANGUAGE MATRIX — canonical, current, required (measured today)

**Internal language support** and **external translation** are separate columns.

| layer | today | notes |
|---|---|---|
| Owner requirement | 24 EU + `ka` + `ru` (26) — plus `uk` named by the owner today | `docs/LANGUAGE_MATRIX.md` |
| UI locales routed (`activeLocales`) | **5**: `lt en ru nl de` | full catalogs (10,263 leaves each) |
| Catalogs present, not routed | `lv et da no sv pl` (6) | truncated (4,150 leaves) + `[EN]` residue; promoting one = backfill ≈6,100 leaves |
| `profiles.locale` | `text`, default `lt`, **no CHECK** (prod: lt 56 · en 1 · ru 1) | any code can be stored; the UI still renders one of the 5 |
| Send-side stamp (`KNOWN_LOCALES`) | 11: `en lt lv et nl de da no sv pl ru` | a message from an unknown locale stamps `original_language = NULL` (honest) |
| DB CHECK `original_language` | the same 11 on `conversation_messages`, `journal_entries`, `candidate_skills`, `organization_evidence_records` (production, verified) | **`ka` and `uk` are refused by the CHECK** — a Georgian or Ukrainian message can only be stored with `NULL` language |
| ESCO labels | 28 locales incl. `uk`; **not** `ka` | taxonomy only |
| Translation router | task `translate_message` → DeepL preferred when enabled, LLM tier otherwise; target = viewer's UI locale | viewer target is always one of the 5 |
| Providers configured in production | **Gemini** (`AI_PROVIDER_MODE`, `GEMINI_API_KEY`, `AI_GEMINI_ENABLED`); **no DeepL** env | Gemini covers `ka` and `uk`; DeepL covers `uk`, **not `ka`** |
| Egress grant for `translate_message` | **gemini, task-scoped, `SENSITIVE_FREE_TEXT` (RED-2 APPROVED option 1, 2026-09-17)**; DeepL deferred | B2 done in code; DeepL/Anthropic/OpenAI/xAI refused |

**Contract status per language (A = author, B = reader):**

| language | UI (B can read the app) | stamp as A's language | stored (CHECK) | translated rendering (after B2, Gemini) |
|---|---|---|---|---|
| `lt en ru nl de` | yes | yes | yes | yes |
| `pl lv et da no sv` | **no** (falls back to a routed locale) | yes | yes | yes as source; never as target (no UI) |
| `uk` | no | **no** (stamps NULL) | **refused** | source: only if stamped — needs the CHECK |
| `ka` | no | **no** (stamps NULL) | **refused** | same |
| other EU 14 | no | no | refused | no |

**The ONE consolidated RED decision for internal support:** widen the four
`original_language` CHECKs (and `KNOWN_LOCALES`) from the 11 to the approved
set **in one migration** — at minimum `+ ka + uk`, better the full 26 + `uk` —
so any approved language can be *stamped and stored* as an original. This is
additive, reversible, RED because it is schema. It does **not** give `ka`/`uk`
a UI: routing a new UI locale is catalog work (≈10,263 leaves per locale),
and that is a separate, non-schema project to schedule per cohort.

**Separate RED decision for external translation:** B2 (egress grant). With
B2 and the CHECK widening, a Georgian worker on the RU UI reads a Lithuanian
manager's message in Russian and writes back in Georgian; the manager reads
Lithuanian. Without the CHECK widening the Georgian reply is stored with
`NULL` language and the manager sees Georgian text with no badge.

## F. GO / NO-GO BLOCKERS — genuine only

| Scope | Verdict | Blocker |
|---|---|---|
| Controlled pilot · workers + employers + Nonstop + one institution · locales `lt en ru nl de` · payments disabled | **GO** | none. B1 and B3 are owner actions inside the pilot, not preconditions. |
| Pilot whose promise is "read in your own language" | **GO after B2** | one grant row |
| Georgian / Ukrainian-speaking worker cohort | **NO-GO** until the `original_language` CHECK widening (RED, one migration) + B2; a `ka`/`uk` UI locale is a later catalog project | schema + grant |
| Brigade-as-unit placements | NO-GO (feature-specific) | E6 + WRK-6 |
| Monetized use (charging) | NO-GO by design | MKT-7 two owner acts; ceilings then enforce automatically |
