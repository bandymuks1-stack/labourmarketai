# Full CV System v1 — lifecycle, single truth model, honest boundaries

Sprint v2 §2 slice. The CV is not a document store — it is a **read model over
the canonical tables**, plus confirm-gated write paths that fill those tables
from an imported CV, from manual editors, or from the journal→evidence chain.

## 1. Lifecycle

```
IMPORT                          CREATE (any section, no order)        WORK (journal loop)
──────                          ──────────────────────────────        ───────────────────
PDF / DOCX / TXT upload         profile editors:                      journal entry
  └─ /api/cv/extract              summary · skills · languages         └─ journal_entry_skills
     (text only, no storage)      education · achievements              └─ journal_entry_confirmations
pasted text                       work history · salary ·                 (REAL manager confirm)
  │                               availability · documents
  ▼
lib/cv/structured-parse.ts  ──►  REVIEW PANEL (per-item confirm/discard;
(deterministic, always-on)       conflicts show BOTH values, explicit
  +                              "replace" only — never silent overwrite)
worker_profile agent v1.1                │ confirm
(optional, AI_PROVIDER_MODE=live,        ▼
same single run, labelled)       CANONICAL TABLES (see §2)
                                         │
                                         ▼
                                 EXPORT — /cv (print-to-PDF)
                                 templates: standard | compact (§10 registry)
                                 tailored: /cv?need=<id> (§19 basis, reorder only)
                                 salary/availability: per-export opt-in, default OFF
```

A section renders on the export **only when it has data**
(`lib/cv-export/cv-sections.ts` → `cvSectionVisibility`, guard-pinned by
`lib/cv-export/cv-sections.test.ts`). Honest empty = omitted.

## 2. Single truth model — which table owns which fact

| CV fact | Canonical owner | Write path |
|---|---|---|
| Name / summary | `profiles.full_name` / `profiles.profile_text` | existing profile actions |
| Professions | `worker_professions` | existing picker |
| Skills (3 tiers) | `worker_skills` + `profile_skill_claims` + `journal_entry_skills` | chips confirm + promotion (existing) |
| Work history | `engagement_contexts` (ONE table for invited AND self-declared history; self-declared rows have `organization_id NULL`) | invitations/org flows (existing) + `save_self_declared_work_history_v1` (draft 20260714161000) |
| Languages | `worker_languages` | `save_worker_language_v1` (applied) |
| Education | `worker_education` (draft 20260714160000) | owner-only RLS CRUD via server actions |
| Achievements + **declared certificates** | `worker_achievements` (draft 20260714160000) | owner-only RLS CRUD; `confirmed_by_manager` excluded from grants — app can never set it |
| Held certificates / licences (document inventory) | `worker_documents` (+ `workers.driving_licence_categories`) | documents page (existing) |
| Projects | DERIVED at read time from `journal_entry_confirmations` → `projects` — never stored on the CV | journal confirm flow (existing) |
| Salary expectation | `workers.salary_min_eur/max_eur` | `save_worker_card` (partial, applied) |
| Availability | `workers` availability + preference columns | `save_worker_availability_prefs(_v2)` read-merge-write |

No CV-only tables exist. Profile, CV, journal, matching all read the same rows.

### Honest mapping decision — certificates found in imported text

A certificate mentioned in CV **text** has no file behind it, so it must NOT
become a `worker_documents` row (that would fake the documents-readiness
surface). It is stored as a `worker_achievements` row with
`achievement_type_slug = 'declared_certificate'` and always renders with the
"declared — not verified" label. When the worker later uploads the real
document, the `worker_documents` row is the held-certificate truth.

### Honest mapping decision — imported work history

`engagement_contexts` is the one work-history table, but all existing creation
paths are relationship-anchored (invitations, org triggers). Draft migration
`20260714161000` adds a caller-only RPC that inserts a **self-declared** row
(`organization_id NULL` — organizations are never fabricated from CV text; the
employer name lives in the bounded free-text `title`, exactly as the worker
stated it). Self-declared history carries the same trust level the profile
already assigns to all engagement history: self-stated, never externally
verified.

## 3. Confirmation doctrine (§7.1) in this slice

- extraction/AI **suggests**; nothing persists without the per-item confirm;
- single-value facts (salary, an existing language level, an explicit
  availability "no") conflict-check server-side: the UI shows both values and
  only an explicit **replace** click overwrites;
- AI suggestions come from the SAME single `worker_profile` (v1.1) run as the
  skill chips (task `extract_cv`, via the shared router — cost-audited),
  are labelled, carry `confidence: "low"`, and re-validate all closed
  vocabularies; runtime off → deterministic-only, no fake AI surface.

## 4. Tailored CV (§19)

`/cv?need=<customer_request_id>`: the need must be visible through the
existing gated worker RPC (`list_open_demand_for_workers`); its requirement
set is derived by the same pipeline the opportunity board uses
(`deriveNeedSkills`), and the fit is `computeContextFit` — read-only reuse.
Tailoring only REORDERS (matched skills first) and highlights; every highlight
carries the visible §19 basis line. Wording note: the repo's silent-trust
guard (`lib/guards/silent-trust-wording.test.ts`) forbids affirmative
certification stems (patvirtin/confirm/verif) in `cvExport`, so the basis
renders in records language — "Atitinka {matched} iš {needTotal} įgūdžių,
{confirmed} su įrašais" ({confirmed} = the REAL manager-confirmed count from
`computeContextFit.matchedConfirmed`). Not visible / unstructured → standard
CV + honest note. Nothing persisted, no global score.

## 5. Future (honest seams) and owner gates

**Future (visible as RUOŠIAMA seams, not fake buttons):**
- image OCR import (disabled input + honest label in the CV input panel);
- more print templates (registry `lib/cv-export/templates.ts` — add a slug +
  label + layout branch);
- real achievement confirmation flow (may set `confirmed_by_manager` via a
  future SECURITY DEFINER path; the app deliberately cannot).

**Owner-gated (HUMAN GATE — do not apply without explicit owner OK):**
- apply `20260714160000_worker_education_achievements_v1.sql`
  (education/achievements editors + CV sections light up; until then they
  show the honest "prepared, not enabled" state);
- apply `20260714161000_self_declared_work_history_v1.sql`
  (work-history confirm in the import review lights up).

Both are listed in `docs/APPLIED_LEDGER.md` → Deferred, with paired rollbacks
in `supabase/rollbacks/`.
