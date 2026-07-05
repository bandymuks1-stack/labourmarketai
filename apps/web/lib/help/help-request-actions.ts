"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  HELP_NOTE_MAX,
  HELP_REQUEST_TYPES,
  type HelpRequestActionResult,
  type HelpRequestType,
} from "@/lib/help/help-request-model";

/**
 * Submit a typed INTERNAL help request (CR train WAGON 10, area 18).
 *
 * The ONLY write path is the gated submit_help_request_v1 RPC
 * (20260705260000): it re-validates the closed type set, the note cap, the
 * demand ownership and the open-request cap server-side, and INSERTs a
 * customer_requests row at status 'in_review' — operator-queue-visible,
 * never projected to the agency/worker demand boards.
 *
 * NO EXTERNAL SENDING: this action writes one internal row and returns.
 * No email, SMS, push, Telegram, webhook or outbound call of any kind.
 * Honest degradation: while the owner-gated migration is not applied the
 * RPC is missing (42883) and the caller shows the truthful "not available
 * yet" state — nothing is faked.
 */
export async function submitHelpRequestAction(
  helpType: HelpRequestType,
  note: string,
  demandRequestId: string | null,
): Promise<HelpRequestActionResult> {
  if (!(HELP_REQUEST_TYPES as readonly string[]).includes(helpType)) {
    return { ok: false, code: "invalid_type" };
  }
  const trimmed = (note ?? "").trim();
  if (trimmed.length > HELP_NOTE_MAX) {
    return { ok: false, code: "note_too_long" };
  }
  const demandId = (demandRequestId ?? "").trim();
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (demandId && !UUID_RE.test(demandId)) {
    return { ok: false, code: "demand_not_owned" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "submit_help_request_v1",
    {
      p_help_type: helpType,
      p_note: trimmed || null,
      p_demand_request_id: demandId || null,
    },
  );
  if (error) {
    if (error.code === "42883" || error.code === "42P01") {
      return { ok: false, code: "not_ready" };
    }
    const msg = error.message ?? "";
    if (msg.includes("invalid_help_type")) return { ok: false, code: "invalid_type" };
    if (msg.includes("note_too_long")) return { ok: false, code: "note_too_long" };
    if (msg.includes("demand_not_owned")) return { ok: false, code: "demand_not_owned" };
    if (msg.includes("too_many_open")) return { ok: false, code: "too_many_open" };
    console.error("[help-request] submit failed:", error.code);
    return { ok: false, code: "failed" };
  }

  revalidatePath("/[locale]/dashboard/company", "page");
  return { ok: true, requestId: typeof data === "string" ? data : null };
}
