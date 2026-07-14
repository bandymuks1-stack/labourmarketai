import { z } from "zod";

/**
 * Validated environment (principle: validate env at boot).
 *
 * The Supabase URL is public and defaults to the project's literal value so
 * local/CI builds pass without secrets. The anon/service/DB secrets are
 * optional at build time but REQUIRED in production — they are provided via
 * Vercel environment variables and `.env.local`, never committed.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .default("https://gorgitwvdzxbnaxhrsrw.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_DB_PASSWORD: z.string().min(1).optional(),
  NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS: z
    .enum(["true", "false"])
    .default("true"),

  // ── Billing (Stripe TEST-mode only; live is hard-blocked in config) ────────
  // All default to the OFF state. Payments activate ONLY when the owner injects
  // a valid test config (sk_test_ + whsec_) via Vercel env / .env.local —
  // never committed. The safety logic lives in lib/billing/config.ts.
  PAYMENTS_ENABLED: z.enum(["true", "false"]).default("false"),
  BILLING_PROVIDER: z.enum(["stripe", "none"]).default("none"),
  STRIPE_MODE: z.enum(["test", "live"]).default("test"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  // TEST price ids (price_…) per paid plan — owner sets these in Stripe test.
  STRIPE_PRICE_WORKER_PLUS: z.string().optional(),
  STRIPE_PRICE_COMPANY_PILOT: z.string().optional(),
  STRIPE_PRICE_AGENCY_PILOT: z.string().optional(),
  // ── Internal LLM Agents (disabled by default; mock for tests/dev) ──────────
  // The runtime is `disabled` unless AI_PROVIDER_MODE is `mock` or `live`.
  // `live` additionally requires AI_API_KEY (owner-set in Vercel env / .env.local,
  // NEVER committed, NEVER in the client). Safety logic: lib/ai/runtime/config-core.ts.
  AI_PROVIDER_MODE: z.enum(["disabled", "mock", "live"]).default("disabled"),
  AI_PROVIDER: z
    .enum(["anthropic", "openai", "gemini", "xai"])
    .default("anthropic"),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_REQUEST_TIMEOUT_MS: z.string().optional(),
  AI_MAX_RETRIES: z.string().optional(),
  AI_MAX_OUTPUT_TOKENS: z.string().optional(),
  AI_DAILY_RUN_BUDGET: z.string().optional(),
  // ── AI Router v1 — per-provider adapters (ALL OFF by default) ──────────────
  // Each non-anthropic adapter is DOUBLE gated: its enable flag must be
  // "true" AND its key must be present, else the adapter returns the typed
  // disabled sentinel (lib/ai/runtime/providers/*). Keys are server env only
  // (Vercel env / .env.local — NEVER committed, NEVER NEXT_PUBLIC).
  AI_OPENAI_ENABLED: z.enum(["true", "false"]).default("false"),
  OPENAI_API_KEY: z.string().optional(),
  AI_GEMINI_ENABLED: z.enum(["true", "false"]).default("false"),
  GEMINI_API_KEY: z.string().optional(),
  AI_XAI_ENABLED: z.enum(["true", "false"]).default("false"),
  XAI_API_KEY: z.string().optional(),
  // DeepL is a SECONDARY provider (translate_message languageRouting only) —
  // it is never a primary AI_PROVIDER value.
  AI_DEEPL_ENABLED: z.enum(["true", "false"]).default("false"),
  DEEPL_API_KEY: z.string().optional(),

  // ── Owner Telegram alerts (server-only; demand-signal notifications) ───────
  // Best-effort owner alert on a PERSISTED /company-need intake. OFF by default:
  // the alert is a no-op unless the owner sets the bot token + chat id (Vercel
  // env / .env.local — NEVER committed, NEVER NEXT_PUBLIC) AND flips
  // OWNER_TELEGRAM_ALERTS_ENABLED=true. Helper:
  // lib/notifications/telegram-owner-alerts.ts. Never breaks the public submit.
  OWNER_TELEGRAM_ALERTS_ENABLED: z.enum(["true", "false"]).default("false"),
  OWNER_TELEGRAM_BOT_TOKEN: z.string().optional(),
  OWNER_TELEGRAM_CHAT_ID: z.string().optional(),

  // ── Agentai OS owner-alert bridge (PREFERRED over standalone Telegram) ─────
  // When enabled, a persisted /company-need intake POSTs a JSON event to the
  // owner's Agentai OS alert endpoint (shared-secret bearer token) and Agentai
  // OS sends it through its existing owner Telegram channel — so LabourMarket.ai
  // needs NO Telegram bot of its own. All server-only, never NEXT_PUBLIC. OFF by
  // default; the alert is a no-op unless the endpoint + token are set and
  // enabled. Requires the owner to deploy a public HTTPS Agentai OS bridge
  // (Vercel cannot reach a local machine) — see
  // docs/launch/owner-alert-agentai-os-bridge-plan-v1.md.
  AGENTAI_OS_ALERTS_ENABLED: z.enum(["true", "false"]).default("false"),
  AGENTAI_OS_ALERT_ENDPOINT: z.string().url().optional(),
  AGENTAI_OS_ALERT_TOKEN: z.string().optional(),

  // ── Voice Work Journal transcription (server-only, never NEXT_PUBLIC) ──────
  // Points at the LabourMarket.ai-controlled self-hosted whisper.cpp service
  // (services/transcribe). OFF unless BOTH are set — the journal voice surface
  // then shows its honest "transcription server not configured" state.
  // The browser NEVER talks to the service and never sees the token: audio is
  // proxied through a server action. See services/transcribe/README.md.
  VOICE_TRANSCRIBE_URL: z.string().url().optional(),
  VOICE_TRANSCRIBE_TOKEN: z.string().min(32).optional(),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_DB_PASSWORD: process.env.SUPABASE_DB_PASSWORD,
  NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS:
    process.env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS,
  PAYMENTS_ENABLED: process.env.PAYMENTS_ENABLED,
  BILLING_PROVIDER: process.env.BILLING_PROVIDER,
  STRIPE_MODE: process.env.STRIPE_MODE,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  STRIPE_PRICE_WORKER_PLUS: process.env.STRIPE_PRICE_WORKER_PLUS,
  STRIPE_PRICE_COMPANY_PILOT: process.env.STRIPE_PRICE_COMPANY_PILOT,
  STRIPE_PRICE_AGENCY_PILOT: process.env.STRIPE_PRICE_AGENCY_PILOT,
  AI_PROVIDER_MODE: process.env.AI_PROVIDER_MODE,
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_API_KEY: process.env.AI_API_KEY,
  AI_MODEL: process.env.AI_MODEL,
  AI_REQUEST_TIMEOUT_MS: process.env.AI_REQUEST_TIMEOUT_MS,
  AI_MAX_RETRIES: process.env.AI_MAX_RETRIES,
  AI_MAX_OUTPUT_TOKENS: process.env.AI_MAX_OUTPUT_TOKENS,
  AI_DAILY_RUN_BUDGET: process.env.AI_DAILY_RUN_BUDGET,
  AI_OPENAI_ENABLED: process.env.AI_OPENAI_ENABLED,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  AI_GEMINI_ENABLED: process.env.AI_GEMINI_ENABLED,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  AI_XAI_ENABLED: process.env.AI_XAI_ENABLED,
  XAI_API_KEY: process.env.XAI_API_KEY,
  AI_DEEPL_ENABLED: process.env.AI_DEEPL_ENABLED,
  DEEPL_API_KEY: process.env.DEEPL_API_KEY,
  OWNER_TELEGRAM_ALERTS_ENABLED: process.env.OWNER_TELEGRAM_ALERTS_ENABLED,
  OWNER_TELEGRAM_BOT_TOKEN: process.env.OWNER_TELEGRAM_BOT_TOKEN,
  OWNER_TELEGRAM_CHAT_ID: process.env.OWNER_TELEGRAM_CHAT_ID,
  AGENTAI_OS_ALERTS_ENABLED: process.env.AGENTAI_OS_ALERTS_ENABLED,
  AGENTAI_OS_ALERT_ENDPOINT: process.env.AGENTAI_OS_ALERT_ENDPOINT,
  AGENTAI_OS_ALERT_TOKEN: process.env.AGENTAI_OS_ALERT_TOKEN,
  VOICE_TRANSCRIBE_URL: process.env.VOICE_TRANSCRIBE_URL,
  VOICE_TRANSCRIBE_TOKEN: process.env.VOICE_TRANSCRIBE_TOKEN,
});

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment configuration — see .env.example");
}

export const env = parsed.data;

/**
 * §18 hardening (PR15): placeholder markers can NEVER be disabled in a
 * production build. The `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS="false"`
 * opt-out exists only for dev/test visual tinkering — in production every
 * governed placeholder always renders its visible marker, so fabricated
 * values can never pass as real platform data. ALL marker consumers must
 * read this constant, never the raw env var (guarded by
 * lib/guards/placeholder-marker-prod.test.ts).
 */
