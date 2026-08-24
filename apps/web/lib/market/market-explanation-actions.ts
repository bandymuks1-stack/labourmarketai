"use server";

import "server-only";

/**
 * MARKET EXPLANATION — the server action, and the product's first AI call site
 * whose payload carries no data subject.
 *
 * ── WHY THIS RUNS ON A CLICK, NOT ON RENDER ────────────────────────────────
 *
 * Three reasons, and none of them is caution for its own sake:
 *
 *   COST. The deterministic panel is rendered on every visit to the
 *   opportunities board. Attaching a provider call to that render would bill
 *   a token budget to people who never asked a question, and the daily budget
 *   guard would then be spent by page views rather than by use.
 *
 *   HONESTY. A surface that silently produces AI text is a surface where the
 *   reader cannot tell which sentences are computed and which are generated.
 *   Asking first makes the boundary visible, which is the §7.1 contract
 *   (translator, not author) expressed as an interaction rather than a claim.
 *
 *   CONTROL. Doctrine and the owner order both require the human to stay in
 *   charge. The reader decides whether an explanation happens at all, and the
 *   deterministic facts are complete without it.
 *
 * ── WHAT LEAVES THE PLATFORM ───────────────────────────────────────────────
 *
 * Exactly `PublicMarketFacts` — see `public-market-facts.ts` for the field
 * list and the exclusions. NOT the profile id, NOT the user id, NOT the
 * session, NOT anything about the person asking. The run is a question about
 * an occupation's advertisement counts; the fact that a particular worker's
 * board suggested that occupation stays on this side of the boundary.
 *
 * `profileId` is deliberately NOT passed to `runAiAgent`. Every other caller
 * passes it, and for them it is right: those runs ARE about that person, and
 * the `ai_runs` row should say so. This one is not, so recording a subject
 * would be recording a subject the run does not have — and it would write the
 * person-linked telemetry that the D1 de-linking work exists to reduce. Cost
 * attribution is unaffected: `usage_cost_events` still receives the run, with
 * its organization resolved from the request context.
 */

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { runAiAgent } from "@/lib/ai/run-agent-server";
import type { AiLocale } from "@/lib/ai/runtime/types";
import { getPublicMarketFacts } from "./public-market-facts-read";
import {
  marketIsExplainable,
  type PublicMarketFacts,
} from "./public-market-facts";

/** The envelope `data` the agent's output schema guarantees. */
export interface MarketExplanationData {
  readonly summary: string;
  readonly where_demand_is: readonly string[];
  readonly skills_in_demand: readonly string[];
  readonly suggested_actions: readonly string[];
  readonly limitations: readonly string[];
}

export type MarketExplanationResult =
  | {
      readonly status: "ok";
      readonly explanation: MarketExplanationData;
      /** Named so the surface can say WHO wrote this. An AI paragraph with no
       *  attributable model is an anonymous claim. */
      readonly provider: string;
      readonly model: string;
      readonly confidence: "low" | "medium" | "high";
      readonly needsHumanReview: boolean;
    }
  /** The runtime refused, was unavailable, or produced nothing usable. The
   *  deterministic panel is unaffected — this is the AI layer being absent,
   *  which is a normal state and not an error to shout about. */
  | { readonly status: "off"; readonly reason: MarketExplanationOffReason };

export type MarketExplanationOffReason =
  | "not_authenticated"
  | "rate_limited"
  | "facts_unavailable"
  | "market_too_small"
  | "ai_unavailable";

const SUPPORTED_AI_LOCALES: ReadonlySet<string> = new Set(["en", "lt", "ru"]);

/** Per-user throttle. Deliberately tighter than the journal surface's 20/10min:
 *  this is a read-only curiosity action, not part of a workflow someone is
 *  trying to finish, and it is the first caller that can spend real money. */
const RATE_LIMIT = { limit: 6, windowMs: 10 * 60 * 1000 } as const;

export async function explainMarketForProfession(
  professionSlug: string,
  locale: string,
): Promise<MarketExplanationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // A "use server" action is callable from anywhere. An anonymous caller gets
  // the same honest `off` an unconfigured runtime gives.
  if (!user) return { status: "off", reason: "not_authenticated" };

  const limited = rateLimit({
    name: "ai-market-explanation",
    key: user.id,
    limit: RATE_LIMIT.limit,
    windowMs: RATE_LIMIT.windowMs,
  });
  if (limited.limited) return { status: "off", reason: "rate_limited" };

  const read = await getPublicMarketFacts(professionSlug);
  if (read.kind !== "ok") return { status: "off", reason: "facts_unavailable" };
  const facts: PublicMarketFacts = read.facts;

  // Below the threshold the deterministic panel is the whole honest answer —
  // see MIN_ADS_FOR_EXPLANATION for why a paragraph over three ads is worse
  // than no paragraph.
  if (!marketIsExplainable(facts)) {
    return { status: "off", reason: "market_too_small" };
  }

  const aiLocale: AiLocale = SUPPORTED_AI_LOCALES.has(locale)
    ? (locale as AiLocale)
    : "en";

  try {
    const outcome = await runAiAgent(
      "market_explanation",
      // The payload, whole and unaltered. Spread rather than re-typed by hand
      // so a new fact on PublicMarketFacts cannot silently fail to travel —
      // and the agent's `.strict()` input schema rejects anything the contract
      // has not admitted, which is where a mistake would surface.
      { ...facts },
      {
        locale: aiLocale,
        // A LABEL, never content — and never a person.
        inputSource: "public_market_facts",
        // profileId intentionally omitted; see the module docblock.
      },
    );
    if (outcome.status !== "suggestion") {
      return { status: "off", reason: "ai_unavailable" };
    }
    const envelope = outcome.value as {
      data?: MarketExplanationData;
      confidence?: "low" | "medium" | "high";
      needs_human_review?: boolean;
    };
    const data = envelope?.data;
    if (!data || typeof data.summary !== "string" || data.summary.trim() === "") {
      return { status: "off", reason: "ai_unavailable" };
    }
    return {
      status: "ok",
      explanation: data,
      provider: outcome.provider,
      model: outcome.model,
      confidence: envelope.confidence ?? "low",
      needsHumanReview: envelope.needs_human_review ?? false,
    };
  } catch {
    // A provider fault must never take the board down with it.
    return { status: "off", reason: "ai_unavailable" };
  }
}
