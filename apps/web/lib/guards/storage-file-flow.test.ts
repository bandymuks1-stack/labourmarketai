import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * STORAGE_FILE_FLOW guard — canonical proof of the file-handling contract.
 * Companion truth doc: docs/STORAGE_FILE_FLOW_TRUTH.md (defines the token).
 *
 * The platform has exactly FIVE private storage-backed flows, all following
 * upload-to-ownership-path → register (SECURITY DEFINER RPC or owner-RLS
 * write) → on registration failure remove the just-uploaded ORPHAN blob.
 * That rollback branch is the correctness hinge of every flow and was the
 * least-covered piece — this guard exercises it BEHAVIORALLY (real function,
 * mocked supabase, RPC rejects → the exact uploaded path must be removed),
 * with a success-path NEGATIVE CONTROL per flow so the assertions cannot be
 * vacuous (the repo has a documented history of vacuous guards).
 *
 * Two flows have a deliberately different orphan story, pinned statically:
 *   - conversation-attachments: blobs upload PRE-send; the user-facing
 *     remove control deletes the blob (uploader-only storage DELETE policy);
 *     a post-send registration failure never un-sends the message — it is
 *     reported honestly via `attachmentsFailed`.
 *   - customer-request-attachments: registration failure surfaces an honest
 *     error; the blob stays under the CALLER'S OWN folder (owner-scoped
 *     storage RLS). User-initiated removal deletes blob-then-row.
 *
 * Also pinned here:
 *   - reads are short-TTL signed URLs ONLY (getPublicUrl absent everywhere);
 *   - /api/cv/extract persists NOTHING — a DESIGNED privacy property, not a
 *     gap (no storage, no DB write, no fs write; text returns to the caller
 *     only). Future auditors: "the CV file is not in a bucket" is by design.
 *   - document→journal draft reads bytes and structures them IN MEMORY.
 */

/* ── module mocks (hoisted; resolved lazily via the holder) ─────────────── */

type UploadCall = { bucket: string; path: string };
type RemoveCall = { bucket: string; paths: readonly string[] };

const holder: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any;
  setPathResult: { ok: boolean };
  setPathCalls: string[];
} = {
  browser: null,
  server: null,
  setPathResult: { ok: true },
  setPathCalls: [],
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => holder.browser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.server,
}));
vi.mock("@/lib/profile/avatar-actions", () => ({
  setProfileAvatarPath: async (path: string) => {
    holder.setPathCalls.push(path);
    return holder.setPathResult;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/notifications/event-emitters", () => ({
  emitDocumentAckNotification: vi.fn(async () => {}),
}));
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompany: vi.fn(async () => ({ ok: false })),
}));

/* ── mock client factories ──────────────────────────────────────────────── */

function makeStorage(uploads: UploadCall[], removes: RemoveCall[]) {
  return {
    from(bucket: string) {
      return {
        upload: async (path: string) => {
          uploads.push({ bucket, path });
          return { data: { path }, error: null };
        },
        remove: async (paths: readonly string[]) => {
          removes.push({ bucket, paths });
          return { data: null, error: null };
        },
      };
    },
  };
}

function makeBrowserClient(
  rpcResult: { error: { code?: string; message?: string } | null },
  uploads: UploadCall[],
  removes: RemoveCall[],
) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "profile-1" } } }),
    },
    storage: makeStorage(uploads, removes),
    rpc: async () => rpcResult,
  };
}

function makeServerClient(
  rpcResult: {
    data: unknown;
    error: { code?: string; message?: string } | null;
  },
  uploads: UploadCall[],
  removes: RemoveCall[],
) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "profile-1" } } }),
    },
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      for (const m of ["select", "eq", "order", "limit", "in"]) {
        b[m] = () => b;
      }
      b.maybeSingle = async () =>
        table === "workers"
          ? { data: { id: "worker-1" }, error: null }
          : { data: null, error: null };
      b.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
      return b;
    },
    storage: makeStorage(uploads, removes),
    rpc: async () => rpcResult,
  };
}

beforeEach(() => {
  holder.browser = null;
  holder.server = null;
  holder.setPathResult = { ok: true };
  holder.setPathCalls = [];
});

/* ── 1. journal-entry-photos — orphan rollback on register-RPC failure ──── */

