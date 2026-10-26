import {
  grantCovers,
  normalizeProductScopes,
  requestedProductScopes,
  type ProductScope,
} from "@/lib/mcp/scopes";

/**
 * THE PERSON'S OWN SIDE OF THE PRODUCT GRANT (B3) — consent screen and
 * Connected apps.
 *
 * Thin wrappers over the three SECURITY DEFINER functions of migration
 * 20261026080400, called on the person's OWN session (cookie client). Each
 * function refuses any caller whose JWT carries `client_id`, so an OAuth
 * client can never reach these writes, not even with the person's token.
 *
 *   grant_oauth_product_scopes_v1  record / change / re-grant a choice
 *   revoke_oauth_product_grant_v1  withdraw it (legacy consent → revoked marker)
 *   read_oauth_product_grant_v1    the person's own rows; can resolve the
 *                                  client of an authorization bound to them
 *
 * The pure decision helpers (`chooserNeeded`, `parseOwnGrantRows`) carry the
 * rules and are unit-tested without a database. No Next.js imports.
 */

/** Minimal client shape (the functions are not in the generated types yet). */
export type RpcCapable = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/** One row of `read_oauth_product_grant_v1`, validated. */
export type OwnProductGrant = {
  readonly clientId: string;
  readonly clientName: string | null;
  /** Active choice (`has_grant`): a row exists and is not revoked. */
  readonly hasGrant: boolean;
  /** The recorded scopes; `[]` when none or revoked. */
  readonly scopes: readonly ProductScope[];
  readonly revoked: boolean;
  /** GoTrue still holds an active consent for this client. */
  readonly hasActiveConsent: boolean;
  /** Only when resolved from an authorization: the raw scope string the client asked for. */
  readonly requestedScope: string | null;
  readonly updatedAt: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate the function's rows. A malformed row is dropped, never guessed. */
export function parseOwnGrantRows(data: unknown): OwnProductGrant[] {
  if (!Array.isArray(data)) return [];
  const out: OwnProductGrant[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.client_id !== "string" || !UUID_RE.test(r.client_id)) continue;
    const revoked = typeof r.revoked_at === "string";
    const hasGrant = r.has_grant === true;
    out.push({
      clientId: r.client_id,
      clientName: typeof r.client_name === "string" && r.client_name.trim() ? r.client_name.slice(0, 120) : null,
      hasGrant,
      scopes: hasGrant && Array.isArray(r.scopes) ? normalizeProductScopes(r.scopes) : [],
      revoked,
      hasActiveConsent: r.has_active_consent === true,
      requestedScope: typeof r.requested_scope === "string" ? r.requested_scope : null,
      updatedAt: typeof r.updated_at === "string" ? r.updated_at : null,
    });
  }
  return out;
}

export type ReadResult = { readonly ok: true; readonly rows: OwnProductGrant[] } | { readonly ok: false };

export async function readOwnProductGrants(
  supabase: unknown,
  by: { clientId?: string; authorizationId?: string } = {},
): Promise<ReadResult> {
  try {
    const { data, error } = await (supabase as RpcCapable).rpc("read_oauth_product_grant_v1", {
      p_client_id: by.clientId ?? null,
      p_authorization_id: by.authorizationId ?? null,
    });
    if (error) return { ok: false };
    return { ok: true, rows: parseOwnGrantRows(data) };
  } catch {
    return { ok: false };
  }
}

export type WriteResult = { readonly ok: true } | { readonly ok: false; readonly code: string | null };

function errorCode(error: unknown): string | null {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

export async function grantProductScopes(
  supabase: unknown,
  input: { clientId: string; scopes: readonly ProductScope[]; copyVersion: string; authorizationId?: string },
): Promise<WriteResult> {
  try {
    const { error } = await (supabase as RpcCapable).rpc("grant_oauth_product_scopes_v1", {
      p_client_id: input.clientId,
      p_scopes: [...input.scopes],
      p_copy_version: input.copyVersion,
      p_authorization_id: input.authorizationId ?? null,
    });
    return error ? { ok: false, code: errorCode(error) } : { ok: true };
  } catch {
    return { ok: false, code: null };
  }
}

export async function revokeProductGrant(supabase: unknown, clientId: string): Promise<WriteResult> {
  try {
    const { error } = await (supabase as RpcCapable).rpc("revoke_oauth_product_grant_v1", { p_client_id: clientId });
    return error ? { ok: false, code: errorCode(error) } : { ok: true };
  } catch {
    return { ok: false, code: null };
  }
}

/**
 * GoTrue answered "already consented" (auto-skip). May the person pass
 * straight through, or must they see the chooser?
 *
 *   no recorded choice (legacy, or never chosen)        → chooser
 *   choice withdrawn                                    → chooser
 *   the client asks for product scopes not yet granted  → chooser
 *   otherwise                                           → straight through
 *
 * `row` undefined means the authorization could not be resolved for this
 * person: the caller shows the honest "could not be resolved" state.
 */
export function chooserNeeded(row: OwnProductGrant): boolean {
  if (!row.hasGrant) return true;
  return !grantCovers(row.scopes, requestedProductScopes(row.requestedScope));
}

/**
 * Which boxes start ticked. Least privilege: NOTHING is pre-ticked on a new
 * connection — the person ticks each permission, or presses the one link
 * that ticks the four "see" permissions (`preset=read`). The only state that
 * pre-ticks is the person's own earlier, still-active choice.
 */
export function initialSelection(input: {
  activeGrant: readonly ProductScope[] | null;
  preset: "read" | null;
  readPreset: readonly ProductScope[];
}): ProductScope[] {
  if (input.preset === "read") return normalizeProductScopes([...(input.activeGrant ?? []), ...input.readPreset]);
  return normalizeProductScopes([...(input.activeGrant ?? [])]);
}
