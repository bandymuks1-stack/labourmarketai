import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * THE SHARED EXECUTION CONTRACT (chat-first audit gap G4, bridge v1).
 *
 * One caller shape every transport can construct, so a domain core written
 * once serves the web (cookie session), the MCP adapter (bearer), the mobile
 * client (same bearer boundary), and any future AI actor — WITHOUT the core
 * knowing which one is calling.
 *
 * `DomainCaller` is deliberately the smallest thing that works:
 *  - `supabase` — the CALLER'S OWN RLS-scoped client, resolved by the
 *    transport boundary (cookie: `lib/supabase/server`; bearer:
 *    `lib/api/api-identity`). A core re-implements no authority: RLS and the
 *    existing ownership checks decide what the caller may read or write.
 *    Service-role clients MUST NOT be passed here — the bridge coordinates
 *    execution, it never grants authority.
 *  - `userId` — the authenticated subject, already verified by that boundary.
 *  - `locale` — optional, for the few cores that produce human-facing
 *    strings; facts-only cores ignore it.
 *
 * `CapabilityCaller` (lib/capabilities/contract.ts) is structurally a
 * DomainCaller (plus transport diagnostics), so capability handlers pass
 * straight through. Cookie-side wrappers construct one from the request-
 * cached client + `auth.getUser()` they already hold.
 *
 * ── THE RESULT ENVELOPE (G4 §4) — a reconciliation, not a new model ───────
 *
 * The repo already carries every field the bridge needs; this table is the
 * canonical mapping, and no second competing envelope may be introduced:
 *
 *  - status                → `ExecResult` (`ok: true` | `ok: false` + `code`,
 *                            `message`) — lib/conversation/executor-contract.
 *                            Blocked / partial / not-implemented outcomes are
 *                            explicit codes, never fabricated success.
 *  - machineData           → `ExecResult.data` — raw structured facts,
 *                            preserved verbatim for clients.
 *  - humanSummary          → lib/capabilities/presentation.ts — ADDITIVE
 *                            localized summary next to (never instead of)
 *                            the data; plain-text fallback by construction.
 *  - choices               → the labeled-options pattern
 *                            (`status: "engagement_choice_required"` +
 *                            `options: [{id, label}]`) — #1359/#1360.
 *  - requiresConfirmation/ → the draft→confirm capability kinds and the
 *    confirmation            one-time `confirmationToken` (HMAC, state-
 *                            fingerprinted) — journal write reference.
 *  - warnings / nextActions→ `note` fields and chat chips; MCP annotations
 *                            declare behavior hints per capability.
 *  - structuredDestination → the web result registry / `link:` chip ids —
 *                            where a richer UI shows the same data.
 *  - metadata              → capability descriptor (id, kind, annotations).
 */
export type DomainCaller = {
  /** The caller's own RLS-scoped client — never service-role. */
  readonly supabase: SupabaseClient<Database>;
  readonly userId: string;
  readonly locale?: string;
};

/**
 * The honest three-state read a core returns when a caller-facing consumer
 * must distinguish "the read failed" from "the row does not exist" (#1314:
 * a failed read must never be reported as absence). Cookie-side wrappers
 * that intentionally degrade to null/[] map BOTH onto their existing shape —
 * the distinction is preserved for the callers that need it.
 */
export type CoreRead<T> = { ok: true; value: T } | { ok: false };
