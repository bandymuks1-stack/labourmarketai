import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import type { Database } from "@/lib/supabase/types";

/**
 * CANONICAL CAPABILITY CONTRACT — the vendor-neutral vocabulary every
 * non-browser client speaks.
 *
 * A capability is ONE domain action with a stable id (`profile.get`,
 * `journal.create_draft`), a typed input, and a handler that runs AS THE
 * CALLER — it receives the caller's own RLS-scoped client from the canonical
 * identity boundary (`lib/api/api-identity.ts`) and re-implements no
 * authority. This is the same separation the conversation action registry
 * draws ("the LLM may only PROPOSE an id from this registry"), lifted to the
 * transport level: an external client (ChatGPT, a future agent) calls a
 * capability, never a table and never a second product.
 *
 * The ChatGPT/MCP adapter (`lib/mcp/`, `app/api/mcp/route.ts`) is a THIN
 * translation of this contract and is replaceable without touching it.
 *
 * WRITE SEMANTICS (§10 of the apps train): reads answer; consequential writes
 * are split `draft` → `confirm` so natural-language ambiguity can never
 * bypass product confirmation. A `draft` changes nothing and returns a
 * preview plus a one-time confirmation token; only `confirm`/`execute` may
 * touch the database.
 */

export type CapabilityKind = "read" | "draft" | "confirm" | "execute";

/**
 * Honest MCP-style behavior hints, declared per capability IN REVIEW — the
 * adapter emits them verbatim as MCP tool `annotations` so an external client
 * (ChatGPT, Claude, any MCP host) can tell a read from a write without
 * parsing prose. They are hints for clients, never authority: the server
 * still enforces kind/draft→confirm/RLS regardless of what a client assumes.
 *
 * All four fields are REQUIRED so a new capability cannot ship with the MCP
 * spec's dangerous defaults (destructiveHint defaults to true, openWorldHint
 * to true) by omission — every hint is a reviewed, explicit claim.
 */
export type CapabilityAnnotations = {
  /** True when the handler modifies nothing (reads and token-minting drafts). */
  readonly readOnlyHint: boolean;
  /** True only if the capability can destroy/overwrite data. Append-only
   *  writes are NOT destructive. */
  readonly destructiveHint: boolean;
  /** True when repeating the same call with the same arguments has no
   *  additional effect (reads; one-time-token confirms). */
  readonly idempotentHint: boolean;
  /** True only if the capability reaches outside the product's own domain
   *  (none do today). */
  readonly openWorldHint: boolean;
};

/** How the caller authenticated. Diagnostics only — a capability MUST NOT
 *  branch authority on it (RLS already decided WHAT the caller may do). */
export type CapabilityTransport = "cookie" | "bearer";

export type CapabilityCaller = {
  readonly userId: string;
  readonly transport: CapabilityTransport;
  /** The caller's own client. Every query is RLS-scoped as the caller. */
  readonly supabase: SupabaseClient<Database>;
  /** BCP-47-ish locale for human-facing strings; capability data itself is
   *  locale-independent facts. */
  readonly locale: string;
};

export type CapabilityDescriptor = {
  readonly id: string;
  readonly kind: CapabilityKind;
  /**
   * G4 bridge: the conversation-action this capability is the external face
   * of (an id from `lib/conversation/action-registry.ts`). Present on every
   * capability that bridges a schema'd conversation write — it declares, in
   * review, that BOTH transports run the same schema, the same confirmation
   * tier, and the same domain core (guard-checked). Absent on reads and on
   * capabilities with no conversation counterpart.
   */
  readonly conversationActionId?: string;
  /** Shown to external clients (an MCP tool description). Honest, concrete. */
  readonly title: string;
  readonly description: string;
  /**
   * Whether the external adapter may LIST this capability to clients.
   * A capability can exist, be tested, and stay unexposed — the honest gate
   * pattern (`DOMAIN_TRANSPORT_STATUS`) at capability granularity. Exposing
   * a capability is a product decision made here, in code review.
   */
  readonly exposed: boolean;
  readonly annotations: CapabilityAnnotations;
  readonly inputSchema: z.ZodTypeAny;
  readonly run: (
    caller: CapabilityCaller,
    input: unknown,
  ) => Promise<ExecResult>;
};
