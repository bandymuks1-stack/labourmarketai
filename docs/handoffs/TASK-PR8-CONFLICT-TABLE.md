# PR #8 — Doctrine conflict table + Lego (§10) audit

Handoff for the architect review (TASK-PR8-ARCHITECT-REVIEW). Branch:
`feat/cc/m1-onboarding-mvp`.

## Doctrine conflict (resolved)

| # | Conflict (brief asked) | Reconciliation | Documented in |
|---|---|---|---|
| 1 | Path C custom skills (user-typed skill name + description) | Deferred to M2; shown as disabled "coming soon" affordance. No custom-skill storage. (§1/§2 — M1 curated only; user text needs §2.3/§3.) | `profession-skills-picker.tsx` (custom prompt + `customComingSoon`); PR body |
| 2 | Path A CV import stored as "Level 0" | M1 = upload scaffold, **stores nothing** (no extraction, no DB writes). M2 contract documented. | `cv-import-upload.tsx`, `lib/cv/{types,extract,normalize}.ts`; PR "CV import scaffold contracts" |
| 3 | `source: imported/system/custom` | Kept the shipped `worker_skills.source` enum (`self_declared/work_journal/manager_confirmed`); system-selected = `self_declared`. No migration. | migration `0010`; `api/workers/[workerId]/skills/route.ts` |
| 4 | `users.roles_selected` JSON array; `users`/`user_cv` tables | Multi-role maps to `profile_roles` + `active_role`. No new columns, no migration. | `lib/auth/actions.ts` `completeOnboarding`; grep below |
| 5 | i18n in 6 locales | Now **10** locales (binding §2.4): EN+LT real, 8 `[EN] `-placeholder. | `lib/i18n/config.ts`; `messages/*` |
| 6 | `apps/web/src/...`, `/api/auth/signup`, `/api/worker/skills` | Real paths: `apps/web/components` (kebab-case), supabase `signUp`, `/api/professions/[id]/skills` + `/api/workers/[id]/skills`. | PR body |
| 7 | Role labelled "Buyer" / slug implied `buyer` | **Slug stays `customer`** (DB CHECK `worker/company/agency/customer`); only the *label* changed to Pirkėjas (LT) / Customer (EN). Renaming the slug would need a DB migration (out of scope). | `auth.signup.role.customer` JSON; note below |

### 4 — confirm no `roles_selected` code path

```
$ rg roles_selected            # ripgrep, repo-wide (gitignore-aware)
(no matches)
```
Multi-role is written via `profile_roles` (each selected role) + `active_role` (the canonical primary) using the existing `complete_onboarding` + `add_role` RPCs. No `roles_selected` column exists or is referenced.

### 3 — `source` enum analysis (vs §10)

- **Name:** `public.worker_skills.source` — a Postgres `CHECK` constraint (migration `0010`), default `'self_declared'`.
- **Values (slugs):** `self_declared`, `work_journal`, `manager_confirmed`.
- **Call sites:** `apps/web/app/api/workers/[workerId]/skills/route.ts` — `GET` selects `source` and returns it (line ~37/50); `POST` sets nothing (DB default). No TypeScript enum/union for `source` (generated type is `string`).
- **§10 verdict:** values are already **slugs stored in the DB** (compliant on storage), and there is **no hardcoded TS enum** (compliant on the enum prohibition). It currently has **no JSON label layer** because `source` is never rendered as a user-facing label. **Open item (minor):** if `source` is ever surfaced to users, add a `messages/{locale}` label layer. Logged, not a blocker.

## §10 Lego audit of PR #8 (B5)

**a) `profile_roles.role` — slug + JSON.**
- Schema (migration `0003`): `role text not null check (role in ('worker','company','agency','customer','admin'))` — slugs in DB.
- Resolver (label): `auth.signup.role.<slug>` JSON via `useTranslations("auth.signup.role")` → `tRole(role)` (e.g. `role-switcher.tsx`, `account/page.tsx`, `cv-preview.tsx`).

**b) `active_role` — slug + JSON.**
- Schema (`0003`): `profiles.active_role text` with the same CHECK slug set.
- Resolver: same `auth.signup.role.<slug>` JSON layer.

**c) CV import scaffold doc/source types — fixed (was an enum).**
- Was: `type CvImportSource = "pdf" | "docx" | "linkedin" | "manual"` (a TS union → enum path).
- Now: `type CvImportSourceSlug = string` with a doc comment that the registry is DB + per-locale JSON in M2 (seed slugs `pdf/docx/linkedin/manual`), so M2 cannot bake a TS enum. (`lib/cv/types.ts`, `lib/cv/extract.ts`.)

**d) Other fixed lists introduced/touched in PR #8.**
- **Roles** (`ROLE_CARDS`/`ROLE_ORDER` in `onboarding-wizard.tsx` / `actions.ts`): roles are the **fixed RBAC set** (doctrine §5), explicitly permitted by §10's boundary note. Values are slugs; labels via JSON. ✅
- **CV preview tags** (`[CORE]`/`[SYSTEM]`): UI labels via `cv.tagCore`/`cv.tagSystem` JSON, not enums. ✅
- **`COUNTRIES`** const in `onboarding-wizard.tsx` (`["LT","LV","EE",...]`, rendered as raw ISO codes): **pre-existing (PR #5), not introduced in PR #8.** It's a fixed list of ISO codes shown without a localized label layer (a `public.countries` table with name columns also exists). **Open item:** migrate countries to the slug→JSON shape (and out of `countries.name_*` DB columns, per §2) in a dedicated follow-up. Logged; not a PR #8 regression.

## Open items (logged, not blocking this PR)
1. `worker_skills.source` — add JSON labels if/when surfaced to users.
2. `COUNTRIES` / `public.countries.name_*` — migrate to slug→JSON (§2/§10) in a follow-up PR.
