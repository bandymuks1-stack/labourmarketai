"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  PROFILE_DISCOVERABILITY_DEFAULT_NOTICE_V1,
  PROFILE_DISCOVERABILITY_V1,
  consentTextHash,
} from "@/lib/privacy/consent-definitions";
import { toConsentLocale } from "@/lib/privacy/discoverability-view";
import { discoverabilityConsentSourceOf } from "@/lib/privacy/employer-visibility";

/**
 * Profile-discoverability consent — server actions.
 *
 * Rules enforced here + in the SECURITY DEFINER RPCs
 * (20260711130000_privacy_consent_and_disclosure_v1.sql):
 * - the acting user is ALWAYS auth.uid() — no user id parameter exists;
 * - the grant carries the registry's CURRENT version + hash; the RPC
 *   rejects stale versions (fail closed);
 * - default state is NOT granted; declining performs NO server write;
 * - withdrawal is always accepted and takes effect immediately (the RLS
 *   predicate reads the newest ledger row);
 * - HONEST DEGRADATION: before the migration is applied the RPCs are
 *   absent — return kind:"needs-migration", never a fake success.
 */

const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST204"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

// The consent locale (PL falls back to English, never Lithuanian) is the ONE
// `toConsentLocale` in discoverability-view.ts, shared with every surface
// that renders the consent.

export type DiscoverabilityStatus =
  | "granted"
  | "withdrawn"
  | "granted_stale_version"
  | "not_set"
  /** 20261025100000: a free worker who never decided, the switch armed and
   *  the default notice on record — discoverable by DEFAULT (not a consent). */
  | "default_on"
  /** As `default_on`, but an existing account's notice period is running. */
  | "default_pending";

/**
 * THE THREE CHOICE STATES (owner 2026-10-25), from the ONE ledger: a person
 * who never decided is NOT_ASKED — never a refusal; a withdrawal or a recorded
 * "not now" is EXPLICITLY_DISABLED and is never switched on by any default; a
 * grant is EXPLICITLY_ENABLED. Before 20261025100000 the database does not
 * return it, so it is derived from the status (a "not now" was not recorded
 * then and cannot be told apart from never asked).
 */
export type DiscoverabilityChoice = "not_asked" | "explicitly_disabled" | "explicitly_enabled";

export interface DiscoverabilityState {
  kind: "ok" | "needs-migration" | "not-authed" | "error";
  status: DiscoverabilityStatus;
  decidedAt: string | null;
  version: string | null;
  /** Optional so every older constructor keeps compiling; readers default it. */
  choice?: DiscoverabilityChoice;
  /** The default notice is due for this person (switch armed, free worker, never decided). */
  noticeDue?: boolean;
  /** Why the default does or does not apply (null once the person decided). */
  defaultScope?: "free" | "employed" | "learner" | null;
  /** When the default makes this person discoverable (notice + any notice period). */
  defaultFrom?: string | null;
}

const STATUSES: readonly DiscoverabilityStatus[] = [
  "granted",
  "withdrawn",
  "granted_stale_version",
  "not_set",
  "default_on",
  "default_pending",
];

function choiceOf(status: DiscoverabilityStatus, raw: unknown): DiscoverabilityChoice {
  if (raw === "not_asked" || raw === "explicitly_disabled" || raw === "explicitly_enabled") return raw;
  if (status === "granted" || status === "granted_stale_version") return "explicitly_enabled";
  if (status === "withdrawn") return "explicitly_disabled";
  return "not_asked";
}

export async function getMyDiscoverabilityState(): Promise<DiscoverabilityState> {
  const empty = (kind: DiscoverabilityState["kind"]): DiscoverabilityState => ({
    kind,
    status: "not_set",
    decidedAt: null,
    version: null,
  });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty("not-authed");

  const { data, error } = await asAny(supabase).rpc(
    "current_profile_discoverability_consent",
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return empty("needs-migration");
    return empty("error");
  }
  // An unrecognised status is UNKNOWN (SEP-7), never silently "not set".
  const rawStatus: unknown = data?.status ?? "not_set";
  if (typeof rawStatus !== "string" || !(STATUSES as readonly string[]).includes(rawStatus)) {
    return empty("error");
  }
  const status = rawStatus as DiscoverabilityStatus;
  const scope: unknown = data?.defaultScope;
  return {
    kind: "ok",
    status,
    decidedAt: typeof data?.decidedAt === "string" ? data.decidedAt : null,
    version: typeof data?.version === "string" ? data.version : null,
    choice: choiceOf(status, data?.choice),
    noticeDue: data?.noticeDue === true,
    defaultScope: scope === "free" || scope === "employed" || scope === "learner" ? scope : null,
    defaultFrom: typeof data?.defaultFrom === "string" ? data.defaultFrom : null,
  };
}

