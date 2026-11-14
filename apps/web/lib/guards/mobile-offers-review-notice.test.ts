import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REVIEW_NOTICE_VERSION, STAFF_INVITATION_TYPES } from "@/lib/operations/auto-review-model";

/**
 * The phone accepts staff invitations too, so it must show the same review
 * sentence and send the same notice version as the web; otherwise the accept
 * records no notice and the new engagement gets no automatic journal review.
 * The phone cannot import the web module, so this pins its mirrored
 * constants and its wiring to the web's own.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const offers = readFileSync(join(REPO, "apps", "mobile", "src", "screens", "offers.tsx"), "utf8");

describe("mobile invitation accept carries the staff review notice", () => {
  it("mirrors the web's version and staff invitation types exactly", () => {
    expect(offers).toContain(`const REVIEW_NOTICE_VERSION = "${REVIEW_NOTICE_VERSION}";`);
    expect(offers).toContain(
      `const STAFF_INVITATION_TYPES: readonly string[] = ${JSON.stringify(STAFF_INVITATION_TYPES).replace(/,/g, ", ")};`,
    );
  });

  it("shows the sentence and sends the version only when the notice applies", () => {
    expect(offers).toContain('...(showsStaffReviewNotice(answer.offer) ? { reviewNotice: REVIEW_NOTICE_VERSION } : {}),');
    expect(offers).toContain('{showsStaffReviewNotice(offer) ? (');
    expect(offers).toContain('if (offer.ref.source !== "invitation") return false;');
  });
});