describe("journal photo upload — register failure removes the orphan blob", () => {
  const file = () =>
    new File([new Uint8Array(1024)], "kitchen tiles.jpg", {
      type: "image/jpeg",
    });

  it("RPC rejects (generic) → .remove() with the EXACT uploaded path, result 'failed'", async () => {
    const uploads: UploadCall[] = [];
    const removes: RemoveCall[] = [];
    holder.browser = makeBrowserClient(
      { error: { code: "P0001", message: "assert_failure" } },
      uploads,
      removes,
    );
    const { uploadJournalEntryPhoto } = await import(
      "@/lib/journal/photo-upload"
    );
    const res = await uploadJournalEntryPhoto("entry-1", file());
    expect(res).toBe("failed");
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe("journal-entry-photos");
    // Ownership-path contract: <profile_id>/<entry_id>/<photo_id>/<filename>
    expect(uploads[0].path).toMatch(
      /^profile-1\/entry-1\/[0-9a-f-]{36}\/kitchen_tiles\.jpg$/,
    );
    expect(removes).toEqual([
      { bucket: "journal-entry-photos", paths: [uploads[0].path] },
    ]);
  });

  it("RPC absent (42883) → still removes the orphan, result 'not-ready'", async () => {
    const uploads: UploadCall[] = [];
    const removes: RemoveCall[] = [];
    holder.browser = makeBrowserClient(
      { error: { code: "42883", message: "function does not exist" } },
      uploads,
      removes,
    );
    const { uploadJournalEntryPhoto } = await import(
      "@/lib/journal/photo-upload"
    );
    const res = await uploadJournalEntryPhoto("entry-1", file());
    expect(res).toBe("not-ready");
    expect(removes).toEqual([
      { bucket: "journal-entry-photos", paths: [uploads[0].path] },
    ]);
  });

  it("NEGATIVE CONTROL: RPC succeeds → 'uploaded' and NO remove call", async () => {
    const uploads: UploadCall[] = [];
    const removes: RemoveCall[] = [];
    holder.browser = makeBrowserClient({ error: null }, uploads, removes);
    const { uploadJournalEntryPhoto } = await import(
      "@/lib/journal/photo-upload"
    );
    const res = await uploadJournalEntryPhoto("entry-1", file());
    expect(res).toBe("uploaded");
    expect(uploads).toHaveLength(1);
    expect(removes).toHaveLength(0);
  });
});

/* ── 2. profile-avatars — orphan rollback on register failure ───────────── */

describe("avatar upload — path-record failure removes the orphan blob", () => {
  const file = () =>
    new File([new Uint8Array(1024)], "me.png", { type: "image/png" });

  it("setProfileAvatarPath !ok → .remove() with the EXACT uploaded path, result 'not-ready'", async () => {
    const uploads: UploadCall[] = [];
    const removes: RemoveCall[] = [];
    holder.browser = makeBrowserClient({ error: null }, uploads, removes);
    holder.setPathResult = { ok: false };
    const { uploadProfileAvatar } = await import("@/lib/profile/avatar-upload");
    const res = await uploadProfileAvatar(file());
    expect(res).toBe("not-ready");
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe("profile-avatars");
    // Ownership-path contract: <profile_id>/avatar-<uuid>.<ext>
    expect(uploads[0].path).toMatch(/^profile-1\/avatar-[0-9a-f-]{36}\.png$/);
    // The register step received the same path that was uploaded…
    expect(holder.setPathCalls).toEqual([uploads[0].path]);
    // …and the rollback removed exactly that path.
    expect(removes).toEqual([
      { bucket: "profile-avatars", paths: [uploads[0].path] },
    ]);
  });

  it("NEGATIVE CONTROL: register succeeds → 'uploaded' and NO remove call", async () => {
    const uploads: UploadCall[] = [];
    const removes: RemoveCall[] = [];
    holder.browser = makeBrowserClient({ error: null }, uploads, removes);
    holder.setPathResult = { ok: true };
    const { uploadProfileAvatar } = await import("@/lib/profile/avatar-upload");
    const res = await uploadProfileAvatar(file());
    expect(res).toBe("uploaded");
    expect(uploads).toHaveLength(1);
    expect(removes).toHaveLength(0);
  });
});

/* ── 3. document-files — orphan rollback inside the server action ───────── */