export type ConsentActionResult =
  | { kind: "ok" }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "stale-version" }
  | { kind: "error" };

export async function grantProfileDiscoverability(input: {
  locale: string;
  /** Which surface the person decided on — mapped onto the closed set
   *  (`DISCOVERABILITY_CONSENT_SOURCES`); anything else records the screen. */
  source?: string;
}): Promise<ConsentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const def = PROFILE_DISCOVERABILITY_V1;
  const { data, error } = await asAny(supabase).rpc(
    "grant_profile_discoverability_consent",
    {
      p_version: def.version,
      p_hash: consentTextHash(def),
      p_locale: toConsentLocale(input.locale),
      p_source: discoverabilityConsentSourceOf(input.source),
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

export async function withdrawProfileDiscoverability(input?: {
  source?: string;
}): Promise<ConsentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase).rpc(
    "withdraw_profile_discoverability_consent",
    { p_source: discoverabilityConsentSourceOf(input?.source) },
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) return { kind: "error" };
  revalidatePath("/", "layout");
  return { kind: "ok" };
}

/**
 * "Not now" — recorded as a DECISION (20261025100000), so it is never mistaken
 * for "never asked" and no default ever switches it on. Before that migration
 * the RPC is absent and the decline stays what it always was: local only,
 * nothing written (`needs-migration` — the screen shows the same result).
 */
export async function declineProfileDiscoverability(input: {
  locale: string;
  source?: string;
}): Promise<ConsentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  const { data, error } = await asAny(supabase).rpc("decline_profile_discoverability_v1", {
    p_locale: toConsentLocale(input.locale),
    p_source: discoverabilityConsentSourceOf(input.source),
  });
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) return { kind: "error" };
  revalidatePath("/", "layout");
  return { kind: "ok" };
}

/**
 * The default-visibility notice was on the person's screen — recorded in the
 * ledger as `notice_shown` with the registry's notice version + hash (the RPC
 * rejects any other text). Called ONLY by the consent component while it shows
 * the notice. It decides nothing: the default then applies by the database
 * rule (switch armed, free worker, never decided). Absent RPC → needs-migration.
 */
export async function recordVisibilityDefaultNotice(input: {
  locale: string;
  source?: string;
}): Promise<ConsentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  const def = PROFILE_DISCOVERABILITY_DEFAULT_NOTICE_V1;
  const { data, error } = await asAny(supabase).rpc("record_visibility_default_notice_v1", {
    p_version: def.version,
    p_hash: consentTextHash(def),
    p_locale: toConsentLocale(input.locale),
    p_source: discoverabilityConsentSourceOf(input.source),
  });
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) {
    if (data?.error === "stale_notice_version") return { kind: "stale-version" };
    return { kind: "error" };
  }
  revalidatePath("/", "layout");
  return { kind: "ok" };
}

export interface ConsentHistoryRow {
  id: string;
  purpose: string;
  action: string;
  version: string;
  locale: string;
  source: string;
  createdAt: string;
  recipientOrganizationId: string | null;
  contextType: string | null;
  selectedFields: string[] | null;
}

/**
 * The history read, with FAILED kept apart from EMPTY (SEP-7).
 *
 * It used to return `[]` on any error, and the privacy screen rendered that
 * `[]` as "no consent events yet" and "no transfers yet" — a statement about
 * the person's own legal record made from a failed query (the
 * swallowed-read-error class). A person who HAD granted discoverability, or
 * had a disclosure on file, was told they had none.
 */
export type ConsentHistoryResult =
  | { kind: "ok"; rows: ConsentHistoryRow[] }
  | { kind: "not-authed" }
  | { kind: "failed" };

/** The caller's OWN append-only consent history (RLS: user_id = auth.uid()).
 *  Never fabricated: a failed read is `failed`, never an empty list. */
export async function getMyConsentHistory(): Promise<ConsentHistoryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase).rpc("my_privacy_consent_history");
  if (error || !Array.isArray(data)) return { kind: "failed" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: ConsentHistoryRow[] = (data as any[]).map((r) => ({
    id: String(r.id),
    purpose: String(r.purpose),
    action: String(r.action),
    version: String(r.consent_text_version),
    locale: String(r.locale),
    source: String(r.source),
    createdAt: String(r.created_at),
    recipientOrganizationId: r.recipient_organization_id
      ? String(r.recipient_organization_id)
      : null,
    contextType: r.context_type ? String(r.context_type) : null,
    selectedFields: Array.isArray(r.selected_fields)
      ? (r.selected_fields as string[])
      : null,
  }));
  return { kind: "ok", rows };
}
