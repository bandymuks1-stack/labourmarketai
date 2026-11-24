# Owner Sprint v2 — Core Product Completion (plan of record)

Date: 2026-07-14. Base: main `4f06d085` (after #750 latency, #751 UX Recovery v1).
Branch: `feat/cc/owner-sprint-v2-core-completion`.

Owner command (verbatim scope, translated to slices) with doctrine bindings.

## Slices and order

| # | Slice | Priority | Doctrine bindings | PR class |
|---|---|---|---|---|
| S7 | AI Provider Router — one shared routing layer, adapters (OpenAI, Anthropic, Gemini, Grok, DeepL), routing by task/language/privacy/quality/latency/cost/fallback/quota, cheapest-sufficient default, full per-action logging (task, provider, model, version, input source, output, est. cost, real cost, fallback, approval state) | P0 | §7.1 (append-only AI extraction logs) | GREEN |
| S2 | Full CV lifecycle: PDF/DOCX import (+future OCR seam) with confirm-before-persist, section-agnostic create flow, export (standard/tailored/printable, template seam), single canonical truth model shared by CV/Profile/Journal/Projects/Skills | P0 | §7.1 confirm flow, §10 slug registries for section/item types, §16 migrations | GREEN code / RED if RLS-sensitive |
| S3 | Daily Work Journal proof engine: quick note, structured form, spreadsheet mode, voice, photo, profession-template seam; AI suggestions (skills/experience/achievements/projects) only after user confirmation; journal→CV→matching loop | P0 | §7.1, §4 default-closed, §15 | GREEN |
| S4 | Job recommendation engine: matching jobs with why-matched (§19 form: "atitinka X% šio darbo įgūdžių: N iš M, iš jų K patvirtinti"), salary comparison, missing skills, new opportunities; surfaced on dashboard, notifications, map, profile, journal context; quality over spam | P0 | §19 fit-not-rating (no global score, basis always shown, confirmed vs declared split) | GREEN |
| S1 | Personal workspace UX audit + cleanup: every worker screen; remove noise/oversized layouts/long lists/duplication; consistent terminology | P0 | §18 honest empty states | GREEN |
| S9–S11 | Pricing & payments: Persons FREE/AI PLUS 9.99/VIP MEDIA 24.99; Companies FREE/PROJECT LAUNCH OFFER 99 €/mo (unlimited ads + internal promotion, visible until 2026-10-31, auto-remembered 15% first-annual discount eligibility if activated before 2027-01-01); Agencies START 99.99/GROWTH 249.99/SCALE 499.99; Stripe products, billing logic, renewals, limits, credits, usage tracking, AI cost tracking; ad-pricing architecture (single, AI-promoted, premium, international, packages, agency, extra promotion); cost engine (AI, storage, emails, bandwidth, DB, payments, media, voice, video) | P0 | Billing = RED class → draft PR + needs-human-gate; no live Stripe keys (owner gate) | RED |
| S12 | Branding: "Created by Rexora" + https://aiprocessautomation.eu everywhere (footer, public, dashboard, about, mobile) | P0 quick win | — | GREEN |
| S5 | Company architecture: multi-company switching, company vs personal separation, scalable admin, decision-first dashboards, server-side dashboard preferences | P1 | §4, §10 | GREEN/RED per migration |
| S6 | Market Map: three spatial entities (person / company operating territory / project location), never mixed; discoverability without direct contact bypass | P1 | §20 privacy, §4 | GREEN |
| S8 | Crawl4AI adapter — lives in Agentai OS repo, NOT here; controlled public-source adapter (allowed-source registry, robots compliance, attribution, timestamps, audit trail, rate limits) | P1 | Agentai repo safety rules | separate repo |
| S13 | Architecture rule: everything connects into ONE Labour Market OS — one dashboard, one profile, one CV, one AI router, one audit trail, one canonical truth model | cross-cutting | §10, §17 | — |

## Execution notes

- Every migration: `YYYYMMDDHHMMSS_snake_case.sql`, `-- DOWN` rollback, additive-only; production apply stays a manual owner step (Supabase MCP after approval).
- No demo content, no fake controls (§18). Missing runtime pieces (e.g. OCR, video providers) ship as honest seams marked RUOŠIAMA, not fake buttons.
- Owner gates collected in the final report: Stripe keys + billing activation, prod migration applies, any live sending.
