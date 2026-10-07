/**
 * EVIDENCE MEDIA - pure rules shared by the writer and its tests.
 *
 * Nothing here talks to the database or to storage.
 */

export const EVIDENCE_MEDIA_BUCKET = "evidence-media";
export const EVIDENCE_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
/**
 * The per-file cap of the in-app upload path. The upload travels through a
 * Next.js server action whose body limit is 5 MB (`next.config` serverActions),
 * so a larger original is refused up front and SAID, never half-sent. The
 * bucket and the table still admit up to EVIDENCE_MEDIA_MAX_BYTES; originals
 * between the two need a direct-upload path (not built).
 */
export const EVIDENCE_MEDIA_ACTION_MAX_BYTES = 4 * 1024 * 1024;

export type EvidenceMediaMime = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

const EXT: Record<EvidenceMediaMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < to; i += 1) s += String.fromCharCode(bytes[i]);
  return s;
}

/**
 * The MIME type is derived from the REAL bytes. The client's declared type is
 * never trusted (and never needed): a file whose signature is not one of the
 * four admitted image formats is refused.
 */
export function sniffEvidenceMediaMime(bytes: Uint8Array): EvidenceMediaMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return null;
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RX.test(v);
}

/** The path contract pinned by the storage policies: org/<organization_id>/<sha256>.<ext>.
 *  Content-addressed, so the same bytes can only ever land on one path. */
export function buildEvidenceMediaPath(organizationId: string, sha256: string, mime: EvidenceMediaMime): string {
  return `org/${organizationId.toLowerCase()}/${sha256}.${EXT[mime]}`;
}

export type TakenAtBasis = "exif" | "source_metadata" | "organization_stated" | "unknown";
const STATED_BASES = ["exif", "source_metadata", "organization_stated"] as const;

export type DateProvenance =
  | { readonly ok: true; readonly originalTakenAt: string | null; readonly takenAtBasis: TakenAtBasis }
  | { readonly ok: false };

/**
 * UNKNOWN STAYS UNKNOWN. A date is accepted only together with the stated
 * basis it came from; a basis without a parseable date, or a date without a
 * basis, is refused rather than repaired. No default date, no "now", no
 * date inferred from the filename or from neighbouring photos.
 */
export function resolveDateProvenance(rawDate: unknown, rawBasis: unknown): DateProvenance {
  const date = typeof rawDate === "string" ? rawDate.trim() : "";
  const basis = typeof rawBasis === "string" ? rawBasis.trim() : "";
  if (!date && (!basis || basis === "unknown")) {
    return { ok: true, originalTakenAt: null, takenAtBasis: "unknown" };
  }
  if (!date || !(STATED_BASES as readonly string[]).includes(basis)) return { ok: false };
  const ms = Date.parse(date);
  if (!Number.isFinite(ms)) return { ok: false };
  return { ok: true, originalTakenAt: new Date(ms).toISOString(), takenAtBasis: basis as TakenAtBasis };
}

export type EvidenceMediaAnchors = {
  readonly evidenceRecordId: string | null;
  readonly workObjectId: string | null;
  readonly organizationPersonId: string | null;
  readonly organizationLevel: boolean;
};

/** At least one STATED anchor; every id must be a uuid. Returns null on refusal. */
export function resolveAnchors(input: {
  evidenceRecordId?: unknown;
  workObjectId?: unknown;
  organizationPersonId?: unknown;
  organizationLevel?: unknown;
}): EvidenceMediaAnchors | null {
  const pick = (v: unknown): string | null | undefined => {
    if (v === undefined || v === null || v === "") return null;
    return isUuid(v) ? v : undefined;
  };
  const evidenceRecordId = pick(input.evidenceRecordId);
  const workObjectId = pick(input.workObjectId);
  const organizationPersonId = pick(input.organizationPersonId);
  if (evidenceRecordId === undefined || workObjectId === undefined || organizationPersonId === undefined) return null;
  const organizationLevel = input.organizationLevel === true || input.organizationLevel === "true";
  if (!evidenceRecordId && !workObjectId && !organizationPersonId && !organizationLevel) return null;
  return { evidenceRecordId, workObjectId, organizationPersonId, organizationLevel };
}

/** One selectable anchor: a stored id plus the human label the manager sees. */
export type PhotoAnchorChoice = { readonly id: string; readonly label: string };

/** The four anchor kinds a manager can state. Exactly one per upload batch. */
export const PHOTO_ANCHOR_KINDS = ["record", "place", "person", "organization"] as const;
export type PhotoAnchorKind = (typeof PHOTO_ANCHOR_KINDS)[number];

/**
 * Translate ONE stated anchor choice into the writer's anchor input. A kind
 * with a missing or malformed id is refused (null) - there is no default
 * anchor and no fallback to "organization".
 */
export function anchorsForKind(
  kind: unknown,
  id: unknown,
): { evidenceRecordId?: string; workObjectId?: string; organizationPersonId?: string; organizationLevel?: boolean } | null {
  if (kind === "organization") return { organizationLevel: true };
  if (!isUuid(id)) return null;
  if (kind === "record") return { evidenceRecordId: id };
  if (kind === "place") return { workObjectId: id };
  if (kind === "person") return { organizationPersonId: id };
  return null;
}

/** Label for an evidence record in the anchor list: date, person, place - as stored, nothing inferred. */
export function buildRecordChoiceLabel(input: {
  date: string | null;
  personName: string | null;
  contextLabel: string | null;
}): string {
  const parts = [input.date?.slice(0, 10), input.personName?.trim(), input.contextLabel?.trim()].filter(
    (p): p is string => !!p,
  );
  return parts.length > 0 ? parts.join(" · ") : "-";
}
