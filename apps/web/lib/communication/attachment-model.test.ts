import { describe, expect, it } from "vitest";

import {
  CONVERSATION_ATTACHMENT_MAX_BYTES,
  CONVERSATION_ATTACHMENTS_PER_MESSAGE_MAX,
  canSendMessage,
  conversationAttachmentPath,
  isAllowedConversationAttachmentMime,
  isImageAttachmentMime,
  safeAttachmentFileName,
  validateConversationAttachments,
  type ConversationAttachmentInput,
} from "./attachment-model";

const CONV = "11111111-1111-1111-1111-111111111111";
const UID = "22222222-2222-2222-2222-222222222222";

function att(over: Partial<ConversationAttachmentInput> = {}): ConversationAttachmentInput {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    storagePath: `${CONV}/${UID}/att-1/photo.jpg`,
    ...over,
  };
}

describe("attachment MIME allowlist", () => {
  it("allows exactly the bucket's five types", () => {
    for (const m of ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"]) {
      expect(isAllowedConversationAttachmentMime(m)).toBe(true);
    }
    expect(isAllowedConversationAttachmentMime("image/heic")).toBe(false);
    expect(isAllowedConversationAttachmentMime("application/zip")).toBe(false);
    expect(isAllowedConversationAttachmentMime("text/html")).toBe(false);
    expect(isAllowedConversationAttachmentMime("")).toBe(false);
  });
  it("classifies images for inline rendering", () => {
    expect(isImageAttachmentMime("image/jpeg")).toBe(true);
    expect(isImageAttachmentMime("application/pdf")).toBe(false);
  });
});

describe("file-name sanitizer", () => {
  it("strips path/injection characters and never returns empty", () => {
    expect(safeAttachmentFileName("../../etc/passwd")).not.toContain("/");
    expect(safeAttachmentFileName("nuotrauka objektas #1.jpg")).toMatch(/^[a-zA-Z0-9._-]+$/);
    expect(safeAttachmentFileName("   ")).toBe("file");
    expect(safeAttachmentFileName("a".repeat(400)).length).toBeLessThanOrEqual(200);
  });
});

describe("storage path convention", () => {
  it("is <conversation>/<uploader>/<attachment>/<safe name>", () => {
    const p = conversationAttachmentPath({
      conversationId: CONV,
      uploaderId: UID,
      attachmentId: "att-9",
      fileName: "darbo nuotrauka.jpg",
    });
    expect(p.startsWith(`${CONV}/${UID}/att-9/`)).toBe(true);
    expect(p).not.toContain(" ");
  });
});

describe("batch validation (defense-in-depth mirror of the RPC)", () => {
  const ctx = { conversationId: CONV, uploaderId: UID };
  it("accepts a valid batch", () => {
    expect(validateConversationAttachments([att()], ctx)).toBeNull();
    expect(validateConversationAttachments([], ctx)).toBeNull();
  });
  it("rejects too many / too large / bad type / foreign path", () => {
    const many = Array.from({ length: CONVERSATION_ATTACHMENTS_PER_MESSAGE_MAX + 1 }, () => att());
    expect(validateConversationAttachments(many, ctx)).toBe("too_many");
    expect(
      validateConversationAttachments([att({ sizeBytes: CONVERSATION_ATTACHMENT_MAX_BYTES + 1 })], ctx),
    ).toBe("too_large");
    expect(validateConversationAttachments([att({ sizeBytes: 0 })], ctx)).toBe("too_large");
    expect(validateConversationAttachments([att({ mimeType: "application/zip" })], ctx)).toBe("bad_type");
    expect(
      validateConversationAttachments([att({ storagePath: `other-conv/${UID}/x/y.jpg` })], ctx),
    ).toBe("bad_path");
    expect(
      validateConversationAttachments([att({ storagePath: `${CONV}/other-user/x/y.jpg` })], ctx),
    ).toBe("bad_path");
  });
});

describe("send-button contract", () => {
  it("text-only, attachment-only and mixed messages are sendable", () => {
    expect(canSendMessage({ bodyLength: 5, uploadedCount: 0, uploadingCount: 0, failedCount: 0 })).toBe(true);
    expect(canSendMessage({ bodyLength: 0, uploadedCount: 1, uploadingCount: 0, failedCount: 0 })).toBe(true);
    expect(canSendMessage({ bodyLength: 5, uploadedCount: 2, uploadingCount: 0, failedCount: 0 })).toBe(true);
  });
  it("empty message is not sendable", () => {
    expect(canSendMessage({ bodyLength: 0, uploadedCount: 0, uploadingCount: 0, failedCount: 0 })).toBe(false);
  });
  it("in-flight or failed uploads block sending (no silent drops)", () => {
    expect(canSendMessage({ bodyLength: 5, uploadedCount: 0, uploadingCount: 1, failedCount: 0 })).toBe(false);
    expect(canSendMessage({ bodyLength: 5, uploadedCount: 1, uploadingCount: 0, failedCount: 1 })).toBe(false);
  });
});