export const showPlaceholderMarkers =
  process.env.NODE_ENV === "production"
    ? true
    : env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS !== "false";

/**
 * The internal design-system galleries (/design, /design/text-first) are a
 * DEV TOOL, not a product surface ("Design system preview — dev only").
 * PR15 hardening: they can never render in a production build — before
 * this they were gated on the marker env var, whose default ("true") left
 * them publicly reachable in production.
 */
export const designGalleryEnabled =
  process.env.NODE_ENV !== "production" &&
  env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS === "true";

/** Server-only: throws if a required production secret is missing. */
export function requireServerSecrets() {
  const missing: string[] = [];
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Missing required server secrets: ${missing.join(", ")}. ` +
        "Set them in Vercel env / .env.local (see .env.example).",
    );
  }
}

/**
 * Public (URL + anon key) Supabase config for the browser/RSC clients.
 * Validated lazily at client-construction time (not module load) so build
 * and SSG succeed without secrets — Vercel injects them at deploy.
 */
export function requireSupabaseClientEnv(): {
  url: string;
  anonKey: string;
} {
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Set it in Vercel env / " +
        ".env.local (Supabase Dashboard → Settings → API). See .env.example.",
    );
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/** Server-only: validated service-role config for the admin client. */
export function requireSupabaseServiceEnv(): {
  url: string;
  serviceRoleKey: string;
} {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it in Vercel env / " +
        ".env.local (Supabase Dashboard → Settings → API). NEVER commit it.",
    );
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
