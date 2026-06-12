---
name: doctrine-guard
description: Binding labourmarket.ai platform-doctrine enforcement. ALWAYS use this skill BEFORE any schema change, new table, new RPC, new migration, new component, new page, new route, new server action, or any bug fix that touches data flow — even a "one-liner". Also use it whenever a task could introduce a new structure (a store, a queue, an intake path, a draft table, a settings blob), when planning a slice, when reviewing a PR, or when unsure whether a canonical equivalent already exists. If the task mentions tables, migrations, RLS, visibility, translations, demand intake, messaging, organizations, or fixing a user-reported bug, this skill applies.
---

# Doctrine Guard

You are working on labourmarket.ai — a platform whose purpose is to level the
playing field for the smaller party in any work relationship. Technologies and
tools will change; the essence must not. This skill is how the essence
survives every refactor, every new framework, every new collaborator.

**Binding source of truth: [`docs/PLATFORM_DOCTRINE.md`](../../../docs/PLATFORM_DOCTRINE.md).**
Read it before any change involving schema, user content, permissions, audit
trails, translations, or chat-like features. If your task spec contradicts the
doctrine, the doctrine wins — do not silently override. Add a
`## Doctrine conflict` section to your PR description, propose a reconciled
approach, and ask DI to confirm.

Vision context (the *why* behind everything): [`docs/PROJECT_VISION.md`](../../../docs/PROJECT_VISION.md).

Work through the five checks below **in order**. They are ordered by blast
radius: essence violations poison the product, parallel structures poison the
architecture, missing rails poison the data, bad migrations poison production,
and unverified fixes poison user trust.

---

## 1. ESSENCE — never updatable, only extendable

These principles may gain new applications but may never be weakened,
reinterpreted, or "temporarily" suspended. Each exists for a reason:

| Principle | Why it exists |
|---|---|
| **Clarity** | Trust comes from the *why* — the system must explain decisions, not just display them (VISION §3: "the RIGHT person for the RIGHT work at the RIGHT time — AND WHY"). |
| **Reliability** | Every author-content record may need to function as admissible evidence up to 10 years later (DOCTRINE §3) — a platform that loses or mangles records fails its core promise. |
| **Human-first** | Overloading the worker kills adoption (VISION §14.4); simplicity is the adoption condition, not a nice-to-have. |
| **Level playing field** (§1) | Larger entities win disputes by outlasting, not by being right; the platform makes truth fast to find and evidence cheap to produce so the smaller party can defend themselves. |
| **AI-never-lies** (§7, §7.1) | One fabricated "verified" label destroys the trust that the entire skill-verification ladder is built on; AI drafts, humans approve, always. |
| **Reality principle** (§18) | The product has no demo/pilot/intermediate layer — every screen is a real persisting feature in its true current state; honest empty states framed as a founder moment, never fake examples. |
| **Work Journal as the central spine** | The journal is where work evidence is born; skills, confidence, fit and legal proof all derive from append-only journal entries (§15) — bypass it and every downstream trust signal becomes fiction. |

The litmus test for any change (DOCTRINE §1): *does this make it easier for
the smaller party to defend themselves and prove what actually happened?*

## 2. CANONICAL CHECK — before creating anything new

Past bugs came from well-meaning fixes that built a *second* structure next to
an existing one (`pilot_drafts` next to `customer_requests`; an authenticated
CTA posting to `/api/leads`; a new CTA wired to a parallel save path). A
parallel structure is worse than a missing feature: both copies drift, and the
honest one loses.

Before creating any table, RPC, route, intake path, store, or component
family, ask: **does a canonical equivalent already exist?**

| Concept | Canonical structure — extend this, never duplicate it |
|---|---|
| ORG | `organizations` + `engagement_contexts` + `relationship_types` (DOCTRINE §5.5 — every person-org relationship is an engagement context row) |
| MESSAGING | `conversations` / `conversation_participants` / `conversation_messages` |
| DEMAND | `customer_requests` — the SOLE structured-demand intake (§17); write via `save_demand_draft` / `submit_demand_request` RPCs, never a new table, never `/api/leads` (that is the anonymous pre-auth funnel, §17.2) |
| Project→org link | `projects.organization_id` is the canonical FK |
| Taxonomies | slug registry + per-locale JSON (§10 Lego architecture) — never a hardcoded enum for anything extensible |

Procedure:

1. Search `supabase/migrations/` and the canonical map above for an existing
   equivalent before designing anything new.
2. If an equivalent exists → **extend it** (new column, new `kind`, new slug,
   new scope) — never create a parallel.
3. If genuinely new → state in the PR description **why no existing structure
   fits**. A new structure without that justification is a doctrine violation.
