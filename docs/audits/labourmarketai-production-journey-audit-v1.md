# Labourmarket.ai — Production Journey Audit v1 (AUDIT LOOP 1)

**Date:** 2026-07-22
**Target:** `https://labourmarket.ai` (live production)
**HEAD under test:** `664b9ab9` (main, auto-deployed by Vercel)
**Method:** GET-only HTTP probes, in-app browser (DOM + accessibility tree + rendered
text), and read-only Supabase catalog queries. **No account was created, no form was
submitted, no production data was written.**

> Evidence rule for this document: a route returning 200 is *not* evidence a journey
> works. Each row below states what was actually observed in the rendered page.

---

## 1. Scope and the honest limit of this loop

| Journey class | Testable in this session? |
|---|---|
| Anonymous / public journeys | **YES** — fully exercised |
| Authenticated worker journey | **NO** — requires an account |
| Authenticated company journey | **NO** — requires an account |
| Agency / education / admin journeys | **NO** — requires an account |

Account creation is outside what this session may perform, and no pilot credentials were
supplied. Therefore **every statement about a logged-in path in this audit is derived
from code and database state, and is explicitly labelled as such.** No logged-in feature
is declared "working" anywhere in this audit. This is the single largest gap and is the
first owner gate (§6).

---

## 2. Anonymous route sweep — evidence table

26 paths × `lt` / `en` / `ru` = 78 GET requests, 2026-07-22.

| Path | lt | en | ru | Observed |
|---|---|---|---|---|
| `/` | 200 | 200 | 200 | Full landing renders in all three languages |
| `/about`, `/vision`, `/questions` | 200 | 200 | 200 | Render |
| `/pricing` | 200 | 200 | 200 | Renders; content analysed in §4 |
| `/for-workers`, `/for-companies`, `/for-agencies` | 200 | 200 | 200 | Render |
| `/company-need` | 200 | 200 | 200 | Form renders; analysed in §3 |
| `/professions`, `/skills`, `/labour-market` | 200 | 200 | 200 | Render |
| `/work-abroad`, `/work-opportunities`, `/worker-intake` | 200 | 200 | 200 | Render |
| `/match-preview` | 200 | 200 | 200 | Interactive form renders; analysed in §5 |
| `/calculators/project-cost` | 200 | 200 | 200 | Render |
| `/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/data-access` | 200 | 200 | 200 | Render |
| `/auth/login`, `/auth/signup` | 200 | 200 | 200 | Render; analysed in §6 |
| `/cv` | 200 | 200 | 200 | Returns 200 to anonymous callers — see F-1.6 |
| `/onboarding` | 307 | 307 | 307 | Correctly gated |
| `/dashboard` | 307 | 307 | 307 | Correctly gated |

**Result: zero broken public routes, zero locale-missing pages, correct auth gating.**
The public shell is stable. No console errors were reported by the browser on the pages
visited.

---

## 3. Employer journey — "Pateikti darbuotojų poreikį" (`/lt/company-need`)

The employer conversion path is a single free-form + structured intake, then an account
wall. Observed fields, in order:

Company name · contact person (optional) · contact email (optional) · **sector and work
type** · country · headcount · city/region · start date · urgency · expected duration ·
accommodation · transport · language requirements · engagement model · free-text
description → button **"Sukurti skelbimo juodraštį"** (*Create a job-posting draft*) →
then: *"Kad pateiktumėte šį poreikį tolesniam kontaktui, susikurkite nemokamą paskyrą."*

### What is good (verified)

- The free-text → structured draft feature is **not** called a "parser" anywhere in the
  UI. It is presented as *"Sukurti skelbimo juodraštį"* / *"Iš to sukuriame tvarkingą
  skelbimo juodraštį, kurį peržiūrite"*. This already satisfies the naming requirement in
  the audit brief.
- Honest boundaries are stated up-front: *"mes neišgalvojame atlyginimo ir nepublikuojame
  automatiškai"* (we do not invent a salary and do not publish automatically).
