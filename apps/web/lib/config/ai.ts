/**
 * AI assistance layer — master flag.
 *
 * While this is `false`, nothing AI-branded is visible anywhere in the
 * product: no AI badges, no AI copy, no AI routes, no AI surfaces. There is
 * deliberately NO UI behind this flag in this slice — the first AI surface
 * ships with the flag-flip slice AFTER the owner decides provider, budget
 * and key handling (API keys are an owner-gated hard blocker; no external
 * AI calls exist or may be added until then).
 *
 * Architecture + rules: docs/ai/AI_READINESS.md, grounded in
 * docs/PLATFORM_DOCTRINE.md §7 (AI-never-lies) and §7.1 (AI as translator,
 * not author). Prompt templates (TEMPLATE ONLY, no runtime integration):
 * docs/ai/prompts/.
 *
 * NOTE: the deterministic documents-checklist helper already exists
 * separately (S3, gated PR #288). It is rule-based, API-free and is
 * deliberately NOT labeled AI — it neither needs nor waits for this flag.
 * Never label deterministic logic as "AI" (AI_READINESS.md §6).
 *
 * Guarded by apps/web/lib/guards/ai-readiness.test.ts.
 */
export const AI_ASSIST_ENABLED = false;

/**
 * Per-use-case assist flags — ALL default to `false` and stay false until the
 * owner flips them in a future activation slice. They are gated by the master
 * `AI_ASSIST_ENABLED` above: a use case is live only when BOTH the master flag
 * and its own flag are true (and a real provider has been wired — none exists
 * today). Adding a flag here NEVER enables anything by itself.
 *
 * Typed boundary that consumes these: apps/web/lib/ai/ (provider + noop + types
 * + schemas). The default provider is the inert no-op; no SDK, no network, no
 * API key exists in this repo. See docs/audits/ai-readiness.md.
 */
export const AI_ASSIST_FLAGS = {
  demand_draft: false,
  estimate_clarify: false,
  worker_profile_draft: false,
} as const;
