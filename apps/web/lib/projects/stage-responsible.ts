/**
 * Stage responsible — pure, client-safe model for the stage panel picker and
 * the timeline column. No IO.
 *
 * The responsible party of a stage is an ENGAGEMENT (engagement_contexts.id)
 * that is ACTIVE in the project's own organization — the exact eligibility
 * set_project_stage_responsible_v1 enforces server-side (the RPC is the
 * authority; this only keeps the picker from offering what it would refuse).
 * Names come from the existing readable-name resolution
 * (lib/company/org-employee-engagements.ts); an engagement whose person has no
 * readable name resolves to NOTHING here — never a raw id, never a guess.
 */

export interface ResponsibleOption {
  readonly engagementId: string;
  readonly name: string;
}

export interface EngagementRowLike {
  readonly engagementId: string;
  readonly name: string;
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The explicit dash the readable-name resolver uses for "not readable". */
export const UNREADABLE_NAME = "—";

/**
 * Options for the picker: de-duplicated by engagement id, malformed ids
 * dropped, order preserved. Rows whose name is unreadable are kept (they ARE
 * eligible) but labelled with the dash by the resolver, never an id.
 */
export function buildResponsibleOptions(
  rows: readonly EngagementRowLike[],
): ResponsibleOption[] {
  const seen = new Set<string>();
  const out: ResponsibleOption[] = [];
  for (const r of rows) {
    const id = (r.engagementId ?? "").trim();
    if (!UUID_RX.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ engagementId: id, name: (r.name ?? "").trim() || UNREADABLE_NAME });
  }
  return out;
}

/** Display name of the current responsible, or null when it cannot be read
 *  (unset, not in the eligible/readable set, or an unreadable name). */
export function responsibleDisplayName(
  options: readonly ResponsibleOption[],
  engagementId: string | null | undefined,
): string | null {
  if (!engagementId) return null;
  const hit = options.find((o) => o.engagementId === engagementId);
  if (!hit || hit.name === UNREADABLE_NAME) return null;
  return hit.name;
}

/** engagementId → readable name, for the timeline (unreadable names omitted). */
export function responsibleNameMap(
  options: readonly ResponsibleOption[],
): ReadonlyMap<string, string> {
  return new Map(
    options
      .filter((o) => o.name !== UNREADABLE_NAME)
      .map((o) => [o.engagementId, o.name] as const),
  );
}

/** Outcome codes of setStageResponsibleAction the control states honestly. */
export type ResponsibleOutcome =
  | "saved"
  | "needs_migration"
  | "not_authorized"
  | "invalid"
  | "auth"
  | "error";

export function responsibleOutcomeKey(
  res: { ok: true } | { ok: false; code: string },
): ResponsibleOutcome {
  if (res.ok) return "saved";
  switch (res.code) {
    case "needs_migration":
    case "not_authorized":
    case "invalid":
    case "auth":
      return res.code;
    default:
      return "error";
  }
}