- Optional fields are marked "Neprivaloma" with a reason ("padeda greičiau susisiekti").

### F-1.1 — P1 · CONVERSION BLOCKER · The employer cannot express a non-manual need

**Problem.** The "Reikalingas sektorius ir darbo tipas" select offers **39 work types
across 10 categories, and every single one is manual, physical or low-skill service
work.** The only escape hatch is literally labelled *"Kita / pagalbinis darbas"*
("Other / **auxiliary** work") — which frames all unlisted professions as auxiliary
manual labour.

**Evidence.** Rendered options at `/lt/company-need`; source of truth
`apps/web/lib/taxonomy/work-categories.ts` (39 `slug:` entries, categories:
`construction`, `manufacturing`, `warehouse_logistics`, `transport`, `agriculture`,
`cleaning_facility`, `hospitality_food`, `care_support`, `machinery_operators`, `other`).

**The sharpest part of this finding:** the production database **already knows about the
missing professions**. `select slug from professions` returns 49 rows including
`software_developer`, `teacher`, `office_administrator`, `receptionist`, `recruiter`,
`translator`, `customer_service_specialist`, `call_centre_agent`, `sales_assistant`,
`event_organizer`, `site_engineer`, `site_manager`, `foreman`, `safety_specialist`.

Set difference (`professions` in prod minus the public form's 39 slugs) = **31 of 49
professions (63%) exist in the database but cannot be selected by an employer**:

```
auto_mechanic  baker  barber  barista  builder  call_centre_agent  caregiver
concrete_worker  customer_service_specialist  driver  drywaller  event_organizer
foreman  furniture_assembler  gardener  hairdresser  handyman  laundry_worker
merchandiser  nail_technician  office_administrator  rebar_worker  receptionist
recruiter  safety_specialist  sales_assistant  site_engineer  site_manager
software_developer  teacher  translator
```

There is a **second source of truth** for professions (hardcoded TS config vs the
`professions` table), and the public-facing one is the narrower, manual-labour-only one.

**Additional irony worth recording:** the file's own header comment states the opposite
of what it achieved —

> *"WHY: the intake/need selects were construction-only, which made the product read as a
> construction platform even though it positions as the whole labour market. This config
> makes the breadth explicit: ten plain-language sectors … Construction is ONE sector
> among many."* — `apps/web/lib/taxonomy/work-categories.ts:1-20`

The remedy replaced *construction-only* with *manual-labour-only*. There is still no IT,
no professional healthcare, no education, no finance/accounting, no office/administration,
no sales/marketing, no legal, no engineering/design, no creative/media, no science.

| Field | Value |
|---|---|
| Affected user | Every employer outside manual/physical/service sectors; every worker in those sectors |
| Affected path | `/{locale}/company-need`, `/{locale}/worker-intake`, `/{locale}/match-preview`; `apps/web/lib/taxonomy/work-categories.ts` |
| Business impact | The product's stated positioning ("BENDRA DARBO RINKOS PLATFORMA" / general labour-market platform) is contradicted at the exact point of conversion. A non-manual employer bounces. Total addressable market is silently cut to physical labour. |
| Risk level | **HIGH** — conversion blocker + trust blocker |
| Recommended fix | Extend `WORK_CATEGORIES` with the professions the DB already carries, adding at minimum: IT & digital, healthcare & medicine, education & training, office & administration, finance & accounting, sales & customer service, engineering & technical, creative & media. Then make `professions` the single source of truth and derive the config from it (or generate the config in CI and assert parity). |
| Acceptance criteria | (1) Every slug in `professions` is reachable from the public need form and the worker intake. (2) A guard test fails if `professions` gains a slug absent from the form taxonomy. (3) A representative non-manual need (e.g. accountant, nurse, software developer) can be expressed without selecting "Kita". |
| Dependencies | None. Config-only change; `profession` is stored as a free string (`z.string()`), so **no migration is required** — stated in the file header itself. |
| Effort | **S** (config + labels ×3 locales + one guard test) |
| Suggested loop | `IMPLEMENTATION LOOP A — sector breadth v1` |

### F-1.2 — P2 · Country list is Northern Europe only, but the copy says "Europe"

**Evidence.** Country select offers exactly 10: Lietuva, Latvija, Estija, Lenkija,
Vokietija, Nyderlandai, Danija, Norvegija, Švedija, Suomija. Production `countries` table
= 10 rows, consistent. The landing page headline promises *"darbo galimybės Europoje"* /
*"Work Opportunities in Europe"* and the map section is titled *"EUROPOS DARBO KRYPTYS"*,
while the map legend itself is honest: *"BALTIJOS IR ŠIAURĖS EUROPOS DARBO KRYPTYS"*.

**Impact.** An employer in France, Spain, Italy, Belgium, Ireland or Austria cannot submit
a need. Risk: MEDIUM (mis-set expectation), affected user: Southern/Western European
employers and workers. **Recommended:** either state the served region honestly in the
hero ("Baltijos ir Šiaurės Europa"), or extend the country list. Do not leave the promise
and the form disagreeing. Effort **XS** for the copy fix.

### F-1.3 — P2 · Two employer intake paths exist; only one is visible

The anonymous form ends at an account wall, yet an anonymous RPC
`submit_company_need_public_v1` exists and is *correctly* granted to `anon` (the one
function with a proper explicit-anon ACL), and `company_need_public_intakes` holds 1 row
in production. So a genuinely anonymous submission path exists in the schema. Whether the
rendered form reaches it, or whether the account wall is unconditional, could not be
determined without submitting the form. **Status: UNKNOWN — requires either a form
submission (not performed) or a code trace.** Assigned to LOOP 3.

---

## 4. Pricing journey (`/lt/pricing`) — no live payment risk, but a confused contract

### Verified: there is **no** way to be charged today

Quoted from the live page:

- *"Kainos dar nėra galutinės ir sąskaitos už jus šiame puslapyje niekada nepradedamos."*
- *"Vieši mokėjimai dar neįjungti."*
- *"Mokėjimų puslapio nėra ir nieko negalima nusipirkti."*
- Every paid plan carries the badge **"PLACEHOLDER — kaina nustatoma"** or **"MOKĖJIMAS
  NEĮJUNGTAS"**.

**Assessment: the "wrong LIVE payments" P0 class does not currently apply.** This is a
genuine strength and it is unusually honest for a pre-revenue product. It should be
preserved, not "fixed", until the commercial gate is deliberately opened.

### F-1.4 — P2 · The pricing page presents **two incompatible plan taxonomies**

**Evidence.** The same page shows, first, four plans — *Nemokamas · Verslo · Agentūros ·
Įmonių* (with limits "1 projektas / 1 darbo poreikis", "10 projektų / 25 darbo poreikiai",
"Neriboti kuruojami darbuotojai", "Neriboti projektai, SSO, SLA") — and then, lower, a
different five-tier set: *Nemokamas darbuotojas · Worker Plus · Įmonės pilotas ·
Agentūros pilotas · Administratorius / vidinis*, with a different limit vocabulary
("Pasirengimo sąrašai pagal šalis · iki 10", "Atviri darbuotojų poreikiai · iki 5").

A visitor cannot tell which set is real. Prod `plans` = 4 rows. Risk: MEDIUM,
conversion + trust. **Fix:** one plan taxonomy, one source of truth, on one page.
Effort **S**. Detailed reconciliation is LOOP 5's.

### Verified positive: per-capability honesty labels

Each capability is tagged **"VEIKIA PRODUKTE ŠIANDIEN"** vs **"PARUOŠTA — ĮSIJUNGS TIK SU
APMOKESTINIMU"**. This is exactly the kind of feature-reality labelling the rest of the
product needs, and it is a pattern worth reusing (LOOP 2, §4).

### F-1.5 — P1 · The pricing page contradicts the homepage on the core product claim

Pricing page, verbatim:

> *"Čia dar nėra automatinės darbo biržos ir automatinio parinkimo — ankstyvos prieigos
> metu atranką koordinuoja žmogus. Ką matai, tas realiai ir veikia."*
> (*There is no automatic job exchange and no automatic matching here — during early
> access a human coordinates selection.*)

Homepage, verbatim, above the fold:

> *"Realių įgūdžių ir darbo poreikių atitiktys."* (*Real skills matched with real work
> needs.*) — and four steps ending *"Atverkite galimybes"*.

One page sells automated skills matching; the other states matching is manual. Both are
public, one click apart. See §5 for the third data point that settles which is true.

---

## 5. Matching reality (`/lt/match-preview`) — the promise and the engine disagree

`/match-preview` is a public, honest tool (*"Tai peržiūros įrankis — jis apskaičiuoja
atitikimą ir jį paaiškina, bet nieko nerezervuoja ir neišsaugo"*). Its value to this audit
is that **it exposes the matcher's actual input model**.

Observed inputs:

| Side | Inputs offered |
|---|---|
| Worker | **Amatas** (one trade, from the same 39-item manual list) · free-from date · accommodation (needs / has own) · transport (has own / needs pickup) · languages |
| Company need | **Amatas** · country · start date · accommodation offered · transport provided · language requirements · accepts non-English speakers |

### F-1.6 — P1 · "Skills matching" is, in production, **trade + logistics** matching

**Problem.** There is **no skills input anywhere in the matching surface.** The worker
side takes a single trade dropdown; there is no field for the worker's skills, evidence,
experience level, certificates or work-journal record — despite skills being the entire
premise of the product ("Ne paprastas CV", "Realių įgūdžių … atitiktys", "Įrodymai, o ne
spėliojimas"). What is actually compared is: one trade slug, a country, a date, and
three logistics booleans (accommodation, transport, language).

**Evidence.** Rendered form at `/lt/match-preview`; the trade list is the same 39-entry
`WORK_CATEGORIES` set; production `worker_skills` = 33 rows and `profile_skill_claims` =
27 rows exist but do not appear in this surface.

| Field | Value |
|---|---|
| Affected user | Workers (their accumulated skill evidence does not affect matching) and employers (results cannot be trusted as skill-based) |
| Affected path | `/{locale}/match-preview`; matching modules under `apps/web/lib` (exact modules enumerated by LOOP 4) |
| Business impact | The central differentiator ("not a CV — real skills matched") is not implemented in the matching surface a visitor can actually try. This is the credibility core of the product. |
| Risk level | **HIGH** — trust blocker, and the primary reason the product reads as a labour-supply broker rather than a skills platform |
| Recommended fix | Two-track. (a) Short term, align the words to the system: describe the preview honestly as availability/logistics fit. (b) Real fix: feed confirmed `worker_skills` / `profile_skill_claims` / journal evidence into the match and show a per-factor explanation. |
| Acceptance criteria | Either the public copy no longer promises skills matching, **or** a match result names the specific skills that matched and their evidence level. |
| Dependencies | LOOP 4's verdict on what the recognition engine actually produces |
| Effort | (a) **XS** · (b) **L** |
| Suggested loop | `IMPLEMENTATION LOOP B — matching promise alignment` (a) then `LOOP F — evidence-weighted matching` (b) |

### F-1.7 — P3 · `/{locale}/cv` returns 200 to anonymous callers

`robots.txt` disallows `/*/cv`, which implies it is meant to be private. It returns 200
without authentication in all three locales. Whether it renders personal data or only an
empty shell was **not** determined (that would require inspecting a real CV). **Status:
UNKNOWN — needs a 5-minute code check.** Flagged to LOOP 6 as a privacy question, not
asserted as a leak.

---

## 6. Signup journey (`/lt/auth/signup`) — findings

Accessibility-tree capture of the entire form (mobile 375×812):

```
form
  heading "Sukurkite paskyrą"
  button "Tęsti naudojant „Google“"  ("Atidaroma naujame skirtuke")
  label "Darbo el. paštas"  textbox type=email  placeholder="vardas@imone.lt"
  label "Slaptažodis"       textbox type=password
     hint "Bent 8 simboliai, 1 didžioji raidė, 1 skaičius, 1 specialusis (!@#$%)."
  label "Pakartok slaptažodį" textbox type=password
  button "Registruotis" type=submit
  link  "Prisijungti" → /lt/auth/login
```

### F-1.8 — P0 candidate · LEGAL BLOCKER · No terms or privacy notice at account creation

**Problem.** The signup form contains **no link to the Privacy Policy, no link to the
Terms, no consent checkbox, and no "by registering you agree…" text.** The complete DOM
above is the entire form. Meanwhile `/lt/legal/privacy` and `/lt/legal/terms` exist and
return 200 — the documents are written, they are simply not presented at the moment
personal data is collected.

**Why this is severe.** GDPR Art. 13 requires the controller to provide the privacy
information **at the time the personal data is obtained**. Account creation is that
moment. A privacy policy that exists at a URL the user was never shown does not satisfy
it. Independently, forming a contract (Terms) without presenting the terms is a consumer-law
exposure. The platform's declared controller structure (UAB as operator/controller) makes
this a real, not theoretical, obligation.

| Field | Value |
|---|---|
| Affected user | Every person who creates an account — worker, employer, agency |
| Affected path | `apps/web/app/[locale]/auth/signup/page.tsx` and its form component |
| Business impact | Regulatory exposure at the very first data-collection point; also a trust signal — a hiring platform that never mentions privacy at signup reads as careless with worker data |
| Risk level | **CRITICAL** — legal blocker, trust blocker, launch blocker |
| Recommended fix | Add, above the submit button: a required link to `/{locale}/legal/privacy` and `/{locale}/legal/terms`, and record the acceptance (there is already `privacy_consent_purposes` / `privacy_consent_events` machinery in production to write to). Mirror it on the Google button, which is a second, separate registration path. |
| Acceptance criteria | (1) Both documents are linked and reachable from the signup form in lt/en/ru. (2) A consent event row is written on registration. (3) A guard test fails if the signup form renders without both links. |
| Dependencies | Confirm with LOOP 6 whether `privacy_consent_events` is already wired to another surface, to avoid a second consent system |
| Effort | **S** |
| Suggested loop | `IMPLEMENTATION LOOP C — signup consent & notice v1` |

> Classified as **P0 candidate** rather than confirmed P0 for one reason only: the
> consent could conceivably be captured later in `/onboarding`, which is behind the auth
> wall and was not observable in this session. **This must be resolved before launch.**
> LOOP 6 is asked to confirm; if onboarding does capture it, the finding downgrades to
> P1 (notice presented too late — after the account and its personal data already exist).

### F-1.9 — P2 · Password complexity theatre without breach checking

The form enforces 8+ chars, uppercase, digit, special char. Production Supabase Auth has
**leaked-password protection (HaveIBeenPwned) DISABLED** (advisor
`auth_leaked_password_protection`). `Password1!` passes the rule and is in every breach
corpus. Effort to fix: **XS** — one Supabase Auth setting. Also `auth_otp_long_expiry`
(OTP valid > 1 hour) should be reduced. Both are **owner gates** (auth configuration).

### F-1.10 — P2 · Google OAuth opens in a new tab and leaves the brand domain

Accessibility label: *"Tęsti naudojant „Google". Atidaroma naujame skirtuke"*. Combined
with `docs/policies/domain-truth-v1.md`, which records that `signInWithOAuth` navigates
via `<project-ref>.supabase.co/auth/v1/authorize`, the user sees a raw Supabase project
host mid-login. New-tab OAuth is also a known mobile friction pattern. Note PR #831
(`fix/legacy-oauth-removal-v1`) targets part of this and is currently **CONFLICTING**.
Full removal requires a Supabase custom auth domain (paid) or `signInWithIdToken` —
**owner gate**.

### F-1.11 — P3 · Auth pages carry the homepage `<title>` and have no footer

`/lt/auth/signup` renders `<title>LabourMarket.ai — darbuotojai, darbdaviai, įgūdžiai ir
darbo galimybės Europoje` (the homepage title), whereas `/lt/pricing` and
`/lt/company-need` correctly carry their own. The auth pages also have no footer, no
navigation and no language switcher — the only way out is the logo. Low impact (auth
pages are robots-disallowed) but it is also where the missing legal links would live.

---

## 7. P0 / P1 register from LOOP 1

| ID | Sev | Title | Blocker flags | Effort |
|---|---|---|---|---|
| F-1.8 | **P0 candidate** | No terms/privacy notice or consent at signup | legal, trust, launch | S |
| F-1.1 | **P1** | Employer cannot express a non-manual need; 63% of DB professions unreachable | conversion, trust | S |
| F-1.6 | **P1** | "Skills matching" is trade + logistics matching; no skills input exists | trust | XS / L |
| F-1.5 | **P1** | Homepage promises automatic matching; pricing page states matching is manual | trust, conversion | XS |
| F-1.4 | P2 | Two incompatible plan taxonomies on one pricing page | conversion | S |
| F-1.9 | P2 | Password rules without breach checking; OTP expiry > 1 h | security | XS (owner gate) |
| F-1.10 | P2 | OAuth new-tab + raw Supabase host during login | trust | M (owner gate) |
| F-1.2 | P2 | "Europe" promised, 10 Northern-European countries served | expectation | XS |
| F-1.3 | P2 | Two employer intake paths; visible one unclear | — | S |
| F-1.7 | P3 | `/{locale}/cv` 200 for anonymous — content unknown | privacy? | XS to verify |
| F-1.11 | P3 | Auth pages: homepage title, no footer/nav | SEO/UX | XS |

**Not found (and this is a real result):** no broken public route, no 5xx, no console
errors, no locale-missing page, no live payment path that could charge a user, no
unauthenticated access to `/dashboard` or `/onboarding`.

---

## 8. Owner gates from LOOP 1

1. **Provide disposable pilot credentials** (one worker, one company) or run the
   authenticated journeys and share the output. Until then no logged-in feature can be
   marked VERIFIED by any loop.
2. **Supabase Auth settings:** enable leaked-password protection; reduce OTP expiry
   below 1 hour.
3. **Decide the served-region claim:** "Europe" vs "Baltic & Northern Europe".
4. **Google OAuth de-branding** (custom auth domain is a paid add-on) — decide or defer.
5. **Confirm the legal position on F-1.8** before any acquisition spend begins.

---

## 9. Reproduction steps

```bash
# Public route sweep
for p in "" /about /pricing /for-workers /for-companies /for-agencies /company-need \
         /professions /skills /labour-market /work-abroad /work-opportunities \
         /worker-intake /match-preview /questions /vision /calculators/project-cost \
         /legal/privacy /legal/terms /legal/cookies /legal/data-access \
         /auth/login /auth/signup /onboarding /dashboard /cv; do
  for l in lt en ru; do
    printf "%s\t%s\t%s\n" \
      "$(curl -s -o /dev/null -w '%{http_code}' -m 25 https://labourmarket.ai/$l$p)" "$l" "${p:-/}"
  done
done
```

```sql
-- professions the DB knows (49) vs the 39 the public form offers
select slug from public.professions order by slug;
```

Form taxonomy: `apps/web/lib/taxonomy/work-categories.ts` —
`grep -o 'slug: "[a-z_]*"' … | sort` → 39 slugs.

---

## 10. LOOP 1 result

- **Status:** COMPLETE for anonymous journeys; **BLOCKED_EXTERNAL_INPUT_REQUIRED** for
  authenticated journeys (owner gate 1).
- **Headline:** the public shell is solid and unusually honest about what is not built —
  but the three surfaces a visitor sees first (landing, pricing, match preview) tell
  three different stories about whether matching is automatic and skills-based, and the
  signup form collects personal data without showing a privacy notice.
- **Next:** LOOP 2 — `docs/audits/labourmarketai-usability-and-positioning-audit-v1.md`.
