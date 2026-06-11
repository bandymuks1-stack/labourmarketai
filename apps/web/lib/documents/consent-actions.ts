"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * S6 — worker documents-aggregate consent (draft RPC, gate-degraded).
 * The switch is the worker's OWN audited act; default is OFF (§4). Until the
 * owner applies the S6 consent draft the UI shows an honest needs-gate state.
 */

const RPC_NOT_FOUND = new Set(["42883", "PGRST202"]);
const UNDEFINED_COLUMN = "42703";

export type DocsConsentState =
  | { outcome: "saved"; enabled: boolean }
  | { outcome: "no_worker" | "needs_gate" | "error" }
  | null;

export async function setDocsConsentAction(
  _prev: DocsConsentState,
  formData: FormData,
): Promise<DocsConsentState> {
  const enabled = String(formData.get("enabled") ?? "") === "1";
  const locale = String(formData.get("locale") ?? "lt");
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "set_docs_aggregate_consent",
      { p_enabled: enabled },
    );
    if (error) {
      return RPC_NOT_FOUND.has(error.code ?? "")
        ? { outcome: "needs_gate" }
        : { outcome: "error" };
    }
    if (String(data) === "saved") {
      revalidatePath(`/${locale}/dashboard/documents`);
      return { outcome: "saved", enabled };
    }
    return { outcome: "no_worker" };
  } catch {
    return { outcome: "error" };
  }
}

/** Current consent value; null = column not applied yet (needs gate) or no
 *  worker row. Never guesses. */
export async function getDocsConsent(): Promise<boolean | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("workers")
      .select("docs_aggregate_consent")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (error) {
      return error.code === UNDEFINED_COLUMN ? null : null;
    }
    if (!data) return null;
    return Boolean(
      (data as { docs_aggregate_consent: boolean | null })
        .docs_aggregate_consent,
    );
  } catch {
    return null;
  }
}
