# Internal LLM Agents v1 — Final Report

> Closeout of the Internal LLM Agents v1 sprint. A real, production-safe internal
> AI layer: an env-gated provider adapter, a prompt registry source-of-truth,
> strict per-agent output schemas, an append-only audit log, and **all eleven
> agents** — every one a *suggestion* layer that never verifies, persists,
> prices, sends, auto-publishes, invents, or fakes a score. The truth stays in
> the database. **No keys committed; no live LLM call in CI; inert without an
> owner-provided key.** Companion: [`../ai/INTERNAL_LLM_AGENTS_V1.md`](../ai/INTERNAL_LLM_AGENTS_V1.md).

## 1. PR numbers + merge SHAs

| PR | Title | # | State | SHA |
|----|-------|---|-------|-----|
| 1 | architecture audit + safety doctrine | #376 | merged | (squash) |
| 2 | LLM provider adapter + config + guards | #377 | merged | `816ac68` |
| 3 | prompt registry + output schemas + eval harness | #378 | merged | `b564e30` |
| 4 | AI run audit log + suggestion store (migration) | #379 | **RED draft — owner applies** | — |
| 5 | Work Journal + Skill Evidence agents | #380 | merged | `0350174` |
| 6–9 | remaining 7 agents (all 11 registered) | #381 | merged | `fc6e616` |
| 11 | content safety guards + this report | (this) | — | — |

## 2. LLM agents implemented (11 / 11)

worker_profile · work_journal · skill_evidence · document_assistant · company_need
· country_readiness · matching_explanation · booking_risk · admin_risk ·
support_onboarding · translation_copy. Each = a registry entry (versioned system
prompt + strict input schema + strict output **envelope** + safety rules + allowed
evidence sources + blocked claims) and is eval-proven through the mock provider.

## 3. Provider status

`lib/ai/runtime/config-core.ts` resolves `disabled | mock | live`. **OFF by
default.** `mock` is keyless/network-free and drives every test. `live` activates
ONLY with `AI_PROVIDER_MODE=live` + a known provider + a **non-empty key** (a
missing key → `disabled`, never silently live). The key VALUE is never carried on
the config. Cost/timeout/retry/daily-budget guards are clamped.

## 4. Real provider vs mock/disabled

The **real Anthropic adapter is wired** (`lib/ai/runtime/providers/anthropic.ts`,
the one allowlisted SDK importer, `claude-opus-4-8`) but **inert** — it makes no
call without `AI_PROVIDER_MODE=live` + `AI_API_KEY` in server env. Today the
runtime runs in **disabled** (prod, no env) / **mock** (tests). No live LLM call
is made anywhere in CI.

## 5. Prompt registry status

`lib/ai/registry/` is the single source of truth — all 11 prompts live there, not
in components/routes (enforced by `prompt-registry-required`, which asserts all 11
are registered and well-formed). `getPromptEntry` throws for an unregistered agent.

## 6. AI audit log status

`ai_runs` (append-only) + `ai_suggestions` (draft→accepted/rejected/edited/expired)
ship in PR #379 (RED, owner-applied). The writer (`lib/ai/audit/`) stores **only
hashes** (sha256 hex) of input/output — never raw content, never a secret — and
**degrades on 42P01** so a missing migration never blocks a run.

## 7. Schema / migration status

Every agent output is validated by a strict zod **envelope** (suggestion:true,
confidence low/med/high, evidence_refs, missing_information, needs_human_review,
blocked_claims; `.strict()` rejects record-like fields). Migration
`20260614120000_ai_runs_suggestions` is additive + reversible (RED, owner-applied
via Supabase MCP). Dual baseline bumped 80 → 81.

## 8. Worker assistant status

`worker_profile` (draft profile from own text — never verified, never invented
experience) + `work_journal` (structure freeform journal — never "done well", no
photo-derived facts) + `skill_evidence` (candidate levels; the enum structurally
excludes a confirmed status). All draft, human-confirmed.

## 9. Company assistant status

`company_need` (normalized draft request — never invents pay, never "legally
ready", never auto-publishes) + `matching_explanation` (fit/gaps/blockers — never
hides legal/doc blockers, no score, no private-doc leak).

## 10. Country / document assistant status

`country_readiness` (output **invalid without ≥1 evidence_ref** — no unsourced
answer; never a legal guarantee) + `document_assistant` (missing/expiring/
needs-verification from metadata only — never reads file contents, never "real",
never verifies).

## 11. Matching / booking assistant status

`matching_explanation` (above) + `booking_risk` (conflicts / missing docs /
`start_readiness` ready|not_ready|unknown — advises only, never bypasses conflict
logic, never "safe to start" when not ready).

## 12. Admin / support assistant status

`admin_risk` (prioritized review queue with severity — never auto-rejects/bans, no
discriminatory or legal conclusions) + `support_onboarding` (top next action —
never suggests paying when disabled, never live checkout in test mode, never
promises work/earnings) + `translation_copy` (localized + plain copy — never
changes meaning, never drops disclaimers, never renders a guarantee as a guarantee).

## 13. Tests / guards / build

typecheck + lint + build green every PR; ~3818 tests. Safety guards (build-failing):
`ai-readiness` (SDK allowed in one adapter only), `no-provider-secret-leak`,
`no-direct-llm-client-call`, `ai-output-schema-required`, `prompt-registry-required`,
and `ai-content-safety` (the six doctrine content guards: no-ai-verifies-skills /
-documents, no-ai-legal-guarantee, no-unsourced-country-answer, no-private-document-
leak, no-ai-live-payment-claim). Eval fixtures cover LT/RU/EN with safety negatives
(hallucinated verified, fabricated numeric confidence, unsourced country, excluded
confirmed level, out-of-enum booking/admin values) — all rejected.

## 14. Production route smoke

No new public route ships in this sprint (the runtime is a server-side library; UI
surfaces are a separate, owner-gated slice — see §16). The existing app builds and
deploys unchanged; the AI runtime resolves to `disabled` in prod (no env).

## 15. What was NOT touched

No committed keys; no live payment keys; no DNS; no Vercel production env/secrets;
LLM never used as a verification / legal / payment authority; no AI auto-publish;
no AI mutation of document verification or country official status; no private-
document leak; no fake scores; no work/earnings guarantees; no destructive
migration; no RLS loosening; no legacy project terms.

## 16. Env required to activate a real provider

Owner sets in **Vercel env / `.env.local` (never committed)**:
`AI_PROVIDER_MODE=live`, `AI_PROVIDER=anthropic`, `AI_API_KEY=…` (and optionally
`AI_MODEL`, `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_OUTPUT_TOKENS`,
`AI_DAILY_RUN_BUDGET`). Apply PR #379's migration via Supabase MCP so audit rows
persist. Until then the system runs honestly in `disabled`/`mock`.

## 17. What still cannot be AI-decided automatically

Skill / document / identity **verification**; **legal** work-eligibility
conclusions; **payment** authority; **booking** confirmation (the RPCs enforce
conflicts); **publishing** a profile or company need. AI only suggests; a human or
the existing confirmed write path decides. Remaining build-out (owner-gated): the
**UI surfaces** that render these suggestions (worker/company/admin) with explicit
"AI suggestion / review before saving / not verified" labels and no auto-confirm —
the runtime + agents are ready for them.
