# Gate — office & professional profession catalogue v1 (OWNER_GATE)

**Opened:** 2026-09-06 (window 6, lane G-D2). **State:** OPEN — awaiting the owner's apply.
**Migration:** `supabase/migrations/20260906120000_professions_catalogue_office_v1.sql`
(rollback `supabase/rollbacks/20260906120000_professions_catalogue_office_v1.down.sql`).
**Guard:** `apps/web/lib/guards/professions-catalogue-office-v1.test.ts`.

## Why

Real-user walks on production (build ca96605b, 2026-09-06) proved the platform reads as a
manual-labour product to professionals. "Reikia buhalterio." / "reikia teisininko" /
"reikia inžinieriaus" / "reikia dizainerio" / "reikia konsultanto" / "Reikia projektų vadovo." /
"ieškome pardavimų specialisto" / "reikia finansų analitiko" and "esu buhalteris, ieškau darbo"
all reached the doors with an EMPTY role. The canonical catalogue `public.professions` holds 49
rows — every manual and service trade plus software_developer / teacher / translator — and no
accountant, lawyer, engineer, designer, consultant, project manager, sales / finance / marketing
specialist. The profile screen cannot SET a profession that has no row; `worker_professions`
cannot hold it; matching by profession (`profession_skills` expansion) cannot see it.

## What the migration does (verbatim shape — INSERT … ON CONFLICT DO NOTHING only)

| Table | Rows | Detail |
|---|---|---|
| `public.skills` | +15 | financial-reporting, payroll, financial-analysis, budgeting, tax-accounting, legal-advice, contract-drafting, technical-design, cad-drafting, interior-design, business-consulting, project-management, b2b-sales, digital-marketing, content-writing |
| `public.professions` | +9 | accountant, finance_specialist, lawyer (`finance_legal`); engineer, designer (`engineering_design`); consultant, project_manager, marketing_specialist (`business_management`); sales_specialist (`retail_sales`) |
| `public.profession_skills` | +50 | 4–6 links per profession; the 8 transversal capabilities that already exist (#1297) are reused, not re-seeded |

No DDL, no GRANT/REVOKE, no policy, no UPDATE/DELETE. Idempotent. Counts after apply:
professions 58, skills 176, profession_skills 282.

## Classification

RED **by policy, not by the gate's own detectors**: catalogue data DML is human-gated in this
repository (window 6 lane brief). The file carries `-- @human-gate-approved` on line 1 so the
route is explicit; the PR opens as a DRAFT with `needs-human-gate`. The annotation is an
acknowledgement, not an approval.

## Sequencing — APPLY BEFORE MERGE

The code side offers the new slugs from the static list and then resolves the chosen slug
against the LIVE table: `lib/auth/actions.ts` (`.from("professions").eq("slug", …).eq("is_active", true)`
→ `p_profession_id`), `lib/journal/actions.ts` (same idiom), and
`education_programs.target_profession_slug` is an FK to `professions(slug)`. If the PR merged
first, a person picking "Buhalteris" during onboarding would have the pick silently dropped
(null) and an institution targeting a program at "accountant" would hit an FK error — until the
apply. The seed has no code dependency and is inert until the labels and lexicon ship, so:

1. Owner applies via Supabase MCP `apply_migration` (never `db push`) from the PR head.
2. Read back: `select count(*) from public.professions` = 58; the per-profession link query in the
   migration header returns 9 rows with 4–6 links each.
3. Record the ledger version in `docs/APPLIED_LEDGER.md`; mark the PR ready; merge.

## Rollback

Guarded deletes only: a profession any worker selected, journal entry names, template scopes or
education program targets is NOT removed; a skill any worker evidenced is NOT removed. Stated
risk: a surviving referenced row loses its seed links (re-apply the forward file to restore).

## Coordination with the professional-language lane (`fix/cc/w6-professional-language`)

That lane carries the person's own word as a free-text label when the catalogue has no row and
prefers the catalogue slug when it does (`readProfessionStatement` → `detectNeedProfession`).
Its `role-label.test.ts` (at 90d5fc6c) asserts `professionSlug` is **null** for "esu buhalteris",
"esu buhalterė" and "esu projektų vadovas" — true before this seed, false after. Whichever
branch merges second flips those three expectations to `"accountant"` / `"accountant"` /
`"project_manager"`.
