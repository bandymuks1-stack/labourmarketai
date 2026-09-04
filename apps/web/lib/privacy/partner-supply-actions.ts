"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import {
  CONSENT_LOCALES,
  PARTNER_SUPPLY_REPRESENTATION_V1,
  consentTextHash,
  type ConsentLocale,
} from "@/lib/privacy/consent-definitions";
import { createClient } from "@/lib/supabase/server";
import { WORKER_INTENT_STATES } from "@/lib/supply-bridge/first-party-signal-contract";

/**
 * Partner-network supply representation — server actions.
 *
 * TWO ACTS, NOT ONE, and the split is the point:
 *
 *   the CONSENT  — "you may represent me in the partner network" — is a legal
 *                  act against a versioned, hashed text, and it lands in the
 *                  append-only `privacy_consent_events` ledger like the two
 *                  purposes that came before it.
 *   the DECLARATION — "here is my current intent, where I may work, where I
 *                  agree to be offered, and which of contact / publication /
 *                  naming I permit" — is scope, and it lands in
 *                  `first_party_supply_declarations`.
 *
 * A declaration without the consent emits nothing: `first_party_supply_feed_v1`
 * joins on `partner_supply_representation_authorised`. That ordering is
 * deliberate — a person can fill in the form and still not be represented until
 * they have agreed to the text, and no code path can reverse it, because the
 * filter is in the database rather than here.
 *
 * HONEST DEGRADATION: before the migration is applied the RPCs are absent —
 * return `needs-migration`, never a fake success. A privacy control that
 * reports success while writing nothing is worse than one that is missing.
 */

const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST204"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function toConsentLocale(locale: string): ConsentLocale {
  return (CONSENT_LOCALES as readonly string[]).includes(locale)
    ? (locale as ConsentLocale)
    : "lt";
}

export type PartnerSupplyActionResult =
  | { kind: "ok" }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "stale-version" }
  | { kind: "invalid"; reason: string }
  | { kind: "error" };

export type PartnerSupplyConsentStatus =
  | "granted"
  | "withdrawn"
  | "granted_stale_version"
  | "not_set";

export interface PartnerSupplyState {
  kind: "ok" | "needs-migration" | "not-authed" | "error";
  consentStatus: PartnerSupplyConsentStatus;
  consentDecidedAt: string | null;
  consentVersion: string | null;
  /** Null when the person has never made a declaration. */
  declaration: {
    intentState: string | null;
    availableFrom: string | null;
    workAuthorisedCountries: string[];
    allowedMarkets: string[];
    allowedChannels: string[];
    contactAuthority: boolean;
    publicationAuthority: boolean;
    identityDisclosureAuthority: boolean;
    reconfirmedAt: string | null;
    validUntil: string | null;
    withdrawnAt: string | null;
    freshness: string | null;
  } | null;
  /** True only when BOTH the consent and a live declaration are in place. */
  representedNow: boolean;
}

function emptyState(kind: PartnerSupplyState["kind"]): PartnerSupplyState {
  return {
    kind,
    consentStatus: "not_set",
    consentDecidedAt: null,
    consentVersion: null,
    declaration: null,
    representedNow: false,
  };
}

export async function getMyPartnerSupplyState(): Promise<PartnerSupplyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyState("not-authed");

  const consent = await asAny(supabase).rpc(
    "current_partner_supply_representation_consent",
  );
  if (consent.error) {
    if (consent.error.code && ABSENT.has(consent.error.code)) {
      return emptyState("needs-migration");
    }
    return emptyState("error");
  }

  const declared = await asAny(supabase).rpc("my_first_party_supply_declaration");
  if (declared.error) {
    if (declared.error.code && ABSENT.has(declared.error.code)) {
      return emptyState("needs-migration");
    }
    return emptyState("error");
  }

  const d = declared.data ?? {};
  const hasDeclaration = typeof d.intentState === "string" && d.intentState !== "";
  const consentStatus = (consent.data?.status ?? "not_set") as PartnerSupplyConsentStatus;

  return {
    kind: "ok",
    consentStatus,
    consentDecidedAt:
      typeof consent.data?.decidedAt === "string" ? consent.data.decidedAt : null,
    consentVersion:
      typeof consent.data?.version === "string" ? consent.data.version : null,
    declaration: hasDeclaration
      ? {
          intentState: d.intentState ?? null,
          availableFrom: d.availableFrom ?? null,
          workAuthorisedCountries: Array.isArray(d.workAuthorisedCountries)
            ? (d.workAuthorisedCountries as string[])
            : [],
          allowedMarkets: Array.isArray(d.allowedMarkets)
            ? (d.allowedMarkets as string[])
            : [],
          allowedChannels: Array.isArray(d.allowedChannels)
            ? (d.allowedChannels as string[])
            : [],
          contactAuthority: d.contactAuthority === true,
          publicationAuthority: d.publicationAuthority === true,
          identityDisclosureAuthority: d.identityDisclosureAuthority === true,
          reconfirmedAt: d.reconfirmedAt ?? null,
          validUntil: d.validUntil ?? null,
          withdrawnAt: d.withdrawnAt ?? null,
          freshness: d.freshness ?? null,
        }
      : null,
    // Says what is TRUE right now, rather than what the person once chose:
    // consent granted at the current text version, a declaration that is not
    // withdrawn, and a validity window that has not run out.
    representedNow:
      consentStatus === "granted"
      && hasDeclaration
      && d.withdrawnAt === null
      && (d.freshness === "CURRENT" || d.freshness === "AGEING"),
  };
}

