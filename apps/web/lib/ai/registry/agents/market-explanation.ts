/**
 * Market Explanation agent — registry entry.
 *
 * THE FIRST AGENT IN THIS PRODUCT WHOSE PAYLOAD CARRIES NO DATA SUBJECT.
 *
 * Every other agent here reads a person (a CV, a journal entry, a match built
 * from someone's evidence) or a business's own confidential work. That is why
 * `TASK_SENSITIVITY` had no `PUBLIC` entry and why, per the Gemini activation
 * gate, a live credential lit up nothing: an external provider with no egress
 * grant may receive `PUBLIC` and nothing else.
 *
 * This agent's input is `PublicMarketFacts` — counts, taxonomy slugs, city
 * names and dates derived from externally published job advertisements. It is
 * a market statistic. Nothing in it names or describes a person, and the
 * exclusion list that keeps it that way is enforced one layer down in
 * `lib/market/public-market-facts.ts` and pinned by a guard.
 *
 * ── WHAT THIS AGENT IS FOR (doctrine §7.1: translator, not author) ─────────
 *
 * The platform has ALREADY computed the market. The counts, the seven-day
 * arrivals, the skill ranking and the geography are deterministic and are
 * rendered whether or not this agent ever runs. The agent's job is strictly to
 * say what those numbers MEAN for a person deciding what to do next, in their
 * own language.
 *
 * So the surface degrades to something genuinely useful when AI is off,
 * blocked, out of budget or simply not asked for — which is the difference
 * between an AI feature and a feature that happens to use AI.
 *
 * ── THE THREE THINGS IT MUST NEVER DO ─────────────────────────────────────
 *
 * 1. NEVER STATE OR ESTIMATE PAY. `adsStatingPay` is in the payload precisely
 *    so the model is told how many advertisements carry a figure. On the
 *    production pool read 2026-08-24 that number was ZERO across all 43,026
 *    browsable ads. A salary sentence would therefore be invented, and an
 *    invented salary on a labour-market product is the single most damaging
 *    thing an LLM here could produce.
 * 2. NEVER ADD A MARKET FACT THAT IS NOT IN THE PAYLOAD. No outside knowledge
 *    of the industry, no "demand is generally rising in Europe", no employer
 *    names. `evidence_refs` must point at the supplied facts.
 * 3. NEVER DESCRIBE OR INFER A PERSON. It is not given one, and asking about
 *    the reader would be an invitation to hallucinate one.
 *
 * And one about honesty of scope: the skill / city rankings are computed over
 * the most recently published window, not always the whole population. The
 * payload says which via `rankingWindowCoversAll`, and the prompt requires the
 * distinction to survive into the words.
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

const marketCountSchema = z
  .object({
    key: z.string().min(1).max(120),
    ads: z.number().int().min(0),
  })
  .strict();

/**
 * The input contract, `.strict()` over exactly `PublicMarketFacts` plus the
 * locale. Strictness is the enforcement, not a formality: a caller that later
 * tries to "just also pass the worker's name" gets a schema failure rather
 * than a quiet widening of what leaves the platform.
 */
export const marketExplanationInputSchema = z
  .object({
    professionSlug: z.string().min(1).max(120),
    measuredAtIso: z.string().min(4).max(40),
    activeAds: z.number().int().min(0),
    newAds7d: z.number().int().min(0),
    newAds30d: z.number().int().min(0),
    adsStatingPay: z.number().int().min(0),
    rankingWindowAds: z.number().int().min(0),
    rankingWindowCoversAll: z.boolean(),
    topSkills: z.array(marketCountSchema).max(20),
    topCities: z.array(marketCountSchema).max(20),
    countries: z.array(marketCountSchema).max(20),
  })
  .strict();

const marketExplanationData = z
  .object({
    /** What is happening in this market, in the reader's language. */
    summary: z.string().min(1).max(1200),
    /** Where demand is concentrated or moving — grounded in topCities. */
    where_demand_is: z.array(z.string().min(1).max(300)).max(6),
    /** Which recognized skills the advertisements ask for most. */
    skills_in_demand: z.array(z.string().min(1).max(300)).max(8),
    /** Concrete, non-guaranteeing things a reader could do next. */
    suggested_actions: z.array(z.string().min(1).max(300)).max(5),
    /** What these numbers cannot tell you. Required — a market summary with
     *  no stated limits is the shape of an over-claim. */
    limitations: z.array(z.string().min(1).max(300)).min(1).max(5),
  })
  .strict();

export const marketExplanationOutputSchema = aiEnvelopeSchema(
  "market_explanation",
  marketExplanationData,
  // Grounded-only: an explanation with no reference to the facts it was given
  // is, by definition, not an explanation of them.
  { requireEvidence: true },
);

export const marketExplanationEntry: PromptRegistryEntry = {
  agent: "market_explanation",
  version: "1.0.0",
  title: "Market Explanation Agent",
  system: [
    "You explain a labour-market statistic that has ALREADY been computed.",
    "You are given aggregate counts of published job advertisements for ONE",
    "occupation: how many are open, how many appeared in the last 7 and 30",
    "days, which recognized skills they ask for, and which cities and",
    "countries they are in. Explain, in the requested language, what this",
    "means for someone deciding what work to look for next.",
    "",
    "GROUNDING. Use ONLY the numbers supplied. Never add a market fact from",
    "outside them, never name an employer, and never describe or guess",
    "anything about the reader — you have not been told anything about a",
    "person and there is nothing to infer.",
    "",
    "PAY. `adsStatingPay` says how many of these advertisements state a",
    "compensation figure. If it is 0, say plainly that these advertisements do",
    "not state pay, and give NO figure, NO range and NO comparison. Never",
    "estimate a salary under any circumstances.",
    "",
    "SCOPE. When `rankingWindowCoversAll` is false the skill and place",
    "rankings cover only the most recently published `rankingWindowAds`",
    "advertisements, not all `activeAds`. Say so rather than presenting them",
    "as the whole market.",
    "",
    "ZERO IS AN ANSWER. If `activeAds` is 0, the honest explanation is that",
    "nothing is being advertised for this occupation right now. Do not soften",
    "it and do not speculate about why.",
    "",
    "`limitations` is required: these are advertisement counts from one",
    "imported source, not the whole labour market, and the reader must be",
    "told. Set `needs_human_review` when the numbers are too small or too",
    "inconsistent to carry a confident reading. Return ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: marketExplanationInputSchema,
  outputSchema: marketExplanationOutputSchema,
  safetyRules: [
    "Never state, estimate or compare pay — the source advertisements carry no figure.",
    "Never add a market fact that is not in the supplied numbers.",
    "Never name an employer.",
    "Never describe, infer or address anything about the reader as a person.",
    "Never present a windowed ranking as if it covered the whole market.",
    "Always state what these counts cannot tell you.",
  ],
  allowedEvidenceSources: ["public_market_facts"],
  blockedClaims: [
    "salary",
    "pay rate",
    "guaranteed",
    "verified",
    "you will be hired",
    "employer name",
  ],
  lastUpdated: "2026-08-24",
};
