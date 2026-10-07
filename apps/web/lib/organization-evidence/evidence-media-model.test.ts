import { describe, expect, it } from "vitest";

import {
  EVIDENCE_MEDIA_ACTION_MAX_BYTES,
  anchorsForKind,
  buildEvidenceMediaPath,
  buildRecordChoiceLabel,
  resolveAnchors,
  resolveDateProvenance,
  sniffEvidenceMediaMime,
} from "./evidence-media-model";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const SHA = "a".repeat(64);

const bytes = (...n: number[]) => Uint8Array.from(n);
const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

describe("sniffEvidenceMediaMime reads the REAL bytes", () => {
  it("recognises the four admitted formats", () => {
    expect(sniffEvidenceMediaMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffEvidenceMediaMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffEvidenceMediaMime(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toBe("image/webp");
    expect(sniffEvidenceMediaMime(bytes(0, 0, 0, 24, ...ascii("ftyp"), ...ascii("heic")))).toBe("image/heic");
  });

  it("refuses everything else, including a PDF and a renamed executable", () => {
    expect(sniffEvidenceMediaMime(bytes(...ascii("%PDF-1.7")))).toBeNull();
    expect(sniffEvidenceMediaMime(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
    expect(sniffEvidenceMediaMime(bytes())).toBeNull();
    expect(sniffEvidenceMediaMime(bytes(0, 0, 0, 24, ...ascii("ftyp"), ...ascii("mp42")))).toBeNull();
  });
});

describe("path contract", () => {
  it("is org/<organization_id>/<sha256>.<ext> - content addressed", () => {
    expect(buildEvidenceMediaPath(U1, SHA, "image/jpeg")).toBe(`org/${U1}/${SHA}.jpg`);
    expect(buildEvidenceMediaPath(U1, SHA, "image/heic")).toBe(`org/${U1}/${SHA}.heic`);
  });
});

describe("unknown stays unknown", () => {
  it("no date and no basis is null + unknown", () => {
    expect(resolveDateProvenance(null, null)).toEqual({ ok: true, originalTakenAt: null, takenAtBasis: "unknown" });
    expect(resolveDateProvenance("", "unknown")).toEqual({ ok: true, originalTakenAt: null, takenAtBasis: "unknown" });
  });

  it("a date is accepted only with the stated basis it came from", () => {
    expect(resolveDateProvenance("2019-05-01T08:00:00Z", "exif")).toEqual({
      ok: true,
      originalTakenAt: "2019-05-01T08:00:00.000Z",
      takenAtBasis: "exif",
    });
    expect(resolveDateProvenance("2019-05-01", null).ok).toBe(false);
    expect(resolveDateProvenance("2019-05-01", "unknown").ok).toBe(false);
    expect(resolveDateProvenance("2019-05-01", "guessed").ok).toBe(false);
  });

  it("a basis with no date, or an unparseable date, is refused rather than repaired", () => {
    expect(resolveDateProvenance(null, "exif").ok).toBe(false);
    expect(resolveDateProvenance("not a date", "organization_stated").ok).toBe(false);
  });
});

describe("anchors are stated, never inferred", () => {
  it("requires at least one anchor", () => {
    expect(resolveAnchors({})).toBeNull();
    expect(resolveAnchors({ evidenceRecordId: "", workObjectId: null })).toBeNull();
  });

  it("accepts a uuid anchor or the explicit organization level", () => {
    expect(resolveAnchors({ workObjectId: U1 })).toEqual({
      evidenceRecordId: null,
      workObjectId: U1,
      organizationPersonId: null,
      organizationLevel: false,
    });
    expect(resolveAnchors({ organizationLevel: true })?.organizationLevel).toBe(true);
    expect(resolveAnchors({ organizationPersonId: U2, workObjectId: U1 })?.organizationPersonId).toBe(U2);
  });

  it("refuses a malformed id instead of dropping it", () => {
    expect(resolveAnchors({ workObjectId: "not-a-uuid", organizationLevel: true })).toBeNull();
  });
});

describe("anchorsForKind: ONE explicitly stated anchor, never a default", () => {
  it("maps each kind to exactly its own anchor field", () => {
    expect(anchorsForKind("record", U1)).toEqual({ evidenceRecordId: U1 });
    expect(anchorsForKind("place", U1)).toEqual({ workObjectId: U1 });
    expect(anchorsForKind("person", U1)).toEqual({ organizationPersonId: U1 });
    expect(anchorsForKind("organization", null)).toEqual({ organizationLevel: true });
  });

  it("refuses a missing, malformed or unknown selection instead of falling back", () => {
    expect(anchorsForKind("place", "")).toBeNull();
    expect(anchorsForKind("person", "not-a-uuid")).toBeNull();
    expect(anchorsForKind("record", null)).toBeNull();
    expect(anchorsForKind("", U1)).toBeNull();
    expect(anchorsForKind(undefined, U1)).toBeNull();
    expect(anchorsForKind("project", U1)).toBeNull();
  });

  it("the result always satisfies resolveAnchors (at least one stated anchor)", () => {
    for (const k of ["record", "place", "person", "organization"]) {
      expect(resolveAnchors(anchorsForKind(k, U2) ?? {})).not.toBeNull();
    }
  });
});

describe("path + limits", () => {
  it("the storage path is always lowercase (the bucket policy matches lowercase uuids only)", () => {
    expect(buildEvidenceMediaPath(U1.toUpperCase(), SHA, "image/png")).toBe(`org/${U1}/${SHA}.png`);
  });

  it("the in-app cap stays under the 5 MB server-action body limit", () => {
    expect(EVIDENCE_MEDIA_ACTION_MAX_BYTES).toBeLessThan(5 * 1024 * 1024);
  });
});

describe("buildRecordChoiceLabel shows only what is stored", () => {
  it("joins date, person and place; never invents a missing part", () => {
    expect(buildRecordChoiceLabel({ date: "2019-05-01", personName: "Jonas", contextLabel: "Site A" })).toBe(
      "2019-05-01 \u00b7 Jonas \u00b7 Site A",
    );
    expect(buildRecordChoiceLabel({ date: null, personName: null, contextLabel: "Site A" })).toBe("Site A");
    expect(buildRecordChoiceLabel({ date: null, personName: null, contextLabel: null })).toBe("-");
  });
});