export async function grantPartnerSupplyRepresentation(input: {
  locale: string;
}): Promise<PartnerSupplyActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const def = PARTNER_SUPPLY_REPRESENTATION_V1;
  const { data, error } = await asAny(supabase).rpc(
    "grant_partner_supply_representation_consent",
    {
      p_version: def.version,
      p_hash: consentTextHash(def),
      p_locale: toConsentLocale(input.locale),
      p_source: "dashboard_privacy_screen",
    },
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) {
    if (data?.error === "stale_consent_version") return { kind: "stale-version" };
    return { kind: "error" };
  }
  revalidatePath("/", "layout");
  return { kind: "ok" };
}

export async function withdrawPartnerSupplyRepresentation(): Promise<PartnerSupplyActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase).rpc(
    "withdraw_partner_supply_representation_consent",
    { p_source: "dashboard_privacy_screen" },
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) return { kind: "error" };
  revalidatePath("/", "layout");
  return { kind: "ok" };
}

export interface SupplyDeclarationInput {
  intentState: string;
  availableFrom: string | null;
  workAuthorisedCountries: string[];
  allowedMarkets: string[];
  allowedChannels: string[];
  contactAuthority: boolean;
  publicationAuthority: boolean;
  identityDisclosureAuthority: boolean;
  /** How long the answer stays true. Sets the re-ask cadence. */
  validDays: number;
}

export async function upsertMySupplyDeclaration(
  input: SupplyDeclarationInput,
): Promise<PartnerSupplyActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  if (!(WORKER_INTENT_STATES as readonly string[]).includes(input.intentState)) {
    return { kind: "invalid", reason: "unknown_intent_state" };
  }

  const { data, error } = await asAny(supabase).rpc(
    "upsert_my_first_party_supply_declaration",
    {
      p_intent_state: input.intentState,
      p_available_from: input.availableFrom,
      p_work_authorised_countries: input.workAuthorisedCountries,
      p_allowed_markets: input.allowedMarkets,
      p_allowed_channels: input.allowedChannels,
      // Never defaulted to true anywhere in this chain. A caller that omits an
      // authority is a caller that was not told to grant it.
      p_contact_authority: input.contactAuthority === true,
      p_publication_authority: input.publicationAuthority === true,
      p_identity_disclosure_authority: input.identityDisclosureAuthority === true,
      p_valid_days: input.validDays,
    },
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) {
    return typeof data?.error === "string"
      ? { kind: "invalid", reason: data.error }
      : { kind: "error" };
  }
  revalidatePath("/", "layout");
  return { kind: "ok" };
}

export async function reconfirmMySupplyDeclaration(
  validDays: number,
): Promise<PartnerSupplyActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase).rpc(
    "reconfirm_my_first_party_supply_declaration",
    { p_valid_days: validDays },
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) {
    return typeof data?.error === "string"
      ? { kind: "invalid", reason: data.error }
      : { kind: "error" };
  }
  revalidatePath("/", "layout");
  return { kind: "ok" };
}

export async function withdrawMySupplyDeclaration(): Promise<PartnerSupplyActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase).rpc(
    "withdraw_my_first_party_supply_declaration",
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) return { kind: "error" };
  revalidatePath("/", "layout");
  return { kind: "ok" };
}
