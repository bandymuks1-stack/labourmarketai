import { describe, expect, it } from "vitest";

import type { DomainCaller } from "@/lib/domain/caller";
import { readEvidenceMedia } from "./evidence-media-read";

type Result = { data?: unknown; error?: { code?: string } | null };

function caller(result: Result) {
  const calls = { from: [] as string[], eq: [] as [string, unknown][] };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit"]) b[m] = () => b;
  b.eq = (col: string, v: unknown) => {
    calls.eq.push([col, v]);
    return b;
  };
  b.then = (res: (v: Result) => unknown) => Promise.resolve({ data: null, error: null, ...result }).then(res);
  const c = {
    supabase: {
      from: (t: string) => {
        calls.from.push(t);
        return b;
      },
    },
    userId: "u",
    locale: "en",
  } as unknown as DomainCaller;
  return { c, calls };
}

const row = {
  id: "m1",
  organization_id: "o1",
  evidence_record_id: "r1",
  work_object_id: null,
  organization_person_id: null,
  organization_level: false,
  mime_type: "image/jpeg",
  byte_size: 1234,
  caption: null,
  source_system: "csv-archive",
  original_filename: "IMG_0001.jpg",
  original_taken_at: "2019-05-01T08:00:00Z",
  taken_at_basis: "exif",
  imported_at: "2026-10-07T00:00:00Z",
  visibility: "private",
};

describe("readEvidenceMedia", () => {
  it("empty is ok with no media", async () => {
    const { c } = caller({ data: [] });
    expect(await readEvidenceMedia(c, { workObjectId: "w1" })).toEqual({ kind: "ok", media: [] });
  });

  it("maps rows, keeps the original date untouched, filters only by the stated anchor", async () => {
    const { c, calls } = caller({ data: [row] });
    const res = await readEvidenceMedia(c, { evidenceRecordId: "r1" });
    expect(calls.from).toEqual(["organization_evidence_media"]);
    expect(calls.eq).toEqual([["evidence_record_id", "r1"]]);
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.media[0]?.originalTakenAt).toBe("2019-05-01T08:00:00Z");
      expect(res.media[0]?.takenAtBasis).toBe("exif");
      expect(res.media[0]?.visibility).toBe("private");
    }
  });

  it("selects by person and by work object columns", async () => {
    const a = caller({ data: [] });
    await readEvidenceMedia(a.c, { organizationPersonId: "p1" });
    expect(a.calls.eq).toEqual([["organization_person_id", "p1"]]);
    const b = caller({ data: [] });
    await readEvidenceMedia(b.c, { workObjectId: "w1" });
    expect(b.calls.eq).toEqual([["work_object_id", "w1"]]);
  });

  it("a failed read is unavailable, never an empty list", async () => {
    const { c } = caller({ error: { code: "500" } });
    expect(await readEvidenceMedia(c, { workObjectId: "w1" })).toEqual({ kind: "unavailable" });
  });

  it("a missing table is unprovisioned, not empty", async () => {
    const { c } = caller({ error: { code: "42P01" } });
    expect(await readEvidenceMedia(c, { workObjectId: "w1" })).toEqual({ kind: "unprovisioned" });
    const d = caller({ error: { code: "PGRST205" } });
    expect(await readEvidenceMedia(d.c, { workObjectId: "w1" })).toEqual({ kind: "unprovisioned" });
  });
});
