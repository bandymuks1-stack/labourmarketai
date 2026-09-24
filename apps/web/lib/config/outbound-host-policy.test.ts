import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkOutboundIntegrationUrl,
  classifyOutboundHost,
  isProductionDeployment,
  outboundIntegrationUrl,
  productionEvidence,
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
 *
 * TWO EVIDENCES (2026-09-24): `VERCEL_ENV` fails open when the variable goes
 * missing, so a request served on the production host is the second evidence
 * wherever a request exists. Either engages the refusal; a developer's local
 * host with no `VERCEL_ENV` still passes.
 */

const PROD = { VERCEL_ENV: "production" } as const;
const PREVIEW = { VERCEL_ENV: "preview" } as const;
const NONE = {} as const;

const PROD_HOST = "labourmarket.ai";
const PROD_ALIAS_HOST = "labourmarket-ai.vercel.app";
const PREVIEW_HOST = "lmai-git-feature-x.vercel.app";
const LOCAL_HOST = "localhost:3000";

const REFUSED: ReadonlyArray<[string, OutboundHostKind]> = [
  ["http://localhost:11434/v1", "loopback"],
  ["http://127.0.0.1:8085", "loopback"],
  ["http://127.5.6.7:8085", "loopback"],
  ["https://[::1]:8443/x", "loopback"],
  ["http://app.localhost:3000", "loopback"],
  // IPv4-mapped IPv6 loopback (2026-09-24): the URL parser spells every
  // `::ffff:a.b.c.d` as hex, so both spellings reach the classifier as hex.
  ["http://[::ffff:127.0.0.1]:8085", "loopback"],
  ["http://[::ffff:7f00:1]:8085", "loopback"],
  ["http://[::FFFF:7F05:0607]:8085", "loopback"],
  ["http://[0:0:0:0:0:ffff:7f00:1]:8085", "loopback"],
  ["http://0.0.0.0:8085", "unspecified"],
  ["http://10.0.0.5:8085", "private"],
  ["http://[::ffff:10.0.0.5]:8085", "private"],
  ["http://172.16.4.4:8085", "private"],
  ["http://172.31.255.1:8085", "private"],
  ["http://192.168.1.20:8085", "private"],
  ["http://[::ffff:c0a8:114]:8085", "private"],
  ["http://169.254.1.1:8085", "link_local"],
  ["http://[::ffff:169.254.1.1]:8085", "link_local"],
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
  "http://[::ffff:8.8.8.8]/x", // IPv4-mapped PUBLIC address — mapped is not local
  "http://[::ffff:808:808]/x",
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
  it("with no request: true only for Vercel's `production`", () => {
    expect(isProductionDeployment(PROD)).toBe(true);
    expect(isProductionDeployment({ VERCEL_ENV: " Production " })).toBe(true);
    expect(isProductionDeployment(PREVIEW)).toBe(false);
    expect(isProductionDeployment({ VERCEL_ENV: "development" })).toBe(false);
    expect(isProductionDeployment(NONE)).toBe(false);
    expect(isProductionDeployment(NONE, null)).toBe(false);
  });

  it("with a request: the production host is production evidence even when VERCEL_ENV is missing (fail closed)", () => {
    expect(isProductionDeployment(NONE, PROD_HOST)).toBe(true);
    expect(isProductionDeployment(NONE, `${PROD_HOST}:443`)).toBe(true);
    expect(isProductionDeployment(NONE, PROD_ALIAS_HOST)).toBe(true);
    expect(isProductionDeployment({ VERCEL_ENV: "development" }, PROD_HOST)).toBe(true);
    // OR, never AND: a preview variable does not veto a production host.
    expect(isProductionDeployment(PREVIEW, PROD_HOST)).toBe(true);
  });

  it("NEGATIVE CONTROL — a preview or local request with no production variable is not production", () => {
    expect(isProductionDeployment(NONE, PREVIEW_HOST)).toBe(false);
    expect(isProductionDeployment(NONE, LOCAL_HOST)).toBe(false);
    expect(isProductionDeployment(PREVIEW, PREVIEW_HOST)).toBe(false);
    expect(isProductionDeployment(NONE, "labourmarket.ai.evil.test")).toBe(false);
    // And a local host never lifts the variable's own evidence.
    expect(isProductionDeployment(PROD, LOCAL_HOST)).toBe(true);
  });

  it("names which evidence engaged — the variable first, the host when the variable is silent", () => {
    expect(productionEvidence(PROD)).toBe("env");
    expect(productionEvidence(PROD, PROD_HOST)).toBe("env");
    expect(productionEvidence(NONE, PROD_HOST)).toBe("host");
    expect(productionEvidence(PREVIEW, PROD_HOST)).toBe("host");
    expect(productionEvidence(NONE, PREVIEW_HOST)).toBeNull();
    expect(productionEvidence(NONE)).toBeNull();
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

describe("checkOutboundIntegrationUrl — the request Host is the second production evidence (2026-09-24)", () => {
  it("VERCEL_ENV missing + a request on the production host → every machine-bound host is refused", () => {
    for (const [url, kind] of REFUSED) {
      for (const host of [PROD_HOST, PROD_ALIAS_HOST, `${PROD_HOST}:443`]) {
        const r = checkOutboundIntegrationUrl(url, {
          integration: "AI_LOCAL_BASE_URL",
          env: NONE,
          requestHost: host,
          log: () => {},
        });
        expect(r.ok, `${url} on ${host}`).toBe(false);
        if (r.ok) continue;
        expect(r.reason).toBe("refused_host");
        expect(r.hostKind).toBe(kind);
      }
    }
  });

  it("a public host still passes on the production host with no variable", () => {
    for (const url of PUBLIC) {
      const r = checkOutboundIntegrationUrl(url, {
        integration: "NONSTOP_HANDOFF_ENDPOINT",
        env: NONE,
        requestHost: PROD_HOST,
      });
      expect(r.ok, url).toBe(true);
    }
  });

  it("NEGATIVE CONTROL — a preview request, or a developer's local request, with no production variable keeps the old behaviour", () => {
    for (const [url] of REFUSED) {
      for (const [env, host] of [
        [PREVIEW, PREVIEW_HOST],
        [NONE, PREVIEW_HOST],
        [NONE, LOCAL_HOST],
        [NONE, null],
        [{ VERCEL_ENV: "development" }, LOCAL_HOST],
      ] as const) {
        const r = checkOutboundIntegrationUrl(url, {
          integration: "VOICE_TRANSCRIBE_URL",
          env,
          requestHost: host,
        });
        expect(r.ok, `${url} with ${JSON.stringify(env)} on ${String(host)}`).toBe(true);
      }
    }
  });
});

describe("every read site hands the policy the request Host where it has one", () => {
  // Anti-vacuity: each file must call the policy AND pass `requestHost` —
  // a site that calls it without the host would silently be env-only again.
  const root = join(__dirname, "..");
  for (const rel of [
    "ai/runtime/config.ts",
    "voice/transcribe-action.ts",
    "notifications/telegram-owner-alerts.ts",
    "commercial/handoff-dispatch.ts",
  ]) {
    it(rel, () => {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).toMatch(/(checkOutboundIntegrationUrl|outboundIntegrationUrl)\(/);
      const call = src.slice(src.search(/(checkOutboundIntegrationUrl|outboundIntegrationUrl)\(/));
      expect(call.slice(0, call.indexOf("})"))).toMatch(/requestHost/);
    });
  }
  it("the entry points that have a request read it through the ONE reader", () => {
    for (const rel of [
      "ai/run-agent-server.ts",
      "ai/runtime/run.ts",
      "assist/assist.ts",
      "voice/transcribe-action.ts",
      "notifications/telegram-owner-alerts.ts",
      "commercial/handoff-dispatch.ts",
      "telemetry/actions.ts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).toMatch(/from "@\/lib\/config\/request-host"/);
      expect(src, rel).toMatch(/await readRequestHost\(\)/);
      // No second reader: the header is read in one module only.
      expect(src, rel).not.toMatch(/from "next\/headers"/);
    }
    const reader = readFileSync(join(root, "config/request-host.ts"), "utf8");
    expect(reader).toMatch(/import "server-only"/);
    expect(reader).toMatch(/from "next\/headers"/);
    expect(reader).toMatch(/catch \{\s*return null;/);
  });
  it("the pure rule never reads a header itself", () => {
    const policy = readFileSync(join(root, "config/outbound-host-policy.ts"), "utf8");
    expect(policy).not.toMatch(/next\/headers|headers\(\)/);
    const host = readFileSync(join(root, "telemetry/production-host.ts"), "utf8");
    expect(host).not.toMatch(/next\/headers|headers\(\)/);
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
      evidence: "env",
      effect: "integration treated as unconfigured",
    });
    expect(String(log.mock.calls[0][0])).not.toContain("ngrok");
  });

  it("makes a MISSING VERCEL_ENV on the production host visible: deployEnv `unset`, evidence `host` — and never the host", () => {
    const log = vi.fn();
    checkOutboundIntegrationUrl("http://[::ffff:127.0.0.1]:11434/v1", {
      integration: "AI_LOCAL_BASE_URL",
      env: NONE,
      requestHost: PROD_HOST,
      log,
    });
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(log.mock.calls[0][0])) as Record<string, unknown>;
    expect(line).toMatchObject({ hostKind: "loopback", deployEnv: "unset", evidence: "host" });
    expect(String(log.mock.calls[0][0])).not.toContain(PROD_HOST);
    expect(String(log.mock.calls[0][0])).not.toContain("ffff");
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