describe("document file upload action — register failure removes the orphan blob", () => {
  const WORKER_DOC_ID = "11111111-1111-4111-8111-111111111111";

  function formDataWithFile(): FormData {
    const fd = new FormData();
    fd.set("locale", "en");
    fd.set("workerDocumentId", WORKER_DOC_ID);
    fd.set(
      "file",
      new File([new Uint8Array(2048)], "contract.pdf", {
        type: "application/pdf",
      }),
    );
    return fd;
  }

  async function runAction(fd: FormData): Promise<string> {
    const { uploadWorkerDocumentFileAction } = await import(
      "@/lib/documents/document-file-actions"
    );
    try {
      await uploadWorkerDocumentFileAction(fd);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith("REDIRECT:")) return msg.slice("REDIRECT:".length);
      throw e;
    }
    throw new Error("action returned without redirecting");
  }

  it("register_document_file_v1 rejects → .remove() with the EXACT uploaded path, honest ?docNotice=error", async () => {
    const uploads: UploadCall[] = [];
    const removes: RemoveCall[] = [];
    holder.server = makeServerClient(
      { data: null, error: { code: "P0001", message: "boom" } },
      uploads,
      removes,
    );
    const url = await runAction(formDataWithFile());
    expect(url).toBe("/en/dashboard/documents?docNotice=error");
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe("document-files");
    // Canonical path: worker/<worker_id>/doc/<worker_document_id>/v<version>/<filename>
    expect(uploads[0].path).toBe(
      `worker/worker-1/doc/${WORKER_DOC_ID}/v1/contract.pdf`,
    );
    expect(removes).toEqual([
      { bucket: "document-files", paths: [uploads[0].path] },
    ]);
  });

  it("RPC returns a non-'registered' outcome → also rolls back the blob", async () => {
    const uploads: UploadCall[] = [];
    const removes: RemoveCall[] = [];
    holder.server = makeServerClient(
      { data: "path_mismatch", error: null },
      uploads,
      removes,
    );
    const url = await runAction(formDataWithFile());
    expect(url).toBe("/en/dashboard/documents?docNotice=path_mismatch");
    expect(removes).toEqual([
      { bucket: "document-files", paths: [uploads[0].path] },
    ]);
  });

  it("NEGATIVE CONTROL: RPC registers → ?docNotice=uploaded and NO remove call", async () => {
    const uploads: UploadCall[] = [];
    const removes: RemoveCall[] = [];
    holder.server = makeServerClient(
      { data: "registered", error: null },
      uploads,
      removes,
    );
    const url = await runAction(formDataWithFile());
    expect(url).toBe("/en/dashboard/documents?docNotice=uploaded");
    expect(uploads).toHaveLength(1);
    expect(removes).toHaveLength(0);
  });
});

/* ── static source pins (same idiom as the other lib/guards) ────────────── */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/* ── 4. conversation-attachments — pre-send cleanup + honest partial fail ── */

