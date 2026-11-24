# TASK-PR9: Docs-Only Architecture & Handoff Suite

**Branch:** `feat/cc/pr9-universal-arch-docs`
**GitHub PR:** #13 (conceptually "PR #9" in the universal-architecture sequence)
**Type:** Docs-only PR. **Zero code changes.**
**Strategic compass:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` (committed verbatim)

> This file is the in-repo record of PR #9. The canonical deliverables it tracks
> are standalone files (see "Deliverables" below); this record is not a re-paste
> of them. The strategic doc is the source of truth.

---

## Context

DI approved a strategic direction correction: labourmarket.ai must become a
universal multi-profession labour market OS, not a single-profession MVP. PR #9
commits the architecture compass and prepares execution handoffs for PR #10–#13.

---

## 🚫 HARD GUARDRAIL — DOCS-ONLY (binding)

This PR is **docs-only**. Only the following paths may appear in the diff:

**Allowed (allowlist — nothing else):**

| Path | Note |
|---|---|
| `docs/**` | All architecture, handoff, and decision docs |
| `AGENTS.md` | Agent operating contract |
| `CLAUDE.md` | Mirror of AGENTS.md (kept in sync) |
| `TASKS.md` | Persistent backlog |

**Blocked (must NOT appear in the diff — any occurrence = revert before merge):**

| Path | Reason |
|---|---|
| `apps/**` | No application code (frontend/backend) |
| `packages/**` | No package code |
| `supabase/**` | No migrations, no Supabase config |
| `prisma/**` | No schema changes |
| `scripts/**` | No build/CI scripts |
| `.github/**` | No CI/CD changes |
| root `*.json` config (`package.json`, `tsconfig*.json`, `turbo.json`, `nx.json`, …) | No config changes |
| lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`) | No dependency changes |
| `.env*` | No environment variables |
| `next.config.*` | No framework config |
| `Dockerfile`, `docker-compose.*`, other infra files | No infra |

---

## ✅ Verification — substantive scope check (binding)

Use **`git diff --name-only`** (NOT `git diff --stat` — `--stat` left-pads and
truncates filenames, so anchored greps miss and report false violations):

```bash
# `docs/` is a PREFIX (no trailing $); the three root files are full-line ($).
# Do NOT write `^(docs/|AGENTS\.md|...)$` — the trailing $ after the group makes
# `docs/` match only a literal line "docs/", so every docs/foo path false-flags.
git diff --name-only origin/main \
  | grep -vE "^docs/|^AGENTS\.md$|^CLAUDE\.md$|^TASKS\.md$"
```

**Expected output: empty.** If any file appears, STOP and report the violation —
do not merge until reverted.

Forbidden-path cross-check (also must be empty):

```bash
git diff --name-only origin/main \
  | grep -E "^(apps/|packages/|supabase/|prisma/|scripts/|\.github/|package\.json|pnpm-lock\.yaml|.*\.env|next\.config|turbo\.json|Dockerfile|docker-compose)"
```

---

## Deliverables (canonical files)

| File | Purpose |
|---|---|
| `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` | Full strategic compass (committed verbatim, unmodified) |
| `docs/ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md` | 1-page summary |
| `docs/handoffs/TASK-PR10-UNIVERSAL-SCHEMA.md` | PR #10 skeleton (RLS default-deny + SECURITY DEFINER RPCs + audit_log) |
| `docs/handoffs/TASK-PR11-UNIVERSAL-JOURNAL-UI.md` | PR #11 skeleton (calls PR #10 RPCs; no direct writes) |
| `docs/handoffs/TASK-PR12-LIVING-CV-HUB.md` | PR #12 skeleton (RPC confirmation + transactional audit) |
| `docs/handoffs/TASK-PR13-DASHBOARD-REDESIGN.md` | PR #13 skeleton (labeled placeholders; real-data traceability) |
| `AGENTS.md`, `CLAUDE.md` | "Universal Architecture Migration" section (synced) |
| `TASKS.md` | PR #10–#13 sequence + proposed doctrine backlog |

> The PR #10–#13 skeletons are starting templates. The architect replaces each
> with a full spec before that PR executes. They have been corrected per the
> security/architecture review (RLS, RPC, audit, placeholder rules).

---

## Doctrine alignment

Verified against the actual `docs/PLATFORM_DOCTRINE.md` in this repo:

| Section | Actual heading (verified) | Status |
|---|---|---|
| §2.4 | **Locale set (binding)** — 10 locales, EN source + 9 markets | Compliant (referenced in PR #11+ skeletons) |
| §3.1 / §3.4 | Append-only by default / Audit log | Compliant (`skill_confirmation_history` append-only; `audit_log` in PR #10 skeleton) |
| §4 | Default-closed visibility | Compliant (entry visibility CLOSED by default; explicit grants) |
| §5 / §5.5 | Positions, roles, and engagements | Compliant (profession context ≠ RBAC role; entries pin to engagement context, never directly to org) |
| §7 / §7.1 | AI-never-lies / AI as translator | Compliant (no auto-confirmation; AI never persists) |
| §10 | Lego architecture | Compliant (all extensible taxonomy spec'd as slug + JSON) |

No conflicts. No silent overrides.

---

## Naming

Active project naming is **labourmarket.ai** / **labourmarketai**. "LABMA OS"
appears only as a historical / product-family reference. No new task files for
this repo use the LABMA name.

---

## Status

- Do **not** merge or mark ready until DI / reviewer approves.
- After merge: architect produces the full PR #10 spec; Claude Code starts schema work.
