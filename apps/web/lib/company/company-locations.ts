import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Company operating geography read service (F12.4/5).
 *
 * Backed by the OWNER-GATED draft migration 20260713120000_company_locations_v1
 * (NOT applied yet). Until the owner applies it, the select fails with 42P01
 * and this module reports `needs-migration` — the UI shows an honest
 * "prepared, owner activation pending" state, exactly the established
 * migration-gated pattern (team brigades / work tasks / finance records).
 */

export type CompanyLocationKind =
  | "headquarters"
  | "operating"
  | "desired_market";

export type CompanyLocation = {
  id: string;
  kind: CompanyLocationKind;
  country: string;
  region: string | null;
  city: string | null;
  label: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CompanyLocationsState =
  | { kind: "ok"; rows: CompanyLocation[] }
  | { kind: "needs-migration" }
  | { kind: "error" };

export async function getCompanyLocations(): Promise<CompanyLocationsState> {
  const supabase = await createClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("company_locations")
      .select("id, kind, country, region, city, label, latitude, longitude")
      .order("kind", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      // 42P01 = raw Postgres undefined_table; PGRST205 = PostgREST schema
      // cache has never seen the table (the code the cloud API actually
      // returns for a never-applied draft migration — verified in the
      // production-build smoke).
      if (error.code === "42P01" || error.code === "PGRST205") {
        return { kind: "needs-migration" };
      }
      console.error("[company-locations] read failed:", error.code);
      return { kind: "error" };
    }
    return {
      kind: "ok",
      rows: (data ?? []).map(
        (r: Record<string, unknown>): CompanyLocation => ({
          id: r.id as string,
          kind: r.kind as CompanyLocationKind,
          country: r.country as string,
          region: (r.region as string | null) ?? null,
          city: (r.city as string | null) ?? null,
          label: (r.label as string | null) ?? null,
          latitude: (r.latitude as number | null) ?? null,
          longitude: (r.longitude as number | null) ?? null,
        }),
      ),
    };
  } catch {
    return { kind: "error" };
  }
}
