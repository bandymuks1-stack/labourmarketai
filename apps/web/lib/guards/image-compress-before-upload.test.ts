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
 * THE PAPERCLIP IS INTENT-AWARE (W7 slice 2). It used to send every file into
 * the CV importer whatever the conversation was about, so a worker mid-work-log
 * who tapped it to attach a site photo got a CV parser.
 */
describe("composer attach routes by active flow, never by file name", () => {
  const chat = read("components/app/conversation/chat/conversation-chat.tsx");

  it("both composers go through the one intent-aware handler", () => {
    expect(chat).toMatch(/onAttach=\{handleAttach\}/);
    // The old blind route must be gone from BOTH mounts.
    expect(chat).not.toMatch(/onAttach=\{\(\) => handleChip\(\{ id: "cv"/);
  });

  it("work-log context opens the photo path, CV context keeps CV import", () => {
    expect(chat).toMatch(/attachContextRef/);
    expect(chat).toMatch(/context === "worklog"/);
    expect(chat).toMatch(/context === "cv"/);
    expect(chat).toMatch(/photoFirst: true/);
  });

  it("an unknown context ASKS once instead of guessing", () => {
    expect(chat).toMatch(/labels\.attachChoice/);
    expect(chat).toMatch(/id: "attach:photo"/);
    expect(chat).toMatch(/id: "attach:cv"/);
  });
});

/** Every ACTIVE (routable) locale — an untranslated state on a live surface is
 *  a raw key in front of a real worker. */
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

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
      for (const k of ["attachChoice", "chipAttachPhoto", "chipAttachCv", "userAttachPhoto"]) {
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
      for (const k of ["attachChoice", "chipAttachPhoto", "chipAttachCv", "userAttachPhoto"]) {
        expect(typeof chat?.[k]).toBe("string");
      }
    });
  }
});