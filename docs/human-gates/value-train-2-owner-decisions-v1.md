# Value Train 2 — owner decisions package (v1)

**Date:** 2026-08-23 · **Branch:** `claude/labourmarket-audit-consolidate-dbqwzt`
**Status:** every item below is OWNER-GATED. Nothing here was applied or
activated. The GREEN wagons of the train merged and (where GREEN apply
conditions held) were applied with recorded verification — see the checkpoint
(`docs/handoffs/value-train-2-checkpoint-2026-08-23.md`) for that log. This
document is the queue of decisions only the owner can take.

Train 1's package (`value-train-1-owner-decisions-v1.md`, D1–D6) remains
**open in full** — none of D1–D6 was decided during this train, and nothing
in this train crossed them.

---

## D7 — Weekly digest EMAIL channel (notification_preferences apply + dispatch)

The weekly personal digest is LIVE in-app (v6 applied; materialized on a
dashboard visit, exactly-once per ISO week, pointer-only per §19(d)). It
reaches only workers who visit. Reaching ABSENT workers — including the
"no journal evidence this week" reminder, the loop's highest-value case —
needs email, and email needs consent machinery first.

**Authored, unapplied, in this train:**
`supabase/migrations/20260823160000_notification_preferences_v1.sql`
(+ paired rollback) — per-(profile, notification_type slug, channel) consent
rows, own-row RLS, **email default OFF (opt-in, consent-first)**, in-app
default unchanged (on). RED by route (table grants, fail-closed classifier);
deliberately NOT `-- @human-gate-approved`.

**DECIDED — OWNER APPROVED 2026-08-23** ("OWNER CONTINUATION — TRAIN 2+
CLOSE THE OPEN VALUE LOOP" §1): in-app product notifications may run on
privacy-safe defaults when directly product-related; email/push/marketing
require explicit per-type consent (no global agree-all switch; marketing
never silently opt-in); semantic categories (essential/product
intelligence/reminders/opportunities/marketing) live at the §10 slug layer,
mapped app-side when the settings UI ships; preference changes deterministic
and auditable. The drafted opt-in email model CONFORMS and stands. Migration
merged + applied via MCP per §2 of the same instruction.

**Original decision points (for the record):**
1. APPROVE / AMEND the consent model — notably: email **opt-in** (drafted,
   cautious) vs opt-out-with-unsubscribe (reaches more people, weaker
   consent posture; lawful basis review is the owner's call).
2. APPROVE applying the migration (via MCP `apply_migration` after merge).
3. STILL OPEN: the email dispatch design for a follow-up wagon: reuse the ONE
   existing transactional sender (`lib/email/transactional.ts`,
   resend|postmark — today invitation-scoped env names `INVITE_EMAIL_*`),
   stateless signed unsubscribe links (no token column), delivery-state
   ledger modelled on `invitations.delivery_status`, scheduler on the
   existing GitHub-Actions cron pattern (kill-switched, inert until armed).
   No second sender, no second scheduler paradigm.

## D8 — Gemini provider profile: `costClass` vs registry `freeTier` mismatch

`AI_PROVIDER_PROFILES` says gemini `costClass: "paid"`; the model registry
marks its models `freeTier: true` with the data-restriction note ("free tier
documents that content may be used to improve vendor products"). The
free-tier privacy cap (`MAX_GRANTABLE_FOR_FREE_TIER`) keys off `costClass`,
so with a free-tier Gemini key plus a future egress grant, the cap would NOT
bind. Zero live exposure today (the egress-grant table is empty).

Which is correct depends on the actual billing arrangement, which is an
owner fact, not derivable in code.

**Decision:** before ANY Gemini activation, either (a) confirm the paid
arrangement (profile stays `paid`, registry `freeTier` note stays as a
warning), or (b) reclassify the profile `free_tier` so the privacy cap
binds. No code was changed speculatively (cautious-direction rule).

## D9 — Telegram owner-progress channel from managed sessions

`scripts/telegram-report.mjs` exists (owner-internal, env-credentialed,
never hardcoded). The managed Claude Code environment carries **no**
`LMAI_TELEGRAM_BOT_TOKEN` / `LMAI_TELEGRAM_CHAT_ID` (verified
present/absent only), so TELEGRAM_STATUS = UNAVAILABLE for this train and
progress reporting stayed in-session + PR descriptions.

**Decision:** add the two variables as environment secrets for the managed
environment (Claude Code → environment configuration) if Telegram progress
reports from these sessions are wanted. No code change needed.

---

*No matching/scoring/verification mechanics and no private capability
intelligence — decisions and reversals only (AGENTS.md → public
communication; doctrine §18 disclosure).*
