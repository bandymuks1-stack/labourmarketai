import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IMAGE_COMPRESS_DEFAULTS,
  isCompressibleImage,
  computeTargetDimensions,
  compressImageFile,
} from "@/lib/browser/image-compress";

/**
 * Phone photos are auto-resized/compressed BEFORE upload (owner feedback,
 * 2026-06-23). The shared utility exists and is wired into every image upload
 * path, with mobile-sane defaults (longest edge 1600–1920px, JPEG/WebP, ~0.8).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("compress defaults match the owner spec", () => {
  it("longest edge is 1600–1920px", () => {
    expect(IMAGE_COMPRESS_DEFAULTS.maxEdge).toBeGreaterThanOrEqual(1600);
    expect(IMAGE_COMPRESS_DEFAULTS.maxEdge).toBeLessThanOrEqual(1920);
  });
  it("quality is ~0.75–0.85, output is JPEG/WebP", () => {
    expect(IMAGE_COMPRESS_DEFAULTS.quality).toBeGreaterThanOrEqual(0.75);
    expect(IMAGE_COMPRESS_DEFAULTS.quality).toBeLessThanOrEqual(0.85);
    expect(["image/jpeg", "image/webp"]).toContain(IMAGE_COMPRESS_DEFAULTS.mimeType);
  });
  it("exports the API the upload paths use", () => {
    expect(typeof compressImageFile).toBe("function");
    expect(typeof computeTargetDimensions).toBe("function");
    expect(isCompressibleImage({ type: "image/jpeg" } as File)).toBe(true);
    expect(isCompressibleImage({ type: "application/pdf" } as File)).toBe(false);
  });
});

describe("wired into every image upload path", () => {
  it("journal composer compresses + shows progress before upload", () => {
    const comp = read("components/app/journal-entry-composer.tsx");
    expect(comp).toMatch(/compressImageFile/);
    expect(comp).toMatch(/data-testid="journal-photo-preparing"/);
    expect(comp).toMatch(/data-testid="journal-photo-prepared"/);
  });
  it("buyer attachment uploader compresses images before upload", () => {
    const up = read("components/app/buyer-request-attachment-uploader.tsx");
    expect(up).toMatch(/isCompressibleImage\(picked\)/);
    expect(up).toMatch(/compressImageFile\(picked\)/);
  });
  it("chat work-log flow compresses + shows progress before upload", () => {
    // W7 slice 2: photo evidence reached the CONVERSATION, which is the
    // primary work surface. It must use the same three modules in the same
    // order as the journal composer — one compression rule, one 5 MB rule,
    // one write path — not a second implementation.
    const flow = read("components/app/conversation/worker-worklog-flow.tsx");
    expect(flow).toMatch(/compressImageFile/);
    expect(flow).toMatch(/isValidJournalPhoto/);
    expect(flow).toMatch(/uploadJournalEntryPhoto/);
    expect(flow).toMatch(/data-testid="worklog-photo-preparing"/);
    expect(flow).toMatch(/data-testid="worklog-photo-preview"/);
    expect(flow).toMatch(/data-testid="worklog-photo-remove"/);
    expect(flow).toMatch(/data-testid="worklog-photo-uploading"/);
  });
});

/**
 * FAIL-CLOSED ORDER. The entry is saved FIRST and the photo attached to the
 * returned id afterwards, so a storage failure costs the photo and never the
 * work record. A regression here would let a flaky upload lose a day of real
 * work, which is why it is pinned in source rather than left to review.
 */
describe("chat work-log: entry first, photo second, no fake success", () => {
  const flow = read("components/app/conversation/worker-worklog-flow.tsx");

  it("uploads only against a real entry id from the dispatcher", () => {
    expect(flow).toMatch(/parseEntryId/);
    expect(flow).toMatch(/uploadJournalEntryPhoto\(entryId, photoFile\)/);
  });

  it("a thrown uploader becomes a FAILED outcome, never a silent success", () => {
    expect(flow).toMatch(/outcome = "failed"/);
  });

  it("no photo state is rendered as blank — the outcome map is total", () => {
    // Record<JournalPhotoUploadResult, string> makes a new outcome a type
    // error instead of an empty line in the success banner.
    expect(flow).toMatch(/Record<JournalPhotoUploadResult, string>/);
    for (const k of ["uploaded", "invalid", "limit", '"not-ready"', "failed"]) {
      expect(flow).toContain(k);
    }
  });
});