describe("conversation attachments — orphan story (pre-send remove + honest register failure)", () => {
  const composer = read("components/app/communication-composer.tsx");
  const actions = read("lib/communication/actions.ts");

  it("removing an UPLOADED tray attachment deletes its blob (exact storagePath)", () => {
    expect(stripComments(composer)).toMatch(
      /status === "uploaded"[\s\S]{0,400}\.remove\(\[att\.storagePath\]\)/,
    );
  });

  it("post-send register failure never un-sends — counted and surfaced as attachmentsFailed", () => {
    const code = stripComments(actions);
    expect(code).toMatch(/attachmentsFailed \+= 1/);
    expect(code).toMatch(/attachmentsFailed/);
    // No storage delete in the send action: the message stays, the failure
    // is reported — the composer's remove control owns blob deletion.
    expect(code).not.toMatch(/storage[\s\S]{0,80}\.remove\(/);
  });
});

/* ── 5. customer-request-attachments — ownership path + blob-before-row ─── */

describe("customer request attachments — ownership path and honest removal order", () => {
  const uploader = read("components/app/buyer-request-attachment-uploader.tsx");
  const buyerLib = read("lib/buyer/customer-request-attachments.ts");

  it("uploads to the caller-owned path <profile_id>/<request_id>/<attachment_id>/…", () => {
    expect(uploader).toMatch(
      /\$\{profileId\}\/\$\{requestId\}\/\$\{attachmentId\}\//,
    );
  });

  it("register failure is surfaced honestly (no fake success)", () => {
    // The blob stays under the caller's OWN folder (owner-scoped storage
    // RLS) — documented in docs/STORAGE_FILE_FLOW_TRUTH.md; the user sees a
    // real error, never a pretend-registered attachment.
    expect(stripComments(uploader)).toMatch(
      /if \(!res\.ok\)[\s\S]{0,400}setErrorText/,
    );
  });

  it("user-initiated removal deletes the blob BEFORE the metadata row", () => {
    const fn = buyerLib.slice(
      buyerLib.indexOf("export async function removeAttachment"),
    );
    const removeIdx = fn.indexOf(".remove([row.storage_path");
    const deleteIdx = fn.indexOf(".delete()");
    expect(removeIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(removeIdx);
  });
});

/* ── signed-URL-only reads across ALL five flows ────────────────────────── */

describe("reads are short-TTL signed URLs only — getPublicUrl is banned", () => {
  const READ_PATHS = [
    "lib/journal/personal-gallery.ts",
    "lib/journal/project-gallery.ts",
    "lib/profile/avatar.ts",
    "lib/communication/attachments.ts",
    "lib/buyer/customer-request-attachments.ts",
    "app/api/documents/file/[fileId]/route.ts",
  ] as const;
  const WRITE_PATHS = [
    "lib/journal/photo-upload.ts",
    "lib/profile/avatar-upload.ts",
    "components/app/communication-composer.tsx",
    "components/app/buyer-request-attachment-uploader.tsx",
    "lib/documents/document-file-actions.ts",
  ] as const;

  for (const rel of READ_PATHS) {
    it(`${rel}: mints signed URLs and never a public URL`, () => {
      const code = stripComments(read(rel));
      expect(code).toMatch(/createSignedUrls?\(/);
      expect(code).not.toMatch(/getPublicUrl/i);
    });
  }
  for (const rel of WRITE_PATHS) {
    it(`${rel}: upload path never mints a public URL`, () => {
      expect(stripComments(read(rel))).not.toMatch(/getPublicUrl/i);
    });
  }
});

/* ── CV import — non-persistence is a DESIGNED privacy property ─────────── */

describe("CV extract route — persists NOTHING (designed privacy property, not a gap)", () => {
  // /api/cv/extract turns an uploaded CV into text and returns it ONLY to
  // the authenticated caller. NO blob is stored, NO DB row is written, NO
  // file is written to disk. "The CV file is not in a bucket" is BY DESIGN:
  // the person reviews the text and saves it into their own profile through
  // the existing owner-only flow. See docs/STORAGE_FILE_FLOW_TRUTH.md.
  const route = read("app/api/cv/extract/route.ts");
  const routeCode = stripComments(route);
  const extractLib = read("lib/cv/extract.ts");
  const extractCode = stripComments(extractLib);

  it("route: no storage API, no DB write, no fs write, no public URL", () => {
    for (const banned of [
      /\.storage\b/,
      /\bstorage\.from\(/,
      /\binsert\(/,
      /\bupsert\(/,
      /\bupdate\(/,
      /\bdelete\(/,
      /writeFile/i,
      /createWriteStream/i,
      /appendFile/i,
      /["']node:fs["']/,
      /["']fs\/promises["']/,
      /getPublicUrl/i,
    ]) {
      expect(routeCode).not.toMatch(banned);
    }
  });

  it("extractor lib: pure read — same bans hold", () => {
    for (const banned of [
      /\.storage\b/,
      /\binsert\(/,
      /\bupsert\(/,
      /writeFile/i,
      /createWriteStream/i,
      /["']node:fs["']/,
      /["']fs\/promises["']/,
    ]) {
      expect(extractCode).not.toMatch(banned);
    }
  });

  it("the route documents its non-persistence and the size-cap comment matches the code", () => {
    // The header must keep saying so — this is a contract, not decoration.
    expect(route).toMatch(/stores nothing and writes no DB row/);
    // Stale-comment regression pin (was "hard 5 MB size cap" while the real
    // cap was 25 MB): the comment must name the true cap and the code truth
    // stays pinned in lib/cv/extract.ts.
    expect(route).toMatch(/25 MB size cap/);
    expect(route).not.toMatch(/\b5 MB\b/);
    expect(extractLib).toMatch(
      /MAX_CV_BYTES = 25 \* 1024 \* 1024/,
    );
  });
});

/* ── document → journal draft — in-memory by design ─────────────────────── */

describe("document→journal draft — reads bytes, persists nothing", () => {
  const code = stripComments(read("lib/journal/document-journal-draft.ts"));
  it("downloads from the one bucket, never uploads or writes rows", () => {
    expect(code).toMatch(/\.download\(/);
    expect(code).not.toMatch(/\.upload\(/);
    expect(code).not.toMatch(/\binsert\(/);
    expect(code).not.toMatch(/\bupsert\(/);
  });
});
