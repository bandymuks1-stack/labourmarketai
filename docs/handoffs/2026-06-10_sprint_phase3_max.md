# SPRINT PHASE3-MAX — handoff spec (binding)

Date: 2026-06-10
Owner: DI (founder, non-technical)
Executor: Claude Code
Repo: C:\Users\Mano\Documents\labourmarketai
Spec home: docs/handoffs/2026-06-10_sprint_phase3_max.md

Session reading order (mandatory before work):
docs/PROJECT_VISION.md → AGENTS.md → CLAUDE.md → TASKS.md → docs/PLATFORM_DOCTRINE.md → docs/PROJECT_ROADMAP.md → docs/PHASE3_first_customer_plan.md

---

## GOAL (destination, not ceiling)

labourmarket.ai is a universal labour market operating system for the whole European region — 9 equal-priority launch markets (LT, LV, EE, NL, DE, DK, NO, SE, PL), construction as the first vertical only. The operating company is **Labour Market AI sp. z o.o., registered in Poland**; the product serves all of Europe. The platform's spine is the human: one person, one account, all roles simultaneously (worker/company/agency/customer). The trust chain — declared skills → daily Work Journal entries → manager-confirmed Work Proofs → portable trust — is already live in production.

This sprint's destination: **a real first customer can travel the FULL circle inside the product with no manual brokering** — submit a structured request, see matching candidates, open a conversation, run the work through a project, confirm journal entries, and watch trust accumulate on the human. In parallel: prepare the AI-assistance layer as honest scaffolding (zero external API calls) and a complete LinkedIn launch kit so the founder can start public promotion the same day.

Build generously toward this destination; the guardrails below are the only hard limits.

---

## WORKSTREAM A — Matching MVP
Branch: `feat/cc/matching-mvp`

- Match `customer_requests` ↔ available workers / agency pools by profession, skills (verified weighted higher), availability, country/city.
- `customer_requests` is the SOLE structured demand intake. No new parallel demand or supply tables. `projects.organization_id` stays canonical.
- Prefer computing matches from existing canonical tables (views/RPCs). If any new structure is truly needed: **additive-only** migration, file named `YYYYMMDDHHMMSS_snake_case.sql`, committed but **NOT applied** — prod apply happens manually via Supabase MCP `apply_migration` (project `gorgitwvdzxbnaxhrsrw`) by the owner side. Never `supabase db push`. RLS default-closed per doctrine §4.
- UI: match cards (who fits what, **why** — show the evidence: verified skills, document readiness), filters, and a clear "start conversation" action. Use design tokens, dark/light themes, no native OS controls that break theming (white-popup class of bugs).
- Match explanations follow doctrine §7 AI-never-lies: only claims derivable from real data; no invented scores presented as facts.

## WORKSTREAM B — Conversations UI
Branch: `feat/cc/conversations-ui`

- Build the thread UI on the EXISTING canonical messaging model: `conversations` / `conversation_participants` / `conversation_messages`. No parallel messaging tables.
- Entry points: from a match card and from a customer_request.
- Messages store `original_text` + `language` per doctrine §2; render viewer-language-ready. The translation pipeline may be stubbed behind a clean interface, clearly marked in code. Never show fake-translated content as real — if no translation is available, show the original with a language badge.
- Keep it minimal and real: send, receive, participant list, unread state. No read receipts / typing indicators unless trivial.

## WORKSTREAM C — First-client path polish
Branch: `feat/cc/first-client-path`

- Walk and fix the full path: request → match → conversation → project → journal entry → manager confirm → Work Proof → trust visible on the person's profile.
- Trust/reputation must be VISIBLE: a simple, honest trust block on the worker profile (verified skills count, confirmed proofs count, history) — data-derived only.
- Fix UX breaks along this path: theming, mobile usability, empty states with honest copy.
- **DO NOT build the TASK 07 living-arena manager UI** (spaceship/cockpit, super-league, FIFA-card aesthetic) — explicitly reserved for a separate owner-issued task after visual lock. Only minimal functional manager surfaces strictly needed to close the loop (the confirm flow already exists — reuse it).

## WORKSTREAM D — AI readiness WITHOUT API
Branch: `feat/cc/ai-readiness-no-api`

- Create `docs/ai/AI_READINESS.md`: architecture for the M4+ AI layer (assist surfaces, agent types, data contracts), grounded in doctrine §7 — every AI claim must trace to real data or be labeled as suggestion.
- Create prompt/spec templates under `docs/ai/prompts/` for future agents (explainer, matching-explainer, document-checklist helper) — files only, no runtime LLM calls.
- UI: an "AI pagalba" surface behind a feature flag, DEFAULT OFF. While off: nothing AI-branded visible.
- Optional: deterministic (rule-based, non-LLM) helpers — e.g. "missing documents checklist" computed from real data — may ship visible because they are honest and API-free, but never label deterministic logic as "AI".
- HARD: no API keys, no env/secrets changes, no external AI calls, no new billing.

