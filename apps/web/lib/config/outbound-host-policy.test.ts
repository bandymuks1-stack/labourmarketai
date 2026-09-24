import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkOutboundIntegrationUrl,
  classifyOutboundHost,
  isProductionDeployment,
  outboundIntegrationUrl,
  resetOutboundHostPolicyLog,
  type OutboundHostKind,
} from "./outbound-host-policy";

/**
 * THE PRODUCTION-MUST-NOT-DEPEND-ON-A-PC RULE, as a unit.
 *
 * Positive: a public https host passes in every environment. Negative: in
 * production every host class that can only be somebody's machine is refused
 * and reported by class — and the same value passes on a preview, so the
 * refusal is a PRODUCTION property, not a validation tightening.
 */

const PROD = { VERCEL_ENV: "production" } as const;
const PREVIEW = { VERCEL_ENV: "preview" } as const;
const NONE = {} as const;

const REFUSED: ReadonlyArray<[string, OutboundHostKind]> = [
  ["http://localhost:11434/v1", "loopback"],
  ["http://127.0.0.1:8085", "loopback"],
  ["http://127.5.6.7:8085", "loopback"],
  ["https://[::1]:8443/x", "loopback"],
  ["http://app.localhost:3000", "loopback"],
  ["http://0.0.0.0:8085", "unspecified"],
  ["http://10.0.0.5:8085", "private"],
  ["http://172.16.4.4:8085", "private"],
  ["http://172.31.255.1:8085", "private"],
  ["http://192.168.1.20:8085", "private"],
  ["http://169.254.1.1:8085", "link_local"],
  ["https://[fe80::1]/x", "link_local"],
  ["https://[fd12:3456::1]/x", "ipv6_ula"],
  ["https://[fc00::1]/x", "ipv6_ula"],
  ["https://owner-pc.local/x", "local_tld"],
  ["https://gpu.internal/x", "local_tld"],
  ["https://abc123.ngrok-free.app/v1", "tunnel"],
  ["https://abc123.ngrok.io/v1", "tunnel"],
  ["https://abc123.ngrok.app/v1", "tunnel"],
  ["https://abc123.ngrok.dev/v1", "tunnel"],
  ["https://quick-words-sing.trycloudflare.com/v1", "tunnel"],
  ["https://owner.loca.lt/v1", "tunnel"],
];

const PUBLIC = [
  "https://nonstopgroup.eu/api/partners/labourmarket/handoffs/v1",
  "https://transcribe.labourmarket.ai",
  "https://gpu.example.com:8443/inference/v1",
  "https://api.telegram.org/bot/x",
  "https://172.16.example.com/x", // a NAME that merely contains digits
  "https://ngrok.example.com/x", // ngrok as a subdomain label, not the service
];

beforeEach(() => resetOutboundHostPolicyLog());

describe("classifyOutboundHost", () => {
  it("names each refused class", () => {
    for (const [url, kind] of REFUSED) {
      expect(classifyOutboundHost(new URL(url).hostname), url).toBe(kind);
    }
  });
  it("calls a real public host public", () => {
    for (const url of PUBLIC) {
      expect(classifyOutboundHost(new URL(url).hostname), url).toBe("public");
    }
  });
  it("treats an absent host as loopback (fail closed)", () => {
    expect(classifyOutboundHost("")).toBe("loopback");
    expect(classifyOutboundHost(undefined)).toBe("loopback");
  });
});

describe("isProductionDeployment", () => {
  it("is true only for Vercel's `production`", () => {
    expect(isProductionDeployment(PROD)).toBe(true);
    expect(isProductionDeployment({ VERCEL_ENV: " Production " })).toBe(true);
    expect(isProductionDeployment(PREVIEW)).toBe(false);
    expect(isProductionDeployment({ VERCEL_ENV: "development" })).toBe(false);
    expect(isProductionDeployment(NONE)).toBe(false);
  });
});

