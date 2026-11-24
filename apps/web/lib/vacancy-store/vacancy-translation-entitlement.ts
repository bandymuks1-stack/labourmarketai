import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveEntitlements, hasFeature } from "@/lib/billing/effective-entitlements";
import { entitlementAllows } from "@/lib/billing/entitlements-v1";
import { limitFor } from "@/lib/billing/entitlements";
import { getPlan } from "@/lib/billing/plans";

/**
 * TRANSLATION ALLOWANCE — the entitlement seam for on-demand vacancy
 * translation (owner decision 2026-09-22, "VACANCY TRANSLATION POLICY").
 *
 * WHAT CHANGED, AND WHY THIS MODULE EXISTS. Until now the platform
 * translated foreign ads AUTOMATICALLY as they were read: the board's
 * titles went out in one batched call per render for every signed-in
 * reader. The owner has retired that assumption. Translation is now an act
 * the READER asks for, once, per ad — and an act that costs money, so it
 * is metered.
 *
 * THE FOUR RULES THIS MODULE ENFORCES, restated where they are enforced:
 *
 *   1. CONSUME ONLY ON A USABLE RESULT. The allowance is spent when the
 *      reader receives a rendering they can read — never when the run was
 *      refused by the egress gate, failed at the vendor, or was rejected by
 *      the digit/redaction checks. So consumption is recorded by the
 *      translation path AFTER it has accepted the rendering, never before
 *      and never by the router.
 *
 *   2. A CACHE HIT IS FREE. `event_id` is DERIVED from
 *      (profile, vacancy, target locale, source hash), so the same person
 *      asking for the same unchanged ad in the same language a second time
 *      collides on the primary key and is not charged again. A publisher
 *      edit changes `content_hash`, which changes the id — a genuinely new
 *      rendering, genuinely counted.
 *
 *   3. THE QUANTITY IS THE OWNER'S, AND IS NOT SET. The owner approved the
 *      MODEL — user-requested; a limited free amount; a limited subscription
 *      amount; credits possibly later; no plan unlimited — and explicitly
 *      not the figures: "exact quantities and prices are NOT YET DECIDED".
 *      So the allowance is UNCONFIGURED: every plan declares
 *      `vacancy_translations: false`, and this module reads that registry
 *      rather than carrying a number of its own.
 *
 *      UNCONFIGURED MEANS DISABLED, NOT UNLIMITED. That is the whole risk of
 *      the state: an absent limit read as "no ceiling" would hand out an
 *      uncapped vendor budget the owner never agreed to. So an unconfigured
 *      allowance refuses NEW renderings — while cache hits stay free,
 *      because those were already paid for and cost nothing to serve.
 *      Turning it on is one edit per plan: `false` -> the owner's number.
 *
 *   4. EXHAUSTION NEVER BREAKS THE AD. Running out removes a convenience,
 *      not the opportunity: the publisher's own words stay fully readable
 *      and the source language stays named. This module returns a gate
 *      result; it never hides a vacancy.
 *
 * WHERE THE METER LIVES — AND WHY THERE IS NO NEW TABLE. Consumption is one
 * `usage_cost_events` row (`event_type='activity'`), the canonical
 * append-only usage ledger that already carries `profile_id`, `plan_key`,
 * `feature_code`, `resource` and a caller-supplied `event_id`. A new table
 * would need its own GRANTs — `pg_default_acl` is empty on this database —
 * which makes it a RED migration for a counter the ledger was built to
 * hold. `activity` is deliberately NOT `usage`: this row is an entitlement
 * fact, not money. The vendor call's own cost row is written separately by
 * `lib/ai/run-agent-server.ts` and stays the money record (SEP-1: FACT ≠
 * DERIVED — what a run COST and what a person's allowance SPENT are two
 * different facts, and collapsing them would make a refunded refusal look
 * like spend).
 *
 * ENFORCEMENT FOLLOWS THE PLATFORM, NOT THIS FEATURE. While payments are
 * off, the gate is PERMISSIVE and says so (`enforced: false`) — the same
 * rule `open-needs-gate.ts` and the booking gate follow, so the pilot is
 * not retroactively locked by a limit nobody has bought their way past.
 * The counting is REAL either way, so the number shown to a person is a
 * measured fact on the day enforcement is switched on.
 */

