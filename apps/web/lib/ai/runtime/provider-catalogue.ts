/**
 * PROVIDER CATALOGUE — every AI / machine-translation vendor this platform has
 * planned, integrated or deliberately refused, with the terms that decide it.
 *
 * Owner order 2026-10-25: "one unified provider registry, in code where it
 * belongs". This is NOT a second registry and NOT a second router:
 *
 *   - `model-registry.ts` keeps MODEL facts (id, tier alias, price, source);
 *   - `provider-chain.ts` keeps ROUTING facts (cost class, locality, order);
 *   - `data-egress.ts` keeps PERMISSION (owner grants, the free-tier ceiling);
 *   - THIS file keeps the VENDOR facts none of those had a place for — real API
 *     availability, free quota and whether its terms allow production use,
 *     training / retention / region / DPA, Lithuanian support, the integration
 *     state — and ONE enforcement input: `termsCeiling`, the highest data class
 *     a vendor's OWN terms make lawful for this product. `data-egress.ts`
 *     applies it on top of grants and the free-tier cap, so a vendor whose terms
 *     forbid personal data can never receive it, whatever a grant says.
 *
 * Every fact is read first-hand from the vendor's page on the date given; a
 * fact that could not be read first-hand says "unverified". Re-check before an
 * owner relies on a free tier — a tier that was free once is not evidence it is
 * free now.
 *
 * MODELS ARE NOT PROVIDERS. Meta Llama and NVIDIA Nemotron are model families
 * reachable through several hosts (Cloudflare, Groq, OpenRouter, NVIDIA, a local
 * runtime). They are registered as models under the host that serves them
 * (`model-registry.ts`), never as fake providers; the entries below for `meta`
 * and `nvidia` describe the vendors' OWN APIs, which is a different question.
 *
 * Pure constants + pure derivations. No IO, no env, no fetch.
 */
import type { AiDataSensitivity } from "./data-sensitivity";
import type { AiProviderHealth } from "./provider-chain";

/** Where this vendor stands in THIS codebase. LIVE_IN_PROD is never written
 *  here — it is observed (configuration + `ai_runs`), see `integrationStateFor`. */
export type ProviderCodeState =
  /** A real wire exists; it is inert until the owner sets its env. */
  | "CODE_READY_AWAITING_KEY"
  /** Planned / evaluated, no wire. The reason says why. */
  | "NOT_INTEGRATED"
  /** Its own terms make it unfit for this product. Kept so nobody re-adds it. */
  | "UNSUITABLE_BY_TERMS";

export type ProviderIntegrationState = ProviderCodeState | "LIVE_IN_PROD";

/**
 * The highest data class this vendor's TERMS make lawful here.
 *   EXCLUDED — not even PUBLIC (terms forbid the use case, or production use).
 *   null     — the terms themselves set no cap below SENSITIVE_FREE_TEXT; the
 *              owner's grants and the free-tier cap still decide (default deny).
 */
export type TermsCeiling = AiDataSensitivity | "EXCLUDED" | null;

export interface ProviderSource {
  readonly url: string;
  /** The page's own date ("updated …", "effective …") or "no date". */
  readonly pageDate: string;
  /** When it was read for this entry. */
  readonly read: string;
}

export interface ProviderCatalogueEntry {
  /** Provider id as used by the chain / registry / egress profiles. */
  readonly id: string;
  readonly vendor: string;
  readonly kind: "llm" | "machine_translation" | "llm+mt";
  /** OpenAI-compatible (or own) API base URL, when one exists. */
  readonly api: string | null;
  readonly codeState: ProviderCodeState;
  /** Env NAMES the wire reads (never values). Empty when not integrated. */
  readonly env: readonly string[];
  readonly freeQuota: string;
  /** May the FREE quota serve a production product? true / false / null = unverified. */
  readonly freeCommercialUse: boolean | null;
  readonly training: string;
  readonly retention: string;
  readonly region: string;
  readonly dpa: string;
  /** EEA-specific restriction, verbatim when one exists. */
  readonly eeaRestriction: string | null;
  /** Lithuanian: confirmed on a vendor page, or unverified (LLM vendors publish no list). */
  readonly lithuanian: "confirmed" | "unverified" | "not_supported";
  readonly price: string;
  readonly termsCeiling: TermsCeiling;
  /** One sentence: why this state and this ceiling. */
  readonly verdict: string;
  readonly sources: readonly ProviderSource[];
}

