/**
 * Pure half of the SKL-9 assessor action: form parsing and error mapping.
 * Kept out of the "use server" file (which may only export async functions)
 * so both can be unit-tested without a database.
 */
export type RecognitionActionState =
  | { status: "idle" }
  | { status: "ok"; id?: string }
  | { status: "invalid" }
  | { status: "forbidden" }
  | { status: "needs_migration" }
  | { status: "error"; reason?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,79}$/;

/** relation/function absent: 42P01 table, 42883 function, PGRST202/205 not in cache. */
const MISSING = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

export interface RecognitionInput {
  readonly subjectProfileId: string;
  readonly assessorOrganizationId: string;
  readonly requirementKind: "document_type" | "skill" | "profession";
  readonly requirementKey: string;
  readonly requirementCountry: string;
  readonly evidenceEntryIds: readonly string[];
  readonly decision: "recognised" | "not_recognised";
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly note: string | null;
}

export function parseRecognitionForm(
  formData: FormData,
): { ok: true; value: RecognitionInput } | { ok: false } {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const subjectProfileId = get("subjectProfileId");
  const assessorOrganizationId = get("assessorOrganizationId");
  const requirementKind = get("requirementKind");
  const requirementKey = get("requirementKey").toLowerCase();
  const requirementCountry = get("requirementCountry").toUpperCase();
  const decision = get("decision");
  const validFrom = get("validFrom");
  const validUntil = get("validUntil");
  const note = get("note").slice(0, 2000);
  const evidenceEntryIds = get("evidenceEntryIds")
    .split(/[\s,;]+/)
    .filter(Boolean);

  if (!UUID.test(subjectProfileId) || !UUID.test(assessorOrganizationId)) return { ok: false };
  if (requirementKind !== "document_type" && requirementKind !== "skill" && requirementKind !== "profession")
    return { ok: false };
  if (!SLUG.test(requirementKey)) return { ok: false };
  if (!/^[A-Z]{2}$/.test(requirementCountry)) return { ok: false };
  if (decision !== "recognised" && decision !== "not_recognised") return { ok: false };
  if ((validFrom && !DATE.test(validFrom)) || (validUntil && !DATE.test(validUntil))) return { ok: false };
  if (validFrom && validUntil && validUntil < validFrom) return { ok: false };
  if (evidenceEntryIds.length < 1 || evidenceEntryIds.length > 50) return { ok: false };
  if (!evidenceEntryIds.every((id) => UUID.test(id))) return { ok: false };

  return {
    ok: true,
    value: {
      subjectProfileId,
      assessorOrganizationId,
      requirementKind,
      requirementKey,
      requirementCountry,
      evidenceEntryIds,
      decision,
      validFrom: validFrom || null,
      validUntil: validUntil || null,
      note: note || null,
    },
  };
}

export function mapRecognitionRpcError(
  code: string | undefined,
  message: string | undefined,
): RecognitionActionState {
  if (code && MISSING.has(code)) return { status: "needs_migration" };
  const m = (message ?? "").toLowerCase();
  if (
    code === "42501" ||
    m.includes("not_manager") ||
    m.includes("not_assessor") ||
    m.includes("self_recognition") ||
    m.includes("beneficiary")
  )
    return { status: "forbidden" };
  if (m.includes("invalid") || m.includes("unknown_") || m.includes("not_found")) return { status: "invalid" };
  return { status: "error", reason: code };
}
