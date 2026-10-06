import { describe, expect, it } from "vitest";

import { getSafeReturnPath } from "@/lib/auth/redirect";
import {
  buildActivationNext,
  buildActivationSignupHref,
  inboundAttributionMetadata,
  parseContentTag,
  parseInboundReferral,
  referenceOfContentTag,
} from "@/lib/auth/worker-activation";

const TAG = "ns-inbound-0123456789ab";
const SEARCH =
  `?utm_source=nonstop&utm_medium=email&utm_campaign=worker-inbound-2026-09&utm_content=${TAG}`;

describe("parseInboundReferral", () => {
  it("accepts the exact campaign link the e-mail carries", () => {
    const ref = parseInboundReferral(new URLSearchParams(SEARCH));
    expect(ref).toEqual({
      sourceSlug: "nonstop",
      contentTag: TAG,
      reference: "0123456789ab",
      campaign: "worker-inbound-2026-09",
      medium: "email",
    });
  });

  it("falls back to null for anything that is not the campaign (never a guess)", () => {
    const cases = [
      "",
      "?utm_source=google&utm_content=" + TAG,
      "?utm_source=nonstop",
      "?utm_source=nonstop&utm_content=ns-inbound-0123456789A", // short + uppercase
      "?utm_source=nonstop&utm_content=ns-inbound-0123456789AB",
      "?utm_source=nonstop&utm_content=ns-inbound-0123456789abc", // 13 hex
      "?utm_source=nonstop&utm_content=" + encodeURIComponent(TAG + "<script>"),
      "?utm_source=nonstop&utm_content=other-0123456789ab",
    ];
    for (const c of cases) {
      expect(parseInboundReferral(new URLSearchParams(c)), c).toBeNull();
    }
  });

  it("drops a malformed campaign/medium but keeps the valid reference", () => {
    const ref = parseInboundReferral(
      new URLSearchParams(
        `?utm_source=nonstop&utm_content=${TAG}&utm_campaign=<x>&utm_medium=A B`,
      ),
    );
    expect(ref?.reference).toBe("0123456789ab");
    expect(ref?.campaign).toBeNull();
    expect(ref?.medium).toBeNull();
  });
});

describe("content tag helpers", () => {
  it("referenceOfContentTag returns the 12 hex only for a valid tag", () => {
    expect(referenceOfContentTag(TAG)).toBe("0123456789ab");
    expect(referenceOfContentTag("ns-inbound-xyz")).toBeNull();
    expect(referenceOfContentTag(null)).toBeNull();
    expect(parseContentTag(TAG + "\n")).toBeNull();
  });
});

describe("activation URLs", () => {
  it("builds a signup URL that carries the campaign AND the next-step destination", () => {
    const href = buildActivationSignupHref(SEARCH);
    expect(href).not.toBeNull();
    const url = new URL(href as string, "https://labourmarket.ai");
    expect(url.pathname).toBe("/auth/signup");
    expect(url.searchParams.get("utm_source")).toBe("nonstop");
    expect(url.searchParams.get("utm_content")).toBe(TAG);
    expect(url.searchParams.get("next")).toBe(
      `/dashboard/privacy?activation=worker&referral=${TAG}`,
    );
  });

  it("returns null (plain /auth/signup) for a visit without the campaign", () => {
    expect(buildActivationSignupHref("")).toBeNull();
    expect(buildActivationSignupHref("?utm_source=nonstop")).toBeNull();
  });

  it("the next value survives the existing safe-return sanitiser, locale-prefixed", () => {
    const ref = parseInboundReferral(new URLSearchParams(SEARCH));
    const next = buildActivationNext(ref);
    expect(getSafeReturnPath(next, "lt")).toBe(
      `/lt/dashboard/privacy?activation=worker&referral=${TAG}`,
    );
  });

  it("without a reference the next-step panel is still reachable, with no referral param", () => {
    expect(buildActivationNext(null)).toBe("/dashboard/privacy?activation=worker");
  });

  it("signup metadata is exactly the utm_* set - no consent, no profile fact", () => {
    const ref = parseInboundReferral(new URLSearchParams(SEARCH));
    expect(Object.keys(inboundAttributionMetadata(ref!)).sort()).toEqual([
      "utm_campaign",
      "utm_content",
      "utm_medium",
      "utm_source",
    ]);
  });
});
