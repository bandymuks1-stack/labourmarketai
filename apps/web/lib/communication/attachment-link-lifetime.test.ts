import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONVERSATION_ATTACHMENT_SIGNED_URL_TTL_SECONDS } from "./attachment-model";

/**
 * A participant's attachment link is a signed Storage URL: Storage checks the
 * signature, not whether the holder is still in the thread. A link issued
 * before a removal therefore works until it expires, so the lifetime is kept
 * short (security model §3, honest gaps; walk #3239 step 7b).
 */
describe("chat attachment link lifetime", () => {
  it("is at most 60 seconds", () => {
    expect(CONVERSATION_ATTACHMENT_SIGNED_URL_TTL_SECONDS).toBeGreaterThan(0);
    expect(CONVERSATION_ATTACHMENT_SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(60);
  });

  it("the attachment reader signs with that constant, never a literal", () => {
    const src = readFileSync(join(__dirname, "attachments.ts"), "utf8");
    expect(src).toContain("createSignedUrl(row.storage_path, CONVERSATION_ATTACHMENT_SIGNED_URL_TTL_SECONDS)");
    expect(src).not.toMatch(/createSignedUrl\([^)]*,\s*\d+\s*\)/);
  });

  it("the thread page keeps re-minting links at least as often as they expire", () => {
    const src = readFileSync(join(__dirname, "..", "..", "components", "app", "refresh-on-focus.tsx"), "utf8");
    const interval = Number(/intervalMs = ([\d_]+)/.exec(src)?.[1]?.replace(/_/g, ""));
    expect(interval / 1000).toBeLessThanOrEqual(CONVERSATION_ATTACHMENT_SIGNED_URL_TTL_SECONDS);
  });
});