4. Wire new features into the **existing primary CTA/flow** — a second CTA
   next to the primary one creates an invisible parallel system even when the
   tables are shared.

## 3. SAFETY RAILS — apply without being asked

These are schema-level defaults, not per-feature decisions:

- **Default-closed visibility (§4):** conversations, journal entries, work
  proofs and sensitive author content are closed by default; access is an
  explicit grant *row* (revocation = `revoked_at`, never delete). *Why:* who
  could see what, when, is itself legal evidence.
- **Append-only legal proof (§3):** no UPDATE/DELETE via API on author-content
  tables; soft-hide with `hidden_at`; server-side `timestamptz` timestamps;
  `prev_hash`/`content_hash` chain on chat + journal from day 1. *Why:*
  tamper-evidence is the product — a mutable record is worthless in a dispute.
- **Storage minimalism (§6):** never store derived data without TTL + 
  invalidation; files go to Storage, not DB; no denormalized names/titles.
  *Why:* derived copies go stale and stale data lies.
- **Translations (§2):** user content = `original_text` + `original_language`
  only — translation columns are FORBIDDEN; platform taxonomy = slug → JSON
  per locale, all 10 locales in the same PR. *Why:* the original text is the
  legal record; translations in the DB are N× cost and instantly stale.
- **Positions vs roles (§5):** RBAC roles are a small fixed technical set;
  what a person *does* lives in professions/skills/positions/engagement
  contexts. *Why:* no person fits in a category — mixing the layers causes
  the recurring "what role am I?" confusion.

## 4. MIGRATION RULES

- **GREEN (auto-merge):** additive or guarded migrations that pass the
  `migration-safety` CI check.
- **RED (hard human gate):** unguarded `DROP`, RLS-loosening
  (`using (true)`, grants to `anon`/`public`), or auth-core changes → open the
  PR as **draft** with the `needs-human-gate` label and post the exact SQL +
  RLS diff in the description. *Why:* these are the irreversible class — a
  bad merge here can't be fixed by a follow-up PR.
- **Prod apply:** only via Supabase MCP `apply_migration` after approval —
  never `supabase db push` (repo filenames don't match the ledger; a push
  re-runs applied migrations).
- **Naming (§16):** `YYYYMMDDHHMMSS_snake_case.sql` (14-digit UTC timestamp).
  Never rename an applied migration. Every migration ships a rollback path.
- **Repo-specific:** every new migration bumps the dual baseline — the
  `product-readiness` SPRINT_BASELINE and the `ops-bridge-migration` count
  assertion — or CI goes red.

## 5. VERIFICATION RULE — exercise the app, don't just read the code

Real users reported visible defects that code-reading verification missed.
Therefore, for **any user-visible fix or feature**:

1. Run the **webapp-testing** skill: a real browser pass over the changed
   flow, end-to-end, in **both light and dark theme**. A fix you have not
   watched working in a browser is a hypothesis, not a fix.
2. Run **code-review** (the built-in `/code-review`, plus the project
   checklist in `.claude/skills/code-review/SKILL.md`) before merge.

*Why:* the platform's promise is reliability for people with no time to
double-check us — the verification burden belongs on us, before merge, in a
real browser.

## 6. FRONTEND CONSTRAINTS

Design-quality skills (frontend-design, baseline-ui, fixing-accessibility,
fixing-motion-performance, fixing-metadata) are for **creative quality within
the existing token system** — they never license new palettes or font systems.

Binding tokens (origin PR #162, current lock in code):

- **Typography:** `apps/web/tokens/typography.ts` is the single source —
  components reference `var(--font-display|sans|mono)` CSS vars, never a
  typeface name. Current owner lock: Bricolage Grotesque (display), Inter
  (body), JetBrains Mono (numbers/labels) — wired in
  `app/[locale]/layout.tsx`.
- **Color:** `rgb(var(--c-*))` channel tokens in `apps/web/app/globals.css`;
  **dark is the default theme**; light is the override. No raw hex/rgb in
  components.
- Enforced by `apps/web/lib/guards/design-tokens.test.ts`.

*Why:* swapping a font or palette must stay a one-file token swap; the moment
a component names a typeface or hex value, the design system starts to fork.

## 7. MAKE VIOLATIONS PERMANENT-PROOF

Guards have teeth only as `apps/web/lib/guards/*.test.ts` (CI runs them via
`pnpm -F web test`). When you catch a violation class that could recur —
a forbidden term, a parallel-structure pattern, a token bypass — encode it as
a vitest guard in the same PR. A rule that lives only in prose dies at the
next refactor; a rule that lives in CI survives every tooling change. That is
the whole point of this skill.
