import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * THE LOGGED-OUT INVITATION LANDING'S READ (universal network v1).
 *
 * A person who opens an invite link without an account must be able to see
 * WHAT they are being invited to before being asked to register — the old
 * page bounced them blind to login. This module is the only place that
 * read happens, and it is deliberately narrow:
 *
 *   - it calls `get_invitation_public_preview_v1`, executable by
 *     service_role ONLY (anon has nothing; the 20260722160000 closure
 *     stands), through the admin client — the same pattern the public lead
 *     funnel uses for its trusted server reads;
 *   - the function returns a fixed minimal object and this module re-applies
 *     the same allowlist, so a widened function can never widen the page:
 *     invitation kind, status, organization / project name, inviter name,
 *     capacity, campaign label, source slug, locale, expiry. NO addressee,
 *     NO personal message, NO demand details, NO declared context, NO ids;
 *   - the token from the URL is the only input and is never logged;
 *   - a missing function (migration not applied) reports `not_enabled` so
 *     the page falls back to the pre-existing behaviour (sign in first)
 *     rather than pretending the link is invalid.
 *
 * The read also records the funnel's OPENED stage — the one fact only this
 * door can observe — inside the function (`open_count`, `first_opened_at`)
 * and as an anonymous `invitation_opened` funnel event.
 */
export type PublicInvitationPreview = {
  readonly invitationType: string;
  readonly status: string;
  readonly organizationName: string | null;
  readonly projectTitle: string | null;
  readonly inviterName: string | null;
  readonly relationshipSlug: string | null;
  readonly campaignLabel: string | null;
  readonly externalSourceSlug: string | null;
  readonly locale: string | null;
  readonly expiresAt: string | null;
};

export type PublicPreviewResult =
  | { readonly kind: "ok"; readonly preview: PublicInvitationPreview }
  | { readonly kind: "not_found" }
  | { readonly kind: "not_enabled" }
  | { readonly kind: "unavailable" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient<any, any, any>): any {
  return c;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

export async function readPublicInvitationPreview(
  token: string,
): Promise<PublicPreviewResult> {
  if (!token || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return { kind: "not_found" };
  }
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { kind: "unavailable" };
  }
  const { data, error } = await asAny(admin).rpc("get_invitation_public_preview_v1", {
    p_token: token,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { kind: "not_enabled" };
    return { kind: "unavailable" };
  }
  if (!data || data.outcome !== "ok") return { kind: "not_found" };

  const preview: PublicInvitationPreview = {
    invitationType: str(data.invitation_type) ?? "join_platform",
    status: str(data.status) ?? "pending",
    organizationName: str(data.organization_name),
    projectTitle: str(data.project_title),
    inviterName: str(data.inviter_name),
    relationshipSlug: str(data.relationship_slug),
    campaignLabel: str(data.campaign_label),
    externalSourceSlug: str(data.external_source_slug),
    locale: str(data.locale),
    expiresAt: str(data.expires_at),
  };
  if (preview.status === "pending") {
    emitServerFunnelEvent(FUNNEL_EVENTS.invitationOpened, {
      source: "invitations",
      route: "/invite",
      metadata: {
        surface: "invite_page",
        entity_type: preview.invitationType,
        success: true,
      },
    });
  }
  return { kind: "ok", preview };
}
