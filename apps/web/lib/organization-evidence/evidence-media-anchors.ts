import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import { resolveEvidenceOrganization } from "./evidence-org-context";
import { untypedClient } from "./evidence-store";
import { buildRecordChoiceLabel, type PhotoAnchorChoice } from "./evidence-media-model";

/**
 * THE STATED-ANCHOR CHOICES a manager may attach historical photos to.
 *
 * Read under the CALLER's own RLS for the caller's ACTIVE organization (the
 * organization is resolved server-side, never taken from a request). Nothing
 * here proposes a match: the manager picks the anchor, the photo is attached to
 * exactly that, and no relationship is ever inferred from dates or filenames.
 *
 * Bounded lists say so (`truncated`) - a cut-off list is never presented as the
 * whole organization.
 */

const PEOPLE_LIMIT = 300;
const PLACES_LIMIT = 300;
const RECORDS_LIMIT = 150;

export type PhotoAnchorChoices =
  | {
      readonly kind: "ok";
      readonly organizationId: string;
      readonly people: readonly PhotoAnchorChoice[];
      readonly places: readonly PhotoAnchorChoice[];
      readonly records: readonly PhotoAnchorChoice[];
      readonly truncated: { readonly people: boolean; readonly places: boolean; readonly records: boolean };
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "hidden" };

type PersonRow = { id: string; display_name: string | null };
type PlaceRow = { id: string; name: string | null };
type RecordRow = {
  id: string;
  organization_person_id: string | null;
  context_label: string | null;
  activity_date: string | null;
  period_start: string | null;
};

export async function readPhotoAnchorChoices(caller: DomainCaller): Promise<PhotoAnchorChoices> {
  const org = await resolveEvidenceOrganization(caller, null);
  if (!org.ok) {
    return org.reason === "error" || org.reason === "needs-migration" ? { kind: "unavailable" } : { kind: "hidden" };
  }
  const db = untypedClient(caller.supabase);
  const [people, places, records] = await Promise.all([
    db
      .from("organization_people")
      .select("id, display_name")
      .eq("organization_id", org.organizationId)
      .order("display_name", { ascending: true })
      .limit(PEOPLE_LIMIT + 1),
    db
      .from("work_objects")
      .select("id, name")
      .eq("organization_id", org.organizationId)
      .order("name", { ascending: true })
      .limit(PLACES_LIMIT + 1),
    db
      .from("organization_evidence_records")
      .select("id, organization_person_id, context_label, activity_date, period_start")
      .eq("organization_id", org.organizationId)
      .order("activity_date", { ascending: false, nullsFirst: false })
      .limit(RECORDS_LIMIT + 1),
  ]);
  if (people.error || places.error || records.error) return { kind: "unavailable" };

  const peopleRows = (people.data ?? []) as PersonRow[];
  const placeRows = (places.data ?? []) as PlaceRow[];
  const recordRows = (records.data ?? []) as RecordRow[];
  const nameOf = new Map(peopleRows.map((p) => [p.id, (p.display_name ?? "").trim()]));

  return {
    kind: "ok",
    organizationId: org.organizationId,
    people: peopleRows
      .slice(0, PEOPLE_LIMIT)
      .filter((p) => (p.display_name ?? "").trim() !== "")
      .map((p) => ({ id: p.id, label: (p.display_name as string).trim() })),
    places: placeRows
      .slice(0, PLACES_LIMIT)
      .filter((p) => (p.name ?? "").trim() !== "")
      .map((p) => ({ id: p.id, label: (p.name as string).trim() })),
    records: recordRows.slice(0, RECORDS_LIMIT).map((r) => ({
      id: r.id,
      label: buildRecordChoiceLabel({
        date: r.activity_date ?? r.period_start,
        personName: r.organization_person_id ? (nameOf.get(r.organization_person_id) ?? null) : null,
        contextLabel: r.context_label,
      }),
    })),
    truncated: {
      people: peopleRows.length > PEOPLE_LIMIT,
      places: placeRows.length > PLACES_LIMIT,
      records: recordRows.length > RECORDS_LIMIT,
    },
  };
}
