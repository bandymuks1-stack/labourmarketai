import { describe, expect, it } from "vitest";

import {
  authorizeExternalReferralRequest,
  REFERRAL_SOURCE_HEADER,
} from "./external-referral-auth";
import { EXTERNAL_REFERRAL_SOURCES, findExternalReferralSource } from "@/lib/invitations/external-sources";

const SECRET = "s".repeat(40);
const OTHER = "o".repeat(40);

function req(headers: Record<string, string>): Request {
  return new Request("https://labourmarket.ai/api/referrals/external/v1", {
    method: "POST",
    headers,
  });
}

describe("external referral auth — one secret per approved source", () => {
  const env = { EXTERNAL_REFERRAL_TOKEN_NONSTOP: SECRET };

  it("an unknown or malformed source slug is refused before any secret is looked at", () => {
    expect(authorizeExternalReferralRequest(req({ authorization: `Bearer ${SECRET}` }), env).kind).toBe("unknown_source");
    expect(
      authorizeExternalReferralRequest(
        req({ [REFERRAL_SOURCE_HEADER]: "not a slug!", authorization: `Bearer ${SECRET}` }),
        env,
      ).kind,
    ).toBe("unknown_source");
    expect(
      authorizeExternalReferralRequest(
        req({ [REFERRAL_SOURCE_HEADER]: "someone-else", authorization: `Bearer ${SECRET}` }),
        env,
      ).kind,
    ).toBe("unknown_source");
  });

  it("FAILS CLOSED while the source's secret is unset or too short", () => {
    expect(
      authorizeExternalReferralRequest(
        req({ [REFERRAL_SOURCE_HEADER]: "nonstop", authorization: `Bearer ${SECRET}` }),
        {},
      ).kind,
    ).toBe("not_configured");
    expect(
      authorizeExternalReferralRequest(
        req({ [REFERRAL_SOURCE_HEADER]: "nonstop", authorization: "Bearer short" }),
        { EXTERNAL_REFERRAL_TOKEN_NONSTOP: "short" },
      ).kind,
    ).toBe("not_configured");
  });

  it("a wrong, missing, or differently-schemed credential is unauthorized", () => {
    for (const authorization of [`Bearer ${OTHER}`, `Basic ${SECRET}`, SECRET, "Bearer ", `Bearer ${SECRET}x`]) {
      expect(
        authorizeExternalReferralRequest(
          req({ [REFERRAL_SOURCE_HEADER]: "nonstop", authorization }),
          env,
        ).kind,
        authorization,
      ).toBe("unauthorized");
    }
    expect(
      authorizeExternalReferralRequest(req({ [REFERRAL_SOURCE_HEADER]: "nonstop" }), env).kind,
    ).toBe("unauthorized");
  });

  it("the right secret under the right slug is ok, and names the source", () => {
    const r = authorizeExternalReferralRequest(
      req({ [REFERRAL_SOURCE_HEADER]: "nonstop", authorization: `Bearer ${SECRET}` }),
      env,
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.source.slug).toBe("nonstop");
      expect(r.source.consentVersion).toBe("worker-broader-search-v1");
    }
  });

  it("every registered source has its own env var and a slug the database CHECK accepts", () => {
    const envs = new Set<string>();
    for (const s of EXTERNAL_REFERRAL_SOURCES) {
      expect(s.slug).toMatch(/^[a-z0-9_-]{2,40}$/);
      expect(s.tokenEnv).toMatch(/^EXTERNAL_REFERRAL_TOKEN_[A-Z0-9_]+$/);
      expect(envs.has(s.tokenEnv), `${s.slug} must not share a secret`).toBe(false);
      envs.add(s.tokenEnv);
      expect(s.consentVersion.length).toBeGreaterThan(0);
      expect(findExternalReferralSource(s.slug)?.slug).toBe(s.slug);
    }
  });
});
