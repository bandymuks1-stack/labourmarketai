import { isProductScope, type DoorProductGrant, type ProductScope } from "@/lib/mcp/scopes";

/**
 * THE DOOR'S READ OF THE PERSON'S RECORDED CHOICE (B3).
 *
 * `/api/mcp` asks the database, once per request and only when an OAuth
 * client calls a tool, what the person chose for THAT client:
 * `oauth_door_product_grant_v1()` (migration 20261026080400). The function
 * takes no argument — it derives both the person (`auth.uid()`) and the
 * client (`client_id`) from the verified JWT the call carries — so this code
 * cannot be pointed at another client or another person, and neither can the
 * client itself.
 *
 * The call runs on the caller's OWN client (the OAuth JWT, plus the B1b door
 * header once B1b lands). No service role.
 *
 * FAIL CLOSED. Any error, a missing function, or a shape this parser does
 * not recognise is `unavailable`, and the door refuses the tool call (it
 * never falls back to "unscoped"). The one fail-OPEN state, `none`, exists
 * only when the database positively says there is no row for this pair —
 * the legacy consents made before B3, governed by MCP_SCOPE_ENFORCEMENT.
 *
 * Pure parse + a thin reader; no Next.js imports, so it is unit-testable.
 */

/** The minimum of a Supabase client this module needs (the RPC is not in the generated types yet). */
export type RpcCapable = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export const DOOR_GRANT_RPC = "oauth_door_product_grant_v1" as const;

const UNAVAILABLE: DoorProductGrant = { state: "unavailable" };

/** The function's jsonb answer → a grant state. Anything unexpected is `unavailable`. */
export function parseDoorProductGrant(data: unknown): DoorProductGrant {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return UNAVAILABLE;
  const row = data as Record<string, unknown>;
  switch (row.state) {
    case "none":
      return { state: "none" };
    case "revoked":
      return { state: "revoked" };
    case "granted": {
      if (!Array.isArray(row.scopes) || !row.scopes.every((s) => typeof s === "string")) return UNAVAILABLE;
      // A name this build does not know is dropped: that can only NARROW.
      const scopes = (row.scopes as string[]).filter(isProductScope) as ProductScope[];
      return { state: "granted", scopes };
    }
    default:
      return UNAVAILABLE;
  }
}

/** One read through the caller's own client. Never throws. */
export async function readDoorProductGrant(supabase: unknown): Promise<DoorProductGrant> {
  try {
    const { data, error } = await (supabase as RpcCapable).rpc(DOOR_GRANT_RPC);
    if (error) return UNAVAILABLE;
    return parseDoorProductGrant(data);
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * Memoised for ONE request: the first tool call pays the read, later calls in
 * the same request reuse it, and `tools/list` or `initialize` pay nothing.
 * A new request always reads again, so a change in Connected apps applies to
 * the client's next call. Never cached across requests.
 */
export function productGrantForRequest(supabase: unknown): () => Promise<DoorProductGrant> {
  let pending: Promise<DoorProductGrant> | null = null;
  return () => (pending ??= readDoorProductGrant(supabase));
}