/**
 * THE PAPERCLIP ATTACHES A FILE — and a second click attaches to the SAME open
 * form (owner P0 2026-09-23, CASE 5/6/7).
 *
 * W7 slice 2 made the paperclip "intent-aware" through a STICKY ref
 * (`attachContextRef`, set when a work-log or CV flow opened, never reset). A
 * click opened no file picker at all: in work-log context it pushed ANOTHER
 * independently savable form, and with no context it posted ANOTHER
 * "Kam skirtas šis failas?" — several clicks, several forms, several
 * questions. This block pins the replacement contract; each group carries a
 * negative control that fails on the old code.
 */
describe("the paperclip opens a file input and hands up the picked file", () => {
  const composer = read("components/app/conversation/chat/composer.tsx");

  it("a hidden file input with the doors' types, opened by the paperclip", () => {
    expect(composer).toMatch(/type="file"/);
    expect(composer).toContain(
      '"image/jpeg,image/png,image/webp,application/pdf,.docx,.txt"',
    );
    expect(composer).toMatch(/accept=\{COMPOSER_ATTACH_ACCEPT\}/);
    expect(composer).toMatch(/onClick=\{\(\) => fileRef\.current\?\.click\(\)\}/);
    expect(composer).toMatch(/if \(picked\) onAttachFile\(picked\);/);
    // The phone offers camera AND library — no forced capture.
    expect(composer).not.toMatch(/\bcapture=/);
    // NEGATIVE CONTROL: the zero-argument launcher is gone.
    expect(composer).not.toMatch(/onClick=\{\(\) => onAttach\(\)\}/);
  });

  it("ONE pending-attachment chip: name, blob:-only thumbnail, remove", () => {
    expect(composer).toMatch(/data-testid="composer-attachment"/);
    expect(composer).toMatch(/data-testid="composer-attachment-name"/);
    expect(composer).toMatch(/data-testid="composer-attachment-remove"/);
    // The worklog preview rule, kept identical: nameless Blob → blob: only.
    expect(composer).toMatch(/new Blob\(\[pendingAttachment\], \{ type: pendingAttachment\.type \}\)/);
    expect(composer).toMatch(/url\.startsWith\("blob:"\) \? url : null/);
    expect(composer).toMatch(/URL\.revokeObjectURL\(url\)/);
  });
});