/** `usage_cost_events.feature_code` for one accepted vacancy rendering. */
export const VACANCY_TRANSLATION_FEATURE_CODE = "vacancy_translation";

export interface TranslationAllowanceV1 {
  /** WHO the allowance belongs to, resolved from the SESSION — never from a
   *  caller-supplied argument. null = nobody is signed in. */
  readonly profileId: string | null;
  /**
   * Whether the owner has set a quantity for this plan at all. False today
   * for every plan. A caller must NEVER read `false` as "no ceiling".
   */
  readonly configured: boolean;
  /** Included renderings for the reader's plan; null while UNCONFIGURED.
   *  There is deliberately no value meaning "unlimited". */
  readonly limit: number | null;
  /** Renderings this person has already been charged for. Measured. */
  readonly used: number;
  /** What is left. Never negative. null ONLY when the count could not be
   *  read at all — UNKNOWN, which SEP-7 forbids rendering as a number. */
  readonly remaining: number | null;
  /** False while payments are off: counted honestly, not enforced. */
  readonly enforced: boolean;
  /** Whether a NEW rendering may be requested right now. */
  readonly allowed: boolean;
  /** The plan the figures came from — for the honest surface line. */
  readonly planKey: string;
}

/**
 * The person's plan quantity for translations, or null when the owner has
 * not set one. Pure.
 *
 * null means UNCONFIGURED and is read as DISABLED everywhere — never as
 * "no ceiling". `limitFor` already answers null both for "not a numeric
 * entitlement" and for "this plan does not carry the key", and those
 * collapse to the same honest answer here: nobody has decided a quantity,
 * so no new rendering is authorised.
 */
export function translationLimitFor(planKey: string): number | null {
  const plan = getPlan(planKey);
  if (!plan) return null;
  return limitFor(plan, "vacancy_translations");
}

/**
 * Derive the ledger's idempotency key. Same person + same ad + same target
 * language + same publisher text = the same id forever, so rule 2 above is
 * enforced by the primary key rather than by a query anyone could forget.
 *
 * `event_id` is a text column, so this is a readable composite rather than a
 * hash: a human reading the ledger can see WHAT was charged for, and an
 * admin can count a person's renderings without joining anything.
 */
export function translationEventId(
  profileId: string,
  storeId: string,
  targetLocale: string,
  sourceHash: string,
): string {
  return `vt:${profileId}:${storeId}:${targetLocale}:${sourceHash}`.slice(0, 128);
}

/**
 * How many renderings this person has been charged for. Bounded count over
 * the partial index `usage_cost_events (profile_id, occurred_at desc)`; the
 * rows are never read, only counted.
 *
 * Returns null when the count is UNAVAILABLE — never 0. SEP-7: UNKNOWN is
 * not ZERO, and a broken counter that reported 0 would silently hand out an
 * unlimited allowance. The caller decides what an unknown count means; this
 * function refuses to guess.
 */
