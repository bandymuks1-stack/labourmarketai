/**
 * CANONICAL PROVIDER REGISTRY — normalisation for the usage & cost ledger.
 *
 * Contract: `docs/architecture/usage-cost-event-model-v1.md` (risk R5).
 *
 * The event model deliberately keeps `provider` as DATA so a new supplier
 * never needs a migration. That freedom has one failure mode: the same vendor
 * arriving as `OpenAI`, `open_ai`, `OPENAI ` and `openai` becomes four
 * providers, and every cost aggregate silently splits.
 *
 * This module closes that without reintroducing a constraint:
 *   - a KNOWN vendor is mapped to exactly one canonical slug;
 *   - an UNKNOWN vendor is still accepted, normalised to a safe slug shape and
 *     reported as `known: false` — it is a new supplier, not an error.
 *
 * Pure. No IO.
 */

/** Canonical AI supplier slugs. */
export const CANONICAL_AI_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "azure-openai",
  "mistral",
  "deepseek",
  "local",
] as const;

/** Canonical non-AI supplier slugs (infrastructure and services). */
export const CANONICAL_NON_AI_PROVIDERS = [
  "supabase",
  "vercel",
  "resend",
  "twilio",
  "stripe",
  "mapbox",
  "google-maps",
  "cloudflare",
] as const;

export const CANONICAL_PROVIDERS = [
  ...CANONICAL_AI_PROVIDERS,
  ...CANONICAL_NON_AI_PROVIDERS,
] as const;

export type CanonicalProvider = (typeof CANONICAL_PROVIDERS)[number];

/**
 * Alias → canonical. Keys are compared AFTER the mechanical normalisation
 * below (lowercase, trimmed, separators collapsed to `-`), so only genuine
 * naming variants need an entry — not every casing.
 */
const ALIASES: Readonly<Record<string, CanonicalProvider>> = {
  // OpenAI
  "open-ai": "openai",
  "gpt": "openai",
  "chatgpt": "openai",
  // Azure-hosted OpenAI is a DIFFERENT supplier (different invoice, different
  // rate card) — it must never collapse into `openai`.
  "azure": "azure-openai",
  "azureopenai": "azure-openai",
  "azure-open-ai": "azure-openai",
  "microsoft-azure-openai": "azure-openai",
  // Anthropic
  "claude": "anthropic",
  "anthropic-ai": "anthropic",
  // Google
  "gemini": "google",
  "google-gemini": "google",
  "vertex": "google",
  "vertex-ai": "google",
  "googleai": "google",
  // Mistral
  "mistral-ai": "mistral",
  // DeepSeek
  "deep-seek": "deepseek",
  // Local / self-hosted
  "self-hosted": "local",
  "ollama": "local",
  "localhost": "local",
  // Infrastructure
  "supabase-io": "supabase",
  "vercel-inc": "vercel",
  "google-maps-platform": "google-maps",
  "googlemaps": "google-maps",
};

export const PROVIDER_SLUG_MAX_CHARS = 64;

/**
 * Mechanical normalisation, applied before any lookup:
 * lowercase, trim, strip anything that is not a letter/digit/`-`, collapse
 * separators, and bound the length.
 */
function mechanical(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_./]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROVIDER_SLUG_MAX_CHARS);
}

export interface NormalizedProvider {
  /** The slug that is stored. Never empty for a non-empty input. */
  readonly slug: string;
  /** Is this one of the canonical suppliers we already know? */
  readonly known: boolean;
  /** True when normalisation changed the caller's string. */
  readonly changed: boolean;
}

/**
 * Normalise a supplier name.
 *
 * An unknown supplier is ACCEPTED (`known: false`) — that is the whole point
 * of keeping provider as data. It is normalised so the same new vendor written
 * two ways still lands on one slug.
 */
export function normalizeProvider(raw: string): NormalizedProvider {
  const base = mechanical(raw ?? "");
  if (base.length === 0) return { slug: "", known: false, changed: raw !== "" };
  const canonical = ALIASES[base] ?? base;
  const known = (CANONICAL_PROVIDERS as readonly string[]).includes(canonical);
  return { slug: canonical, known, changed: canonical !== raw };
}

/** Convenience: the stored slug only. */
export function providerSlug(raw: string): string {
  return normalizeProvider(raw).slug;
}

/** Is a supplier one of the AI families (used to group AI cost)? */
export function isAiProvider(slug: string): boolean {
  return (CANONICAL_AI_PROVIDERS as readonly string[]).includes(slug);
}

/** Service families that count as AI spend regardless of supplier. */
export const AI_SERVICES = [
  "llm_completion",
  "llm_embedding",
  "speech_to_text",
  "text_to_speech",
  "vision",
] as const;

export function isAiService(service: string): boolean {
  return (AI_SERVICES as readonly string[]).includes(service);
}
