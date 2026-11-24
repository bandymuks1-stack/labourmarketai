import "server-only";

import { createClient } from "@/lib/supabase/server";
import { orderPins, type PinKind, type WorkspacePin } from "@/lib/workspace/pins-model";

/**
 * MY SPACE — the pins read (owner contract 2026-09-04 §4C). The caller's own
 * rows under RLS for ONE workspace (the personal space = organization NULL).
 * Feature-detects the table: until the migration is applied the row is
 * simply absent — never an error, never an invented empty desktop.
 */
export type PinsRead =
  | { readonly kind: "ok"; readonly pins: readonly WorkspacePin[] }
  | { readonly kind: "unavailable" };

const MISSING = new Set(["42P01", "PGRST205", "42703"]);

export async function listMyPins(organizationId: string | null): Promise<PinsRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unavailable" };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("workspace_pins")
      .select("ref, kind, label, position")
      .eq("profile_id", user.id)
      .order("position", { ascending: true })
      .limit(50);
    q = organizationId ? q.eq("organization_id", organizationId) : q.is("organization_id", null);
    const { data, error } = await q;
    if (error) {
      if (!MISSING.has(error.code)) console.error("[pins] read failed:", error.code);
      return { kind: "unavailable" };
    }
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map(
      (r): WorkspacePin => ({
        ref: String(r.ref),
        kind: r.kind as PinKind,
        label: (r.label as string | null) ?? null,
        position: Number(r.position ?? 0),
      }),
    );
    return { kind: "ok", pins: orderPins(rows) };
  } catch {
    return { kind: "unavailable" };
  }
}