export async function countTranslationsUsed(profileId: string): Promise<number | null> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("usage_cost_events")
      .select("event_id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("event_type", "activity")
      .eq("feature_code", VACANCY_TRANSLATION_FEATURE_CODE)
      .eq("status", "success");
    if (error) {
      console.error("[vacancy-translation] allowance count failed", {
        message: (error.message ?? "unknown").slice(0, 200),
      });
      return null;
    }
    return count ?? null;
  } catch (err) {
    console.error("[vacancy-translation] allowance count failed", {
      message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
    return null;
  }
}

/**
 * The reader's allowance right now, resolved ENTIRELY from the session.
 *
 * It takes no arguments on purpose. An earlier shape accepted a profile id
 * and a plan key from the caller, which is exactly the shape that lets one
 * surface meter a different person by accident. Identity and plan come from
 * `getEffectiveEntitlements()` — the same server seam every other gated
 * feature uses — so a forged argument is not merely rejected, it cannot be
 * expressed.
 *
 * An UNAVAILABLE count (see above) is reported as `used: 0` with
 * `allowed: false` when enforcement is on — the cautious direction. We do
 * not know what they have spent, so we do not spend more on their behalf;
 * the ad stays readable in its own language, which is the point of rule 4.
 */
export async function translationAllowance(): Promise<TranslationAllowanceV1> {
  const ctx = await getEffectiveEntitlements();
  const planKey = ctx.effectivePlanKey;
  const limit = translationLimitFor(planKey);
  const enforced = ctx.enforced;

  // The plan boundary itself — the SAME server seam every gated feature uses.
  const included =
    (await hasFeature("vacancy_translations")) && entitlementAllows(ctx, "vacancy_translations");

  // CONFIGURED = the owner has set a real quantity AND the plan includes the
  // feature. Both halves matter: a plan carrying `false` is not configured,
  // and a plan the entitlement seam refuses is not either.
  const configured = limit !== null && included;
  const base = { profileId: ctx.profileId, configured, limit, enforced, planKey } as const;

  // Nobody signed in: nothing to meter and nothing to spend.
  if (!ctx.profileId) {
    return { ...base, used: 0, remaining: limit, allowed: false };
  }

  // UNCONFIGURED -> DISABLED. Today's state for every plan. Deliberately NOT
  // "unlimited": the owner has approved the model, not a quantity, so no new
  // rendering is authorised and nothing is sent anywhere. A rendering that
  // already exists is still served — it costs nothing and was already paid
  // for — so this removes a convenience, never the advertisement.
  if (!configured) {
    return { ...base, used: 0, remaining: null, allowed: false };
  }

  const used = await countTranslationsUsed(ctx.profileId);
  if (used === null) {
    return { ...base, used: 0, remaining: null, allowed: !enforced };
  }

  const remaining = Math.max(0, limit - used);
  // Counted always, enforced only when payments are on.
  return { ...base, used, remaining, allowed: !enforced || remaining > 0 };
}

/**
 * Record ONE accepted rendering against the reader's allowance.
 *
 * Called only after the translation path has accepted the rendering (rule
 * 1). Idempotent by primary key (rule 2): a duplicate is not an error and is
 * not reported as one.
 *
 * NEVER THROWS, and — unlike the cost ledger's best-effort write — the
 * caller is told whether it landed. A silent failure here would let one
 * person translate without limit, so the caller logs it; it still does not
 * withhold a rendering the vendor was already paid for, because charging a
 * person for a screen they never saw is the worse failure.
 */
export async function recordTranslationConsumed(input: {
  readonly profileId: string;
  readonly organizationId?: string | null;
  readonly storeId: string;
  readonly targetLocale: string;
  readonly sourceHash: string;
  readonly sourceLanguage: string;
  readonly planKey: string;
  readonly provider: string;
}): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("usage_cost_events").insert({
      event_id: translationEventId(
        input.profileId,
        input.storeId,
        input.targetLocale,
        input.sourceHash,
      ),
      occurred_at: new Date().toISOString(),
      // NOT `usage`: an entitlement fact, not money. The money for this run
      // is the vendor row written by lib/ai/run-agent-server.ts.
      event_type: "activity",
      status: "success",
      provider: input.provider.slice(0, 64),
      service: "vacancy_translation",
      // WHAT was rendered — never the ad's text, only its identity.
      resource: `${input.storeId}:${input.targetLocale}`.slice(0, 128),
      feature_code: VACANCY_TRANSLATION_FEATURE_CODE,
      plan_key: input.planKey.slice(0, 64),
      payer: "worker",
      profile_id: input.profileId,
      organization_id: input.organizationId ?? null,
      measures: { renderings: 1 },
      // `cost` deliberately omitted: this row is not money, and the table's
      // no-fabricated-zero CHECK exists precisely to stop a 0 being written
      // where an amount is unknown.
      metadata: {
        source_language: input.sourceLanguage.slice(0, 8),
        target_locale: input.targetLocale.slice(0, 8),
      },
    });
    if (error) {
      // 23505 = already recorded for this exact (person, ad, locale, hash).
      // That is rule 2 working, not a failure.
      if ((error as { code?: string }).code === "23505") return true;
      console.error("[vacancy-translation] allowance write failed", {
        message: (error.message ?? "unknown").slice(0, 200),
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[vacancy-translation] allowance write failed", {
      message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
    return false;
  }
}