## WORKSTREAM E — LinkedIn launch kit
Branch: `feat/cc/linkedin-growth-workflow-labourmarketai`

Official profile: https://www.linkedin.com/in/labour-marketai-3b56a0394/

Do not scrape LinkedIn. Do not bypass login/captcha/rate limits. **Draft-only by default**: no automatic publishing, no automatic messaging — publish/send only after explicit owner approval of the exact post / exact recipient + exact message.

Create:
- `docs/marketing/linkedin-growth-workflow.md` — agent workflow: research → content → design → outreach-prepare → reporting, with an owner review gate before anything goes live
- `docs/marketing/linkedin-profile-optimization.md` — headline, about, banner direction, featured links, CTA, comment/reply style, safe claim rules, first 10 post themes
- `docs/marketing/linkedin-30-day-content-calendar.md` — themes: workers; construction companies; staffing/recruitment agencies as core pillar; labour-market transparency; documents/compliance; worker readiness/player card; marketplace vision; live labour market visualization; trust/evidence/work journal; company demand/customer requests; agency worker pools; human-first AI assistance
- `docs/marketing/linkedin-first-posts.md` — first 3 launch posts, including the founder draft below, refined
- `docs/marketing/linkedin-safe-claims-and-publish-gates.md`
- `runtime/marketing/linkedin/owner-review/README.md` — only if `runtime/` exists and is gitignored

Profile baseline to refine (keep voice, improve precision):
- Headline: `Labourmarket.ai | Workforce marketplace for verified skills, documents and real labour demand — built for Europe`
- About must state: human-first labour market operating system; connects workers, companies and staffing agencies; first vertical is construction but the platform is universal; **built for the whole European region** with launch focus on LT, LV, EE, NL, DE, DK, NO, SE, PL; status: early product build. Legal footer line: `Labour Market AI sp. z o.o. — registered in Poland, building for the European labour market.`
- First launch post: refine the founder's draft — chaotic labour market → workers can't prove readiness → companies can't see who's available, documented and suitable → agencies need structure, trust and visibility → human-first labour market OS → construction first, Europe-wide vision → honest status, simple goal: who is ready, what is missing, who needs people, what should happen next.

Positioning rules (binding):
- Public brand is **Labourmarket.ai** (never LABMA).
- Never construction-only — construction is the first vertical, not the whole product.
- Recruitment/staffing/agencies are a core pillar, not an enemy.
- Poland is the legal seat, **Europe is the market** — say both; never imply Poland-only or LT-only.

Honesty gates (binding):
- No fake followers / clients / workers / metrics / verified claims. No fake "live marketplace".
- Never the word "demo" in product or marketing copy.
- Allowed status phrases: "early product build", "in progress", "not live yet", "preparing first customers".

---

## EXECUTION & MERGE

- Separate PRs per workstream, conventional commits (`feat:` / `docs:`).
- GREEN tier (UI/app/docs/tests + additive migrations passing CI) → auto-merge when `quality` + `migration-safety` checks are green.
- Anything touching RLS, DROP, auth-core → draft PR + human gate (avoid entirely if possible).
- Validation per PR: typecheck, lint, tests, build, existing guards; add a no-demo-word claim check for marketing docs if cheap.
- Hard prohibitions: no env/secrets, no DNS, no billing/payments, no LinkedIn auto-publish/auto-send, no old repo (`labourmarket.ai/lt`) touch, no parallel tables, no prod migration application from CLI.
- Reporting: if Telegram reporting tooling ALREADY EXISTS in this repo, use it with format `STATUS / Repo / Branch / Result / Files / Next`. If it does not exist, **do not invent or wire a new integration** — write the same status into each PR description and a final summary comment. If publishing is blocked only by LinkedIn login: report `BLOCKED_FOR_PUBLISH_ONLY — drafts ready, publishing requires owner action.`
- Diagnose and fix failures autonomously; do not delegate debugging to the owner.

## FINAL REPORT (single summary)

- PR links + SHAs, merge status, files created
- Exact texts ready for the owner to paste into LinkedIn
- Any drafted-but-unapplied migrations awaiting MCP apply
- Confirmation list: DB push = NO, env/secrets = NO, billing = NO, LinkedIn auto-send = NO, old repo touch = NO, TASK 07 arena untouched = YES
