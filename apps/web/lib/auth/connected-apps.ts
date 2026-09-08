/**
 * Connected apps — pure presentation logic (Train A slice 2, 2026-09-02).
 *
 * The data is GoTrue's own OAuth grant list (`supabase.auth.oauth.listGrants`):
 * one row per external client the person has approved on the consent screen
 * (ChatGPT, Claude, any future assistant — all adapters, none special-cased).
 * Nothing here is stored by us; revoking goes through
 * `supabase.auth.oauth.revokeGrant`, which GoTrue documents as: consent marked
 * revoked, the client's sessions deleted, its refresh tokens invalidated. The
 * still-valid access token is then refused at OUR door on its next call,
 * because /api/mcp verifies every bearer against the auth server (proven
 * 2026-09-02, docs/audits/…auth-onboarding-latency-db-audit-2026-09-02.md §A.3).
 *
 * PURE — no Next.js imports — so the shaping is unit-testable.
 */

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

/** Feedback codes the account page renders after a revoke round trip. */
export const CONNECTED_APPS_FEEDBACK = ["revoked", "error"] as const;
export type ConnectedAppsFeedback = (typeof CONNECTED_APPS_FEEDBACK)[number];

export function parseConnectedAppsFeedback(
  value: string | null | undefined,
): ConnectedAppsFeedback | null {
  return (CONNECTED_APPS_FEEDBACK as readonly string[]).includes(value ?? "")
    ? (value as ConnectedAppsFeedback)
    : null;
}
