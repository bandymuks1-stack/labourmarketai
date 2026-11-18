"use server";

import "server-only";

/**
 * COUNTRY READINESS READING — the server action, and the `country_readiness`
 * agent's one call site (owner decision 2026-10-25, registry row 10.11).
 *
 * THE MATRIX IS THE ANSWER; THIS IS A READING OF IT. The per-country page
 * renders every requirement of every scope with its official source, review
 * date and provenance grade before this action can even be asked. Nothing
 * here replaces, filters or reorders those rows. A reader who wants the rows
 * of ONE scope explained back in plain language asks — and gets either a
 * labelled suggestion whose every step cites a matrix row, or an honest
 * sentence saying why there is none.
 *
 * WHY ON A CLICK. Same three reasons as the market explanation
 * (lib/market/market-explanation-actions.ts): a page view must not spend a
 * token budget, a generated paragraph must be visibly asked-for, and the
 * deterministic page is complete without it.
 *
 * WHAT LEAVES. Exactly `CountryReadingPayload` — matrix rows only (see
 * readiness-reading.ts). No profile id, no user id, nothing about the person
 * asking: `profileId` is deliberately not passed, because the run is about a
 * country's published rules and recording a subject would invent one.
 *
 * EGRESS IS UNCHANGED. The agent maps to `derive_workforce_requirements`,
 * classed LOW_RISK_PROJECT_DATA (data-sensitivity.ts). No grant names that
 * task, so an external provider may receive PUBLIC only and refuses this run;
 * a local model may serve it. Classing it PUBLIC — which the payload would
 * support — is an egress widening and therefore an owner act, not this one.
 * With `AI_PROVIDER_MODE` disabled (production today) the runtime answers
 * `disabled` and the surface says so.
 */

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { runAiAgent } from "@/lib/ai/run-agent-server";
import { aiLocaleFor } from "@/lib/ai/runtime/types";
import { READINESS_SCOPES, type ReadinessScope } from "./types";
import {
  acceptCountryReading,
  buildCountryReadingPayload,
  type CountryReading,
} from "./readiness-reading";

export type CountryReadingOffReason =
  /** A "use server" action is callable by anyone; an anonymous caller gets
   *  the same honest refusal an unconfigured runtime gives. */
  | "not_authenticated"
  | "rate_limited"
  /** No researched rows for this country + scope — the page already says so. */
  | "no_research"
  /** The AI runtime is switched off or not configured (production today). */
  | "ai_off"
  /** The runtime answered, but nothing usable came back (provider error,
   *  egress refusal, budget, schema rejection). */
  | "ai_unavailable"
  /** The model cited a requirement the matrix does not hold — voided whole. */
  | "unsourced";

export type CountryReadingResult =
  | {
      readonly status: "ok";
      readonly reading: CountryReading;
      /** Named so the surface can say WHO wrote it. */
      readonly provider: string;
      readonly model: string;
      readonly needsHumanReview: boolean;
    }
  | { readonly status: "off"; readonly reason: CountryReadingOffReason };

/** Per-user throttle — a read-only curiosity action, like the market one. */
const RATE_LIMIT = { limit: 6, windowMs: 10 * 60 * 1000 } as const;

function isScope(value: string): value is ReadinessScope {
  return (READINESS_SCOPES as readonly string[]).includes(value);
}

export async function explainCountryReadiness(
  country: string,
  scope: string,
  locale: string,
): Promise<CountryReadingResult> {
  if (!isScope(scope)) return { status: "off", reason: "no_research" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "off", reason: "not_authenticated" };

  const limited = rateLimit({
    name: "ai-country-readiness-reading",
    key: user.id,
    limit: RATE_LIMIT.limit,
    windowMs: RATE_LIMIT.windowMs,
  });
  if (limited.limited) return { status: "off", reason: "rate_limited" };

  const aiLocale = aiLocaleFor(locale);
  const t = await getTranslations({ locale: aiLocale, namespace: "countryReadiness" });
  const payload = buildCountryReadingPayload(country, scope, (key) =>
    t(`explanation.${key}`),
  );
  if (!payload) return { status: "off", reason: "no_research" };

  try {
    const outcome = await runAiAgent(
      "country_readiness",
      // Spread rather than re-typed, so the agent's `.strict()` input schema is
      // where any widening would surface.
      { ...payload, sourceRecords: [...payload.sourceRecords] },
      {
        locale: aiLocale,
        // A LABEL, never content — and never a person.
        inputSource: "country_readiness_matrix",
        // profileId intentionally omitted; see the module docblock.
      },
    );
    if (outcome.status === "disabled") return { status: "off", reason: "ai_off" };
    if (outcome.status !== "suggestion") {
      return { status: "off", reason: "ai_unavailable" };
    }
    const verdict = acceptCountryReading(outcome.value, payload);
    if (!verdict.ok) {
      return {
        status: "off",
        reason: verdict.reason === "unsourced" ? "unsourced" : "ai_unavailable",
      };
    }
    const envelope = outcome.value as { needs_human_review?: boolean };
    return {
      status: "ok",
      reading: verdict.reading,
      provider: outcome.provider,
      model: outcome.model,
      needsHumanReview: envelope?.needs_human_review ?? true,
    };
  } catch {
    // A provider fault must never take the country page down with it.
    return { status: "off", reason: "ai_unavailable" };
  }
}
