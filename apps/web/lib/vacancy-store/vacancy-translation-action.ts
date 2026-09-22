"use server";

import { getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveEntitlements } from "@/lib/billing/effective-entitlements";
import { getPublicVacancyById } from "@/lib/vacancy-store/vacancy-read";
import { translateVacancyOnDemand } from "@/lib/vacancy-store/vacancy-translation-read";
import type { TranslateVacancyActionResultV1 } from "@/lib/vacancy-store/vacancy-translation-contract";

/**
 * "TRANSLATE THIS ADVERTISEMENT" — the one door from a person's explicit
 * request to the metered translation path (owner decision 2026-09-22).
 *
 * WHY AN ACTION AND NOT A READ. Under the retired policy the board
 * translated as a SIDE EFFECT of rendering, which meant a page view could
 * spend money and send text to a provider without anyone asking. The owner
 * replaced that with an explicit act, so the trigger is an explicit act:
 * a person, signed in, pressing a control on ONE advertisement.
 *
 * WHAT THIS FILE IS ALLOWED TO DECIDE: nothing. Identity comes from the
 * session, the plan from `getEffectiveEntitlements`, the allowance from the
 * entitlement module, the egress decision from the AI runtime's gate. This
 * is plumbing between them, and it refuses anonymous callers outright —
 * there is no identity to meter, and a public page must never be able to
 * run up a bill.
 */
export async function translateVacancyAction(
  vacancyId: string,
): Promise<TranslateVacancyActionResultV1> {
  const [locale, entitlements] = await Promise.all([
    getLocale(),
    getEffectiveEntitlements(),
  ]);
  // No session → no identity to meter, no allowance to spend, no call.
  if (!entitlements.profileId) return { kind: "signed_out" };

  const supabase = await createClient();
  const found = await getPublicVacancyById(supabase, vacancyId);
  if (found.status !== "ok") return { kind: "not_found" };

  const result = await translateVacancyOnDemand(found.vacancy, locale);

  switch (result.kind) {
    case "ready":
      return {
        kind: "ready",
        title: result.translation.title,
        description: result.translation.description,
        sourceLanguage: result.translation.sourceLanguage,
        targetLocale: locale,
        provider: result.translation.provider,
        remaining: result.allowance?.remaining ?? null,
        limit: result.allowance?.limit ?? null,
        enforced: result.allowance?.enforced,
      };
    case "over_allowance":
      return {
        kind: "over_allowance",
        remaining: result.allowance.remaining,
        limit: result.allowance.limit,
        enforced: result.allowance.enforced,
      };
    case "unavailable":
      return {
        kind: "unavailable",
        reason: result.reason,
        remaining: result.allowance?.remaining ?? null,
        limit: result.allowance?.limit ?? null,
        enforced: result.allowance?.enforced,
      };
    case "not_needed":
      return { kind: "not_needed" };
  }
}
