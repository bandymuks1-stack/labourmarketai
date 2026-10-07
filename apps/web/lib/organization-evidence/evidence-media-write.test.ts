import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { DomainCaller } from "@/lib/domain/caller";
import { registerEvidenceMedia } from "./evidence-media-write";

const ORG = "11111111-1111-4111-8111-111111111111";
const WO = "22222222-2222-4222-8222-222222222222";
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const SHA = createHash("sha256").update(JPEG).digest("hex");

type Resp = { data?: unknown; error?: { code?: string; message?: string } | null };

function harness(opts: {
  workObject?: Resp;
  existing?: Resp;
  upload?: Resp;
  insert?: Resp;
  again?: Resp;
}) {
  const log = { inserts: [] as Record<string, unknown>[], uploads: [] as string[], removed: [] as string[][] };
  let mediaSelects = 0;
  const builder = (table: string) => {
    let mode: "select" | "insert" = "select";
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.insert = (row: Record<string, unknown>) => {
      mode = "insert";
      log.inserts.push(row);
      return b;
    };
    const finish = (): Resp => {
      if (table === "work_objects") return { data: null, error: null, ...(opts.workObject ?? {}) };
      if (mode === "insert") return { data: null, error: null, ...(opts.insert ?? {}) };
      mediaSelects += 1;
      return mediaSelects === 1
        ? { data: null, error: null, ...(opts.existing ?? {}) }
        : { data: null, error: null, ...(opts.again ?? {}) };
    };
    b.maybeSingle = () => Promise.resolve(finish());
    b.single = () => Promise.resolve(finish());
    return b;
  };
  const caller = {
    userId: "user-1",
    locale: "en",
    supabase: {
      from: builder,
      storage: {
        from: () => ({
          upload: (path: string) => {
            log.uploads.push(path);
            return Promise.resolve({ data: null, error: null, ...(opts.upload ?? {}) });
          },
          remove: (paths: string[]) => {
            log.removed.push(paths);
            return Promise.resolve({ data: null, error: null });
          },
        }),
      },
    },
  } as unknown as DomainCaller;
  return { caller, log };
}

const base = {
  organizationId: ORG,
  bytes: JPEG,
  anchors: { workObjectId: WO },
  sourceSystem: "csv-archive",
};

const woOk = { workObject: { data: { id: WO, organization_id: ORG } } };

describe("registerEvidenceMedia", () => {
  it("refuses with no stated anchor, before any I/O", async () => {
    const { caller, log } = harness({});
    const res = await registerEvidenceMedia(caller, { ...base, anchors: {} });
    expect(res).toEqual({ ok: false, code: "no_anchor" });
    expect(log.uploads).toEqual([]);
  });

  it("refuses a non-image by its real bytes", async () => {
    const { caller } = harness(woOk);
    const res = await registerEvidenceMedia(caller, { ...base, bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 1]) });
    expect(res).toEqual({ ok: false, code: "unsupported_type" });
  });

  it("refuses a date without its basis", async () => {
    const { caller } = harness(woOk);
    const res = await registerEvidenceMedia(caller, { ...base, originalTakenAt: "2019-05-01", takenAtBasis: null });
    expect(res).toEqual({ ok: false, code: "bad_date" });
  });

  it("refuses a work object of another organization", async () => {
    const { caller, log } = harness({ workObject: { data: { id: WO, organization_id: "other" } } });
    expect(await registerEvidenceMedia(caller, base)).toEqual({ ok: false, code: "anchor_not_found" });
    expect(log.uploads).toEqual([]);
  });

  it("is idempotent: the same bytes answer duplicate and write nothing", async () => {
    const { caller, log } = harness({ ...woOk, existing: { data: { id: "m-1" } } });
    const res = await registerEvidenceMedia(caller, base);
    expect(res).toEqual({ ok: true, outcome: "duplicate", mediaId: "m-1" });
    expect(log.uploads).toEqual([]);
    expect(log.inserts).toEqual([]);
  });

  it("registers at the content-addressed path with unknown date and private visibility by default", async () => {
    const { caller, log } = harness({ ...woOk, insert: { data: { id: "m-2" } } });
    const res = await registerEvidenceMedia(caller, base);
    expect(res).toEqual({ ok: true, outcome: "registered", mediaId: "m-2" });
    expect(log.uploads).toEqual([`org/${ORG}/${SHA}.jpg`]);
    const row = log.inserts[0];
    expect(row.original_taken_at).toBeNull();
    expect(row.taken_at_basis).toBe("unknown");
    expect(row.visibility).toBe("private");
    expect(row.mime_type).toBe("image/jpeg");
    expect(row.content_sha256).toBe(SHA);
    expect(row.imported_by_profile_id).toBe("user-1");
    expect(row.work_object_id).toBe(WO);
  });

  it("keeps a stated date together with its basis", async () => {
    const { caller, log } = harness({ ...woOk, insert: { data: { id: "m-3" } } });
    await registerEvidenceMedia(caller, { ...base, originalTakenAt: "2019-05-01T08:00:00Z", takenAtBasis: "exif" });
    expect(log.inserts[0].original_taken_at).toBe("2019-05-01T08:00:00.000Z");
    expect(log.inserts[0].taken_at_basis).toBe("exif");
  });

  it("removes the orphan blob when the row insert fails", async () => {
    const { caller, log } = harness({ ...woOk, insert: { error: { code: "XX000" } } });
    const res = await registerEvidenceMedia(caller, base);
    expect(res).toEqual({ ok: false, code: "error" });
    expect(log.removed).toEqual([[`org/${ORG}/${SHA}.jpg`]]);
  });

  it("a lost unique(org, sha) race resolves to the winner's row", async () => {
    const { caller } = harness({ ...woOk, insert: { error: { code: "23505" } }, again: { data: { id: "m-win" } } });
    expect(await registerEvidenceMedia(caller, base)).toEqual({ ok: true, outcome: "duplicate", mediaId: "m-win" });
  });

  it("a missing bucket is needs_migration, not a silent success", async () => {
    const { caller } = harness({ ...woOk, upload: { error: { message: "Bucket not found" } } });
    expect(await registerEvidenceMedia(caller, base)).toEqual({ ok: false, code: "needs_migration" });
  });

  it("a storage policy refusal is not_allowed", async () => {
    const { caller } = harness({
      ...woOk,
      upload: { error: { message: "new row violates row-level security policy" } },
    });
    expect(await registerEvidenceMedia(caller, base)).toEqual({ ok: false, code: "not_allowed" });
  });
});
