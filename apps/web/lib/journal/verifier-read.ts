import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  resolveVerifierOptions,
  type VerifierContextFacts,
  type VerifierResolution,
} from "@/lib/journal/work-verification-state";

/**
 * "KAM PATEIKTI ATLIKTĄ DARBĄ?" — the read behind the answer.
 *
 * Resolves who could actually confirm the caller's work, from the caller's OWN
 * engagement contexts under their own RLS. No service role, no cross-tenant
 * read, no inference: an organization appears here only because the person
 * genuinely holds an active relationship with it.
 *
 * The rule lives in `work-verification-state.resolveVerifierOptions`, which is
 * pure and tested; this function only supplies it with real rows and attaches
 * the organization names needed to say the answer out loud.
 *
 * FAILURE IS NAMED, NEVER AN EMPTY ANSWER (§54). If the contexts cannot be
 * read, `unavailable` is true and the caller must say so — "we could not check"
 * is a different sentence from "nobody can confirm your work", and showing the
 * second when the first is true is the defect this whole slice exists to end.
 */

/** Relationships in which a person performs work for an organization. */
const WORK_RELATIONSHIPS = [
  "employee",
  "contractor",
  "agency_worker",
  "owner",
  "founder",
  "sole_trader",
] as const;

export interface VerifierOption {
  readonly organizationId: string;
  /** Real display/legal name, or null when the organization has neither. */
  readonly organizationName: string | null;
  /** Can someone there confirm work today? Drives the honest next action. */
  readonly confirmationEnabled: boolean;
}

export interface VerifierAnswer {
  readonly resolution: VerifierResolution;
  /** Named organizations behind the resolution, for the sentence itself. */
  readonly options: readonly VerifierOption[];
  /** True when the contexts could not be read at all — UNKNOWN, not "none". */
  readonly unavailable: boolean;
}

export async function resolveMyVerifiers(): Promise<VerifierAnswer> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { resolution: { kind: "none" }, options: [], unavailable: true };

  const { data, error } = await supabase
    .from("engagement_contexts")
    .select(
      "id, relationship_slug, organization_id, status, journal_review_enabled, organizations(display_name, legal_name)",
    )
    .eq("profile_id", user.id)
    .eq("status", "active")
    .in("relationship_slug", [...WORK_RELATIONSHIPS]);

  // A read error is UNKNOWN. Returning `none` here would tell a person with a
  // real employer that nobody can confirm their work — a lie produced by an
  // outage.
  if (error) return { resolution: { kind: "none" }, options: [], unavailable: true };

  const rows = data ?? [];
  const facts: VerifierContextFacts[] = rows.map((r) => {
    const row = r as {
      relationship_slug: string;
      organization_id: string | null;
      status: string | null;
      journal_review_enabled: boolean | null;
    };
    return {
      organizationId: row.organization_id,
      journalReviewEnabled: row.journal_review_enabled === true,
      relationshipSlug: row.relationship_slug,
      status: row.status ?? "active",
    };
  });

  const resolution = resolveVerifierOptions(facts);

  // Name only the organizations the resolution actually points at, so the
  // answer can never mention an organization the rule did not choose.
  const named = new Set<string>(
    resolution.kind === "organization" || resolution.kind === "self"
      ? [resolution.organizationId]
      : resolution.kind === "choice"
        ? resolution.organizationIds
        : [],
  );

  const seen = new Map<string, VerifierOption>();
  for (const r of rows) {
    const row = r as {
      organization_id: string | null;
      journal_review_enabled: boolean | null;
      organizations?: { display_name?: string | null; legal_name?: string | null } | null;
    };
    const id = row.organization_id;
    if (!id || !named.has(id)) continue;
    const org = row.organizations ?? null;
    const name =
      (org?.display_name?.trim() || org?.legal_name?.trim() || null) ?? null;
    const prev = seen.get(id);
    seen.set(id, {
      organizationId: id,
      organizationName: name ?? prev?.organizationName ?? null,
      // Any active relationship at that organization with review enabled means
      // confirmation is reachable there.
      confirmationEnabled:
        (prev?.confirmationEnabled ?? false) || row.journal_review_enabled === true,
    });
  }

  return { resolution, options: [...seen.values()], unavailable: false };
}