describe("one pending attachment, no duplicate workflows", () => {
  const chat = read("components/app/conversation/chat/conversation-chat.tsx");
  const handler = chat.slice(
    chat.indexOf("const handleAttachFile = useCallback("),
    chat.indexOf("const resolveAttachChoice = useCallback("),
  );
  const resolver = chat.slice(
    chat.indexOf("const resolveAttachChoice = useCallback("),
    chat.indexOf("attachChoiceRef.current = resolveAttachChoice;"),
  );

  it("both composers hand the file to the one handler and show the one pending file", () => {
    expect(chat.match(/onAttachFile=\{handleAttachFile\}/g)).toHaveLength(2);
    expect(chat.match(/pendingAttachment=\{pendingAttachment\}/g)).toHaveLength(2);
    expect(chat.match(/onRemoveAttachment=\{discardPendingAttachment\}/g)).toHaveLength(2);
    // NEGATIVE CONTROL: the sticky context router is gone.
    expect(chat).not.toMatch(/attachContextRef/);
    expect(chat).not.toMatch(/onAttach=\{handleAttach\}/);
    expect(chat).not.toMatch(/context === "worklog"/);
  });

  it("an OPEN flow that takes the file gets it — before any question is asked", () => {
    expect(handler.length).toBeGreaterThan(100);
    const sinkAt = handler.indexOf("attachSinksRef.current.current(file)");
    const askAt = handler.indexOf("attachQuestionRef.current = assistant(");
    expect(sinkAt).toBeGreaterThan(-1);
    expect(askAt).toBeGreaterThan(sinkAt);
    // …and never a new flow from the handler itself.
    expect(handler).not.toMatch(/startWorkLog\(|pushEmbed\(/);
  });

  it("a second click attaches to the SAME open form instead of opening another", () => {
    // Once the person says "work photo", an already-open work-log form takes
    // it; only with none open does startWorkLog run.
    const openAt = resolver.indexOf('sinks.openOf("worklog", file)');
    const startAt = resolver.indexOf("startWorkLog(\"\", { photoFirst: true, file })");
    expect(openAt).toBeGreaterThan(-1);
    expect(startAt).toBeGreaterThan(openAt);
    expect(resolver).toMatch(/sinks\.openOf\("cv", file\)/);
  });

  it("ONE question per pending file: a new pick retires the old question first", () => {
    const retireAt = handler.indexOf("setItems((prev) => prev.filter((it) => it.id !== openId))");
    const askAt = handler.indexOf("attachQuestionRef.current = assistant(");
    expect(retireAt).toBeGreaterThan(-1);
    expect(askAt).toBeGreaterThan(retireAt);
    // A chip of a replaced / cancelled question answers nothing.
    expect(resolver).toMatch(/if \(!file \|\| Number\(seqRaw\) !== attachSeqRef\.current\) return;/);
  });

  it("the answers come from the ONE file router, not a private two-door list", () => {
    expect(handler).toMatch(/attachAnswersForFile\(file, \{/);
    // NEGATIVE CONTROL: the old hard-coded pair is gone.
    expect(chat).not.toMatch(/id: "attach:cv"/);
  });

  it("every file-owning flow registers its own field as the target, lifecycle-scoped", () => {
    const flow = read("components/app/conversation/worker-worklog-flow.tsx");
    expect(flow).toMatch(/useAttachSink\(\s*onRegisterAttachSink,\s*"worklog",/);
    // The paperclip's photo enters through the form's OWN pick (compress →
    // validate → preview), and still uploads only after the entry is saved.
    expect(flow).toMatch(/useInitialFile\(initialFile, \(f\) => void pickPhoto\(f\)\)/);
    const cv = read("components/app/conversation/worker-cv-flow.tsx");
    expect(cv).toMatch(/useAttachSink\(onRegisterAttachSink, "cv",/);
    const doc = read("components/app/conversation/chat/document-file-embed.tsx");
    expect(doc).toMatch(/useAttachSink\(\s*onRegisterAttachSink,\s*"document",/);
  });
});

describe("the attach target stack (behaviour, not source)", () => {
  const photo = { type: "image/jpeg", name: "a.jpg" } as File;
  const pdf = { type: "application/pdf", name: "a.pdf" } as File;
  const sink = (kind: "worklog" | "cv" | "document", accept: RegExp) => {
    const got: File[] = [];
    return {
      got,
      sink: { kind, accepts: (f: File) => accept.test(f.type), attach: (f: File) => void got.push(f) },
    };
  };

  it("the newest open flow is the target, and withdrawing it hands back the older one", async () => {
    const { createAttachSinkStack } = await import("@/components/app/conversation/attach-sink");
    const stack = createAttachSinkStack();
    const log = sink("worklog", /^image\//);
    const cv = sink("cv", /pdf$/);
    const offLog = stack.register(log.sink);
    expect(stack.current(photo)).toBe(log.sink);
    const offCv = stack.register(cv.sink);
    // The newest (CV) does not take a photo → no silent pick of the older one.
    expect(stack.current(photo)).toBeNull();
    expect(stack.current(pdf)).toBe(cv.sink);
    // Once the person SAYS "work photo", the open work-log form is found.
    expect(stack.openOf("worklog", photo)).toBe(log.sink);
    offCv();
    expect(stack.current(photo)).toBe(log.sink);
    offLog();
    // NEGATIVE CONTROL for the sticky ref: a closed flow is no target at all.
    expect(stack.current(photo)).toBeNull();
    expect(stack.openOf("worklog", photo)).toBeNull();
  });
});

/** Every ACTIVE (routable) locale — an untranslated state on a live surface is
 *  a raw key in front of a real worker. */
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de", "pl"] as const;

/** The attach question, its answers, the composer chip and the typed photo
 *  door (owner P0 2026-09-23 added everything after `userAttachPhoto`). */
const ATTACH_CHAT_KEYS = [
  "attachChoice",
  "chipAttachPhoto",
  "chipAttachCv",
  "userAttachPhoto",
  "chipAttachDocument",
  "chipAttachWorkReport",
  "chipAttachOrgDocument",
  "chipAttachOther",
  "attachUnsupported",
  "attachLinkNote",
  "attachRemove",
  "attachSelected",
  "fileSelfWorkEvidence",
] as const;

describe("photo progress copy present in every active locale", () => {
  for (const loc of ACTIVE_LOCALES) {
    it(`${loc}: journal.photo covers the full state set`, () => {
      const photo = JSON.parse(read(`messages/${loc}/journal.json`)).photo;
      for (const k of [
        "preparing",
        "prepared",
        "tooLargeAfter",
        // W7 slice 2 — the states the chat surface added.
        "uploading",
        "remove",
        "previewAlt",
        // Every JournalPhotoUploadResult needs its sentence.
        "uploaded",
        "invalidFile",
        "limitReached",
        "notReady",
        "uploadFailed",
      ]) {
        expect(typeof photo?.[k] === "string" && photo[k].length > 0, `${loc} photo.${k}`).toBe(true);
      }
    });

    it(`${loc}: attach-choice copy exists and is not an [EN] marker`, () => {
      const chat = JSON.parse(read(`messages/${loc}.json`)).conversation?.chat;
      for (const k of ATTACH_CHAT_KEYS) {
        const v = chat?.[k];
        expect(typeof v === "string" && v.length > 0, `${loc} chat.${k}`).toBe(true);
        // Active locales carry zero untranslated debt (i18n ratchet).
        expect(String(v).startsWith("[EN]"), `${loc} chat.${k} untranslated`).toBe(false);
      }
    });
  }
});

/** §2.4 file-presence: a new key lands in ALL locale files in the same PR,
 *  translated where the ratchet requires it and honestly marked elsewhere. */
describe("new photo keys land in every locale file", () => {
  const ALL = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"] as const;
  for (const loc of ALL) {
    it(`${loc}: has the new journal.photo + conversation.chat keys`, () => {
      const photo = JSON.parse(read(`messages/${loc}/journal.json`)).photo;
      for (const k of ["uploading", "remove", "previewAlt"]) {
        expect(typeof photo?.[k]).toBe("string");
      }
      const chat = JSON.parse(read(`messages/${loc}.json`)).conversation?.chat;
      for (const k of ATTACH_CHAT_KEYS) {
        expect(typeof chat?.[k], `${loc} chat.${k}`).toBe("string");
      }
      // The two work-log lines the validator-parity change added.
      const worklog = JSON.parse(read(`messages/${loc}.json`)).conversation?.worklog;
      for (const k of ["errorNotesTooLong", "noWorkSignalHint"]) {
        expect(typeof worklog?.[k], `${loc} worklog.${k}`).toBe("string");
      }
    });
  }
});

/** The chips STATE whose file it is ("Mano gyvenimo aprašymas (CV)", not
 *  "CV") — the question is also the subject question, so a bare noun would be
 *  an unstated subject. The CV chip deliberately avoids the exact title
 *  "Mano CV" / "My CV": that title belongs to the /cv page alone
 *  (cv-workspace-ia guard). */
describe("the attach answers state the subject", () => {
  it("lt/en: the self doors say 'my'", () => {
    const lt = JSON.parse(read("messages/lt.json")).conversation.chat;
    const en = JSON.parse(read("messages/en.json")).conversation.chat;
    for (const k of ["chipAttachPhoto", "chipAttachCv", "chipAttachDocument"]) {
      expect(lt[k], `lt ${k}`).toMatch(/^Mano /);
      expect(en[k], `en ${k}`).toMatch(/^My /);
    }
  });
});