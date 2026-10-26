/**
 * Connected apps — pure presentation logic (Train A slice 2, 2026-09-02).
 *
 * The data is GoTrue's own OAuth grant list (`supabase.auth.oauth.listGrants`):
 * one row per external client the person has approved on the consent screen
 * (ChatGPT, Claude, any future assistant — all adapters, none special-cased).
 * The connection list itself is not mirrored by us; revoking goes through
 * `supabase.auth.oauth.revokeGrant`, which GoTrue documents as: consent marked
 * revoked, the client's sessions deleted, its refresh tokens invalidated. The
 * still-valid access token is then refused at OUR door on its next call,
 * because /api/mcp verifies every bearer against the auth server (proven
 * 2026-09-02, docs/audits/…auth-onboarding-latency-db-audit-2026-09-02.md §A.3).
 *
 * B3: each app is joined with the person's own recorded permission choice
 * (`public.oauth_product_grants`, read through read_oauth_product_grant_v1).
 *
 * PURE — no Next.js imports — so the shaping is unit-testable.
 */

import type { OwnProductGrant } from "@/lib/auth/oauth-product-grants";
import type { ProductScope } from "@/lib/mcp/scopes";

/** The subset of GoTrue's `OAuthGrant` the surface renders. */
export type ConnectedAppGrant = {
  readonly client: {
    readonly id: string;
    readonly name?: string | null;
    readonly uri?: string | null;
    readonly logo_uri?: string | null;
  };
  readonly scopes?: readonly string[] | null;
  readonly granted_at?: string | null;
};

export type ConnectedAppView = {
  readonly clientId: string;
  /** Client name as registered with GoTrue, or null when it registered none —
   *  the UI then shows an honest "unnamed application" label, never a guess. */
  readonly name: string | null;
  /** Registered website, only when it parses as an http(s) URL. */
  readonly website: string | null;
  readonly scopes: readonly string[];
  /** ISO timestamp of the grant, or null when GoTrue sent none. */
  readonly grantedAt: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A GoTrue client id is a UUID. The revoke action refuses anything else so
 *  a crafted form value can never reach the auth server. */
export function isOauthClientId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function cleanText(value: string | null | undefined, max = 120): string | null {
  if (typeof value !== "string") return null;
  // Control characters stripped, length capped — the name is rendered as text
  // (React escapes it), but it also lands in confirmation copy.
  const t = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return t.length === 0 ? null : t.slice(0, max);
}

/** Shape GoTrue grants for rendering: newest first, unusable rows dropped. */
export function presentConnectedApps(
  grants: readonly ConnectedAppGrant[] | null | undefined,
): ConnectedAppView[] {
  if (!grants) return [];
  const rows: ConnectedAppView[] = [];
  for (const g of grants) {
    if (!g || !isOauthClientId(g.client?.id)) continue;
    const scopes = Array.isArray(g.scopes)
      ? g.scopes.filter((s): s is string => typeof s === "string" && s.length > 0)
      : [];
    const grantedAt =
      typeof g.granted_at === "string" && !Number.isNaN(Date.parse(g.granted_at))
        ? g.granted_at
        : null;
    rows.push({
      clientId: g.client.id,
      name: cleanText(g.client.name),
      website: safeHttpUrl(g.client.uri),
      scopes,
      grantedAt,
    });
  }
  rows.sort((a, b) => {
    const ta = a.grantedAt ? Date.parse(a.grantedAt) : 0;
    const tb = b.grantedAt ? Date.parse(b.grantedAt) : 0;
    return tb - ta;
  });
  return rows;
}

/**
 * B3 — what the person chose for one connected app, as the surface shows it.
 *
 *   granted   a recorded choice (possibly no permission at all)
 *   legacy    connected before per-permission choices existed: no recorded
 *             choice. What it may do depends on MCP_SCOPE_ENFORCEMENT, and
 *             the surface says so in plain words.
 *   revoked   withdrawn (the GoTrue grant normally disappears with it)
 *   unknown   the choices could not be read — never shown as "none"
 */
export type ProductPermissionView =
  | { readonly state: "granted"; readonly scopes: readonly ProductScope[] }
  | { readonly state: "legacy" }
  | { readonly state: "revoked" }
  | { readonly state: "unknown" };

export type ConnectedAppWithPermissions = ConnectedAppView & { readonly permissions: ProductPermissionView };

/** Join GoTrue's grant list with the person's own recorded choices. */
export function attachProductPermissions(
  apps: readonly ConnectedAppView[],
  own: { readonly ok: true; readonly rows: readonly OwnProductGrant[] } | { readonly ok: false },
): ConnectedAppWithPermissions[] {
  return apps.map((app) => {
    if (!own.ok) return { ...app, permissions: { state: "unknown" } as const };
    const row = own.rows.find((r) => r.clientId.toLowerCase() === app.clientId.toLowerCase());
    if (!row) return { ...app, permissions: { state: "legacy" } as const };
    if (!row.hasGrant) return { ...app, permissions: { state: "revoked" } as const };
    return { ...app, permissions: { state: "granted", scopes: row.scopes } as const };
  });
}

/** Feedback codes the account page renders after a revoke or permissions round trip. */
export const CONNECTED_APPS_FEEDBACK = ["revoked", "error", "permissions_saved", "none_selected"] as const;
export type ConnectedAppsFeedback = (typeof CONNECTED_APPS_FEEDBACK)[number];

export function parseConnectedAppsFeedback(
  value: string | null | undefined,
): ConnectedAppsFeedback | null {
  return (CONNECTED_APPS_FEEDBACK as readonly string[]).includes(value ?? "")
    ? (value as ConnectedAppsFeedback)
    : null;
}