describe("checkOutboundIntegrationUrl — PRODUCTION refuses every machine-bound host", () => {
  for (const [url, kind] of REFUSED) {
    it(`refuses ${url} as ${kind}`, () => {
      const log = vi.fn();
      const r = checkOutboundIntegrationUrl(url, {
        integration: "VOICE_TRANSCRIBE_URL",
        env: PROD,
        log,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("refused_host");
      expect(r.hostKind).toBe(kind);
      expect(r.detail).toContain("VOICE_TRANSCRIBE_URL");
      expect(r.detail).toContain(kind);
      // The value never appears in what an operator is shown.
      expect(r.detail).not.toContain(new URL(url).hostname);
      expect(outboundIntegrationUrl(url, { integration: "VOICE_TRANSCRIBE_URL", env: PROD, log })).toBeUndefined();
    });
  }

  it("passes every public host in production, unchanged", () => {
    for (const url of PUBLIC) {
      const r = checkOutboundIntegrationUrl(url, {
        integration: "NONSTOP_HANDOFF_ENDPOINT",
        env: PROD,
      });
      expect(r, url).toEqual({ ok: true, url, hostKind: "public" });
    }
  });

  it("returns the trimmed original, never a re-serialised URL", () => {
    const r = checkOutboundIntegrationUrl("  https://gpu.example.com/inference/v1/  ", {
      integration: "AI_LOCAL_BASE_URL",
      env: PROD,
    });
    expect(r.ok && r.url).toBe("https://gpu.example.com/inference/v1/");
  });
});

describe("checkOutboundIntegrationUrl — preview / local keep the old behaviour", () => {
  it("a loopback or tunnel value passes on a preview deployment and with no VERCEL_ENV", () => {
    for (const [url] of REFUSED) {
      for (const env of [PREVIEW, NONE]) {
        const r = checkOutboundIntegrationUrl(url, {
          integration: "AI_LOCAL_BASE_URL",
          env,
        });
        expect(r.ok, `${url} with ${JSON.stringify(env)}`).toBe(true);
      }
    }
  });

  it("missing and unparseable values fail everywhere, by their own reasons", () => {
    for (const env of [PROD, PREVIEW, NONE]) {
      expect(
        checkOutboundIntegrationUrl(undefined, { integration: "AI_LOCAL_BASE_URL", env }),
      ).toMatchObject({ ok: false, reason: "missing" });
      expect(
        checkOutboundIntegrationUrl("   ", { integration: "AI_LOCAL_BASE_URL", env }),
      ).toMatchObject({ ok: false, reason: "missing" });
      expect(
        checkOutboundIntegrationUrl("not a url", { integration: "AI_LOCAL_BASE_URL", env }),
      ).toMatchObject({ ok: false, reason: "invalid_url" });
    }
  });
});

describe("the refusal log line", () => {
  it("is ONE structured JSON line per integration+class, naming the class and never the host", () => {
    const log = vi.fn();
    const url = "https://abc123.ngrok-free.app/alert";
    checkOutboundIntegrationUrl(url, { integration: "AGENTAI_OS_ALERT_ENDPOINT", env: PROD, log });
    checkOutboundIntegrationUrl(url, { integration: "AGENTAI_OS_ALERT_ENDPOINT", env: PROD, log });
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(log.mock.calls[0][0])) as Record<string, unknown>;
    expect(line).toEqual({
      event: "outbound_host_refused",
      integration: "AGENTAI_OS_ALERT_ENDPOINT",
      hostKind: "tunnel",
      deployEnv: "production",
      effect: "integration treated as unconfigured",
    });
    expect(String(log.mock.calls[0][0])).not.toContain("ngrok");
  });

  it("is not written outside production", () => {
    const log = vi.fn();
    checkOutboundIntegrationUrl("http://localhost:11434/v1", {
      integration: "AI_LOCAL_BASE_URL",
      env: PREVIEW,
      log,
    });
    expect(log).not.toHaveBeenCalled();
  });
});