const R = "2026-10-25";

export const PROVIDER_CATALOGUE: readonly ProviderCatalogueEntry[] = [
  // ── Inside our infrastructure ──────────────────────────────────────────────
  {
    id: "local",
    vendor: "Self-hosted OpenAI-compatible runtime (Ollama / LM Studio / vLLM)",
    kind: "llm",
    api: "operator base URL (AI_LOCAL_BASE_URL)",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_LOCAL_ENABLED", "AI_LOCAL_BASE_URL", "AI_LOCAL_MODEL", "AI_LOCAL_API_KEY (optional)"],
    freeQuota: "own hardware",
    freeCommercialUse: true,
    training: "none — no third party",
    retention: "operator-controlled",
    region: "operator's own host",
    dpa: "not needed (no processor)",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "hardware only",
    termsCeiling: null,
    verdict: "The only path for personal data at 0 €; production refuses loopback / tunnel hosts, so it needs a real host (current VPS is too small).",
    sources: [],
  },
  {
    id: "libretranslate",
    vendor: "LibreTranslate (Argos), self-hosted",
    kind: "machine_translation",
    api: "operator URL (LIBRETRANSLATE_URL)",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_LIBRETRANSLATE_ENABLED", "LIBRETRANSLATE_URL", "AI_LIBRETRANSLATE_SELF_HOSTED", "LIBRETRANSLATE_API_KEY (optional)"],
    freeQuota: "self-hosted, AGPL-3.0",
    freeCommercialUse: true,
    training: "none when self-hosted; hosted libretranslate.com: \"We do not store or log translation texts\"",
    retention: "self-hosted: none; hosted: IP addresses 2 days",
    region: "self-hosted: own host; hosted: US operator",
    dpa: "self-hosted: not needed; hosted: none",
    eeaRestriction: null,
    lithuanian: "confirmed",
    price: "self-hosted 0 €; hosted Pro $29/month",
    termsCeiling: null,
    verdict: "Self-hosted = local (personal text allowed); a hosted instance is an external free tier and gets PUBLIC only. Argos ships en↔lt (v1.9).",
    sources: [
      { url: "https://github.com/argosopentech/argospm-index/blob/main/index.json", pageDate: "no date", read: R },
      { url: "https://portal.libretranslate.com", pageDate: "no date", read: R },
    ],
  },

  // ── Free API tiers wired in #2742 ──────────────────────────────────────────
  {
    id: "cloudflare",
    vendor: "Cloudflare Workers AI",
    kind: "llm+mt",
    api: "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_CLOUDFLARE_ENABLED", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    freeQuota: "10,000 Neurons/day on Workers Free and Paid; Free fails past it (never billed)",
    freeCommercialUse: true,
    training: "\"Cloudflare does not use Customer Content processed by Workers AI to train AI models\"",
    retention: "not retained after the request (logging / caching features excepted)",
    region: "global network; Workers AI is NOT covered by Regional Services (no EU inference guarantee)",
    dpa: "Cloudflare DPA (self-serve subscription)",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "$0.011 / 1,000 Neurons past the allocation (Workers Paid only); per-model rows in the registry",
    termsCeiling: null,
    verdict: "Best free tier: commercial, no training, no retention. free_tier ⇒ PUBLIC by default; a grant could raise it to LOW_RISK at most.",
    sources: [
      { url: "https://developers.cloudflare.com/workers-ai/platform/pricing/", pageDate: "updated 2026-10-20", read: R },
      { url: "https://developers.cloudflare.com/workers-ai/platform/data-usage/", pageDate: "updated 2026-10-16", read: R },
      { url: "https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/", pageDate: "updated 2026-09-18", read: R },
    ],
  },
  {
    id: "mistral",
    vendor: "Mistral AI (La Plateforme, free mode)",
    kind: "llm",
    api: "https://api.mistral.ai/v1 (EU-pinned api.eu.mistral.ai at 1.1×)",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_MISTRAL_ENABLED", "MISTRAL_API_KEY"],
    freeQuota: "free mode, rate-limited (limits not published first-hand)",
    freeCommercialUse: null,
    training: "free mode: Mistral \"may use your data (input and output) to train\" unless the Admin → Privacy opt-out is switched off",
    retention: "unverified for free mode; ZDR on pay-as-you-go",
    region: "EU by default",
    dpa: "Commercial ToS §12.3 (effective 2026-09-25)",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "mistral-large-latest $0.5 / $1.5 per 1M (pricing page)",
    termsCeiling: "PUBLIC",
    verdict: "Free mode trains by default ⇒ PUBLIC only, whatever a grant says; the paid plan under the DPA would be a separate owner decision.",
    sources: [
      { url: "https://mistral.ai/pricing", pageDate: "no date", read: R },
      { url: "https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training", pageDate: "updated 2026-09-03", read: R },
      { url: "https://legal.mistral.ai/terms/commercial-terms-of-service", pageDate: "effective 2026-09-25", read: R },
    ],
  },
  {
    id: "groq",
    vendor: "Groq (GroqCloud free plan)",
    kind: "llm",
    api: "https://api.groq.com/openai/v1",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_GROQ_ENABLED", "GROQ_API_KEY"],
    freeQuota: "per-model limits in the console (Developer plan example: gpt-oss-120b 30 RPM, 1K RPD, 200K TPD)",
    freeCommercialUse: null,
    training: "Services Agreement §4.2: no training on inputs or outputs",
    retention: "not retained by default; troubleshooting logs ≤ 30 days; self-serve Zero Data Retention",
    region: "US (Google Cloud buckets), SCCs",
    dpa: "incorporated in the Services Agreement §3.4 (Beta services excluded)",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "gpt-oss-20b $0.075 / $0.30; gpt-oss-120b $0.15 / $0.60 per 1M; Llama rows now \"contact sales\"",
    termsCeiling: null,
    verdict: "No training + DPA, but US storage and free-plan commercial use not stated ⇒ free_tier, PUBLIC by default; turn ZDR on.",
    sources: [
      { url: "https://console.groq.com/docs/your-data", pageDate: "no date", read: R },
      { url: "https://console.groq.com/docs/models", pageDate: "no date", read: R },
      { url: "https://console.groq.com/docs/legal/services-agreement", pageDate: "last modified 2026-06-22", read: R },
    ],
  },

  // ── Translation specialist ─────────────────────────────────────────────────
  {
    id: "deepl",
    vendor: "DeepL API Pro / Growth",
    kind: "machine_translation",
    api: "https://api.deepl.com/v2",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_DEEPL_ENABLED", "DEEPL_API_KEY"],
    freeQuota: "none on Pro (plan line-up changed; Growth ≈ €29.75/month with 1M chars — unverified)",
    freeCommercialUse: null,
    training: "Pro §3.1.5: content used only for the customer's own purposes",
    retention: "Pro §3.1.2 / §3.1.4: temporary, up to 72 h encrypted for debugging",
    region: "DeepL chooses (no EU guarantee in the terms)",
    dpa: "Pro §8.1.5: DPA from the Trust Centre",
    eeaRestriction: null,
    lithuanian: "confirmed",
    price: "per character (paid plan) — the token ceiling cannot price it",
    termsCeiling: null,
    verdict: "The specialist for important / glossary / document translation of personal text — only under an owner grant + DPA; no grant exists (deferred since RED-2).",
    sources: [{ url: "https://www.deepl.com/en/pro-license", pageDate: "last update August 2026", read: R }],
  },
  {
    id: "deepl_free",
    vendor: "DeepL API Free / Developer (key ending \":fx\")",
    kind: "machine_translation",
    api: "https://api-free.deepl.com/v2",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_DEEPL_ENABLED", "DEEPL_API_KEY (\":fx\" key)"],
    freeQuota: "500k chars/month historically; now reported as 1M chars total (unverified)",
    freeCommercialUse: null,
    training: "§3.3.2: DeepL \"reserves the right to perpetually store any Content\"",
    retention: "perpetual (§3.3.2)",
    region: "DeepL chooses",
    dpa: "none; §8.3.11 prohibits processing personal data on the free API",
    eeaRestriction: null,
    lithuanian: "confirmed",
    price: "0 € within the allowance",
    termsCeiling: "PUBLIC",
    verdict: "Its own terms forbid personal data ⇒ PUBLIC only, enforced here; message and vacancy text are never PUBLIC, so it is effectively unused.",
    sources: [{ url: "https://www.deepl.com/en/pro-license", pageDate: "last update August 2026", read: R }],
  },

  // ── Metered vendors (adapters exist; owner: no paid plan activated) ────────
  {
    id: "gemini",
    vendor: "Google Gemini API (paid tier only)",
    kind: "llm",
    api: "https://generativelanguage.googleapis.com/v1beta",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_GEMINI_ENABLED", "GEMINI_API_KEY", "AI_GEMINI_PAID_TIER_CONFIRMED"],
    freeQuota: "free tier exists but may not serve EEA users",
    freeCommercialUse: false,
    training: "paid: prompts not used to improve products; free: used, human reviewers may read",
    retention: "paid: 55 days for abuse monitoring",
    region: "Google global",
    dpa: "Google Cloud data processing terms for paid services (not re-read)",
    eeaRestriction: "\"You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom.\"",
    lithuanian: "unverified",
    price: "gemini-3.5-flash-lite $0.30 / $2.50; gemini-3.1-flash-lite $0.25 / $1.50 per 1M",
    termsCeiling: null,
    verdict: "Paid key + AI_GEMINI_PAID_TIER_CONFIRMED=1 only; holds the two task-scoped owner grants (intent, message translation). Production used a billed key until 2026-10-15.",
    sources: [
      { url: "https://ai.google.dev/gemini-api/terms", pageDate: "updated 2026-04-28, effective 2026-03-23", read: R },
      { url: "https://ai.google.dev/gemini-api/docs/pricing", pageDate: "updated 2026-10-22", read: R },
    ],
  },
  {
    id: "anthropic",
    vendor: "Anthropic Claude API",
    kind: "llm",
    api: "https://api.anthropic.com",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_API_KEY"],
    freeQuota: "none",
    freeCommercialUse: false,
    training: "no training on API inputs/outputs (feedback / opt-in excepted)",
    retention: "deleted within 30 days (longer for policy violations; ZDR by agreement)",
    region: "US (inference_geo \"us\" option; no EU option shown)",
    dpa: "commercial terms DPA",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "claude-haiku-4-5 $1 / $5; claude-sonnet-4-6 $3 / $15; claude-opus-4-8 $5 / $25 per 1M",
    termsCeiling: null,
    verdict: "Paid only — not activated (owner: no paid plans).",
    sources: [{ url: "https://privacy.claude.com", pageDate: "2026-08-18", read: R }],
  },
  {
    id: "openai",
    vendor: "OpenAI API",
    kind: "llm",
    api: "https://api.openai.com/v1",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_OPENAI_ENABLED", "OPENAI_API_KEY"],
    freeQuota: "none",
    freeCommercialUse: false,
    training: "not used for training unless opted in",
    retention: "abuse logs up to 30 days; ZDR needs approval",
    region: "US; EU residency needs sales approval + ZDR amendment",
    dpa: "OpenAI DPA",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "gpt-5-nano $0.05 / $0.40; gpt-5-mini $0.25 / $2.00; gpt-5 $1.25 / $10 per 1M (registry rows stay unpriced/disabled until owner review)",
    termsCeiling: null,
    verdict: "Paid only — not activated; registry models disabled.",
    sources: [{ url: "https://developers.openai.com/api/docs/guides/your-data", pageDate: "no date", read: R }],
  },
  {
    id: "xai",
    vendor: "xAI Grok API",
    kind: "llm",
    api: "https://api.x.ai/v1",
    codeState: "CODE_READY_AWAITING_KEY",
    env: ["AI_XAI_ENABLED", "XAI_API_KEY"],
    freeQuota: "none",
    freeCommercialUse: false,
    training: "never trained on without explicit permission",
    retention: "30 days for abuse review; self-serve ZDR",
    region: "US (no EU region)",
    dpa: "x.ai/legal/data-processing-addendum (not read)",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "grok-4.3 $1.25 / $2.50 per 1M; registry ids (grok-3*) are no longer listed by the vendor",
    termsCeiling: null,
    verdict: "Paid only — not activated; registry ids stale and disabled.",
    sources: [{ url: "https://docs.x.ai/docs/models", pageDate: "no date", read: R }],
  },

  // ── Evaluated, not integrated ──────────────────────────────────────────────
  {
    id: "qwen",
    vendor: "Alibaba Cloud Model Studio (Qwen)",
    kind: "llm",
    api: "{workspace}.eu-central-1.maas.aliyuncs.com (Frankfurt) / dashscope-intl.aliyuncs.com (Singapore)",
    codeState: "NOT_INTEGRATED",
    env: [],
    freeQuota: "1M tokens / 90 days, Singapore region only",
    freeCommercialUse: null,
    training: "\"will never use your data for model training\"",
    retention: "unverified",
    region: "selected region (Frankfurt EU scope exists)",
    dpa: "unverified",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "qwen-flash $0.05 / $0.40; qwen-plus $0.40 / $1.20; qwen-max $1.60 / $6.40 (Singapore)",
    termsCeiling: null,
    verdict: "Registered (disabled). Free quota is a one-off trial in Singapore and Frankfurt is paid ⇒ not wired; a Frankfurt binding is the candidate if the owner ever pays for an EU model.",
    sources: [
      { url: "https://www.alibabacloud.com/help/en/model-studio/regions", pageDate: "2026-10-13", read: R },
      { url: "https://www.alibabacloud.com/help/en/model-studio/model-pricing", pageDate: "2026-10-22", read: R },
    ],
  },
  {
    id: "openrouter",
    vendor: "OpenRouter",
    kind: "llm",
    api: "https://openrouter.ai/api/v1",
    codeState: "NOT_INTEGRATED",
    env: [],
    freeQuota: "`:free` models: 20 RPM; 50 requests/day under 10 purchased credits",
    freeCommercialUse: null,
    training: "depends on the routed provider; free-model providers may log/train",
    retention: "OpenRouter: none unless prompt logging is on; ZDR selectable",
    region: "US; EU routing only on Business / Enterprise (paid)",
    dpa: "only \"if you have\" one",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "pass-through",
    termsCeiling: "PUBLIC",
    verdict: "50 requests/day and a free list of unknown-quality models add nothing over the three wired free tiers; would be PUBLIC-only.",
    sources: [
      { url: "https://openrouter.ai/docs/api-reference/limits", pageDate: "no date", read: R },
      { url: "https://openrouter.ai/docs/guides/privacy/provider-logging", pageDate: "no date", read: R },
    ],
  },
  {
    id: "scaleway",
    vendor: "Scaleway Generative APIs (Paris)",
    kind: "llm",
    api: "https://api.scaleway.ai/v1",
    codeState: "NOT_INTEGRATED",
    env: [],
    freeQuota: "first 1M tokens free (one-off)",
    freeCommercialUse: null,
    training: "no training",
    retention: "zero data retention by default (kept ≤ 2 weeks only on misuse)",
    region: "Paris, EU",
    dpa: "acts as processor (named DPA unverified)",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "mistral-small-3.2 €0.15 / €0.35; llama-3.3-70b €0.90 / €0.90 per 1M (EUR — registry is USD)",
    termsCeiling: null,
    verdict: "Best EU-hosted candidate for PERSONAL tasks under a DPA, but it is metered after 1M tokens ⇒ an owner payment decision, not wired.",
    sources: [{ url: "https://www.scaleway.com/en/docs/generative-apis/reference-content/data-privacy/", pageDate: "reviewed 2025-10-03", read: R }],
  },
  {
    id: "ovhcloud",
    vendor: "OVHcloud AI Endpoints",
    kind: "llm",
    api: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1 (unverified)",
    codeState: "NOT_INTEGRATED",
    env: [],
    freeQuota: "anonymous / free use unverified",
    freeCommercialUse: null,
    training: "no training",
    retention: "zero data retention",
    region: "EU",
    dpa: "unverified",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "gpt-oss-120b €0.08 / €0.40; Llama-3.3-70B €0.67 / €0.67 per 1M",
    termsCeiling: null,
    verdict: "EU-hosted paid alternative to Scaleway; not wired (metered).",
    sources: [{ url: "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/", pageDate: "no date", read: R }],
  },
  {
    id: "huggingface",
    vendor: "Hugging Face Inference Providers",
    kind: "llm",
    api: "https://router.huggingface.co/v1",
    codeState: "NOT_INTEGRATED",
    env: [],
    freeQuota: "no monthly credits for free users (PRO: $2/month)",
    freeCommercialUse: false,
    training: "depends on the routed provider",
    retention: "depends on the routed provider",
    region: "depends on the routed provider",
    dpa: "unverified",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "pass-through",
    termsCeiling: null,
    verdict: "No free allowance ⇒ nothing to gain at 0 €.",
    sources: [{ url: "https://huggingface.co/docs/inference-providers/pricing", pageDate: "no date", read: R }],
  },

  // ── Refused by their own terms ─────────────────────────────────────────────
  {
    id: "moonshot",
    vendor: "Moonshot AI (Kimi)",
    kind: "llm",
    api: "https://api.moonshot.ai/v1 (unverified)",
    codeState: "UNSUITABLE_BY_TERMS",
    env: [],
    freeQuota: "none for inference",
    freeCommercialUse: false,
    training: "\"Unless otherwise expressly agreed in writing, Customer Content may be used\" to develop and improve the services",
    retention: "not stated",
    region: "Singapore entity and servers; no EEA transfer mechanism named",
    dpa: "none mentioned",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "unverified (pricing tables did not render)",
    termsCeiling: "EXCLUDED",
    verdict: "Its model terms forbid using outputs for significant decisions about individuals, explicitly employment — the core of this product — and train on content by default.",
    sources: [
      { url: "https://platform.kimi.ai/docs/agreement/modeluse", pageDate: "2026-07-30", read: R },
      { url: "https://platform.kimi.ai/docs/pricing/chat", pageDate: "no date", read: R },
    ],
  },
  {
    id: "deepseek",
    vendor: "DeepSeek API",
    kind: "llm",
    api: "https://api.deepseek.com",
    codeState: "UNSUITABLE_BY_TERMS",
    env: [],
    freeQuota: "none",
    freeCommercialUse: false,
    training: "personal data used to \"train and improve\" models (opt-out)",
    retention: "\"as long as you have an account\"",
    region: "stored in the People's Republic of China; no transfer mechanism named",
    dpa: "none",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "deepseek-flash $0.15 / $0.60 off-peak (2× at peak)",
    termsCeiling: "EXCLUDED",
    verdict: "PRC storage, training use and no DPA rule out personal data; with no free quota a PUBLIC-only use would be a new paid plan for nothing.",
    sources: [
      { url: "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html", pageDate: "2026-02-10", read: R },
      { url: "https://api-docs.deepseek.com/quick_start/pricing", pageDate: "no date", read: R },
    ],
  },
  {
    id: "nvidia",
    vendor: "NVIDIA API catalog (build.nvidia.com, NIM)",
    kind: "llm",
    api: "https://integrate.api.nvidia.com/v1",
    codeState: "UNSUITABLE_BY_TERMS",
    env: [],
    freeQuota: "trial access",
    freeCommercialUse: false,
    training: "trial terms reportedly allow using prompts/outputs to improve products (unverified)",
    retention: "unverified",
    region: "unverified",
    dpa: "none for the trial",
    eeaRestriction: null,
    lithuanian: "unverified",
    price: "production needs an NVIDIA AI Enterprise licence",
    termsCeiling: "EXCLUDED",
    verdict: "Free access \"is for prototyping, research, development and testing purposes only\". Nemotron itself is served by Cloudflare Workers AI and is registered there.",
    sources: [{ url: "https://forums.developer.nvidia.com/t/300317", pageDate: "2024-09-11", read: R }],
  },
  {
    id: "meta",
    vendor: "Meta Model API (dev.meta.ai)",
    kind: "llm",
    api: "https://api.meta.ai/v1",
    codeState: "UNSUITABLE_BY_TERMS",
    env: [],
    freeQuota: "preview credits, reportedly US-only (unverified)",
    freeCommercialUse: null,
    training: "unverified",
    retention: "unverified",
    region: "US preview (unverified)",
    dpa: "unverified",
    eeaRestriction: "Llama 4 multimodal use policy: rights \"are not being granted to you\" for a company with a principal place of business in the EU",
    lithuanian: "unverified",
    price: "unverified",
    termsCeiling: "EXCLUDED",
    verdict: "The API serves Meta's Muse models, not Llama, and Llama 4 multimodal is not licensed to an EU company. Llama 3.3 70B is used through Cloudflare, where it is registered.",
    sources: [
      { url: "https://dev.meta.ai/docs", pageDate: "no date", read: R },
      { url: "https://dev.meta.ai/llama/llama4/use-policy", pageDate: "no date", read: R },
    ],
  },
];

export function catalogueEntryFor(id: string): ProviderCatalogueEntry | undefined {
  return PROVIDER_CATALOGUE.find((e) => e.id === id);
}

/**
 * The ceiling a vendor's own terms set. An id with no catalogue entry sets no
 * TERMS cap here — it is still behind the default-deny grant gate (PUBLIC at
 * most), and the guard `provider-catalogue.test.ts` fails the build when a
 * shipped profile, secondary or registry provider has no entry at all.
 */
export function termsCeilingFor(id: string): TermsCeiling {
  return catalogueEntryFor(id)?.termsCeiling ?? null;
}

/**
 * The integration state as observed in a deployment. LIVE_IN_PROD needs BOTH a
 * code-ready wire and a provider the deployment reports ready; anything else is
 * the code state. (Whether it ANSWERED is `ai_runs`' job, not this function's.)
 */
export function integrationStateFor(
  id: string,
  health: AiProviderHealth | undefined,
  isProduction: boolean,
): ProviderIntegrationState {
  const e = catalogueEntryFor(id);
  if (!e) return "NOT_INTEGRATED";
  if (e.codeState === "CODE_READY_AWAITING_KEY" && isProduction && health === "ready") {
    return "LIVE_IN_PROD";
  }
  return e.codeState;
}
