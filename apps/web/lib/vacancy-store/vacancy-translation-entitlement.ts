import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveEntitlements, hasFeature } from "@/lib/billing/effective-entitlements";
import { entitlementAllows } from "@/lib/billing/entitlements-v1";
import { limitFor } from "@/lib/billing/entitlements";
import { PROVISIONAL_FREE_INCLUDED_TRANSLATIONS, getPlan } from "@/lib/billing/plans";

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
 *   3. THE FIGURE IS CONFIGURABLE, NOT INVENTED. The owner has not set the
 *      final commercial quota. {@link PROVISIONAL_FREE_INCLUDED_TRANSLATIONS} is a
 *      placeholder carried in the plan registry like every other limit, so
 *      setting the real number later is a one-line plan edit and touches no
 *      mechanism here.
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

/**
 * PROVISIONAL, and defined ONCE — in the plan registry beside every other
 * limit. The owner has explicitly NOT set the commercial quota ("Do NOT
 * invent the final commercial quota"); this re-export exists so the
 * translation code reads one name, and changing the figure stays a plan
 * edit rather than a rewrite. It is never presented to a person as a
 * commercial promise — the surface says how many remain, not what the
 * package is.
 */
export { PROVISIONAL_FREE_INCLUDED_TRANSLATIONS };

export interface TranslationAllowanceV1 {
  /** WHO the allowance belongs to, resolved from the SESSION — never from a
   *  caller-supplied argument. null = nobody is signed in. */
  readonly profileId: string | null;
  /** Included renderings for the reader's plan. Always a real figure —
   *  there is deliberately no "unlimited" value to fall into. */
  readonly limit: number;
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
 * The person's plan limit for translations. Pure.
 *
 * NEVER returns null for an unrecognised or incompletely-configured plan.
 * `limitFor` answers null both for "no numeric limit" and for "this plan
 * does not carry the key at all", and treating that null as UNLIMITED is
 * how a configuration gap silently becomes a free vendor budget. An unknown
 * plan falls back to the FREE included figure — the cautious direction.
 */
export function translationLimitFor(planKey: string): number {
  const plan = getPlan(planKey);
  if (!plan) return PROVISIONAL_FREE_INCLUDED_TRANSLATIONS;
  return limitFor(plan, "vacancy_translations") ?? PROVISIONAL_FREE_INCLUDED_TRANSLATIONS;
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

  const base = { profileId: ctx.profileId, limit, enforced, planKey } as const;

  // Nobody signed in: nothing to meter and nothing to spend.
  if (!ctx.profileId) {
    return { ...base, used: 0, remaining: limit, allowed: false };
  }
  if (enforced && !included) {
    return { ...base, used: 0, remaining: 0, allowed: false };
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
