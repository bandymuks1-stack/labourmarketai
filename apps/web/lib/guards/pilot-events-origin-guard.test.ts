import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guard — pilot_events WRITE ORIGIN (2026-09-20).
 *
 * THE INCIDENT. `apps/web/.env.local` points at the PRODUCTION Supabase
 * project. A local production build (`next start`) walked by a browser for a
 * launch smoke wrote `landing_viewed` / `job_opened` / `job_board_viewed`
 * rows into production `pilot_events` on 2026-09-20 (12:52Z, 14:06Z; routes
 * `/pl/jobs/…`, campaign `lm-job-welder-se-2026-09`, content
 * `fbg-job-e3ec6c1e-10chef2-pl`) exactly like a real visitor would. The
 * client's own `preview_host` marker was the ONLY thing keeping them out of
 * the owner's per-campaign funnel, and `app_version` was NULL on every row of
 * the day, so nothing recorded which build or environment had written what.
 *
 * THE RULES PINNED HERE.
 *   1. A write whose request Host header is a LOCAL host is REFUSED by the
 *      server action — no row, no tag. The refusal is keyed on the Host
 *      header only: an env-keyed refusal could blank the production funnel
 *      if VERCEL_ENV ever went missing, whereas a local Host cannot be
 *      produced by production traffic at all.
 *   2. Every accepted row is stamped SERVER-SIDE with `metadata.deploy_env`
 *      (from Vercel's own VERCEL_ENV; anything else = `local`) and
 *      `app_version` (`<origin>@<commit>`). A client-supplied value for
 *      either is overwritten — the client never says which build it is.
 *   3. A non-production Host (a *.vercel.app preview) ALSO gets
 *      `preview_host: true` stamped server-side, so the client marker is no
 *      longer the only defence.
 *   4. Every reader — the acquisition funnel, its per-campaign read-out,
 *      time-to-value, TTFV — excludes non-production origins through ONE
 *      shared rule, and the funnel reports how many it excluded.
 *   5. Rows written BEFORE the stamp (no `deploy_env`) are judged by the
 *      client marker alone — no historical row changes population.
 */

// ── Mocks for the server action ───────────────────────────────────────────
const hostMock = vi.fn<() => string | null>(() => "labourmarket.ai");
const headersThrow = { value: false };
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => {
    if (headersThrow.value) throw new Error("outside request scope");
    return { get: (name: string) => (name === "host" ? hostMock() : null) };
  }),
}));

const insertMock = vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>(
  async () => ({ error: null }),
);
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: () => ({ insert: insertMock }),
  })),
}));

import { recordTelemetryEvent } from "@/lib/telemetry/actions";
import {
  DEPLOY_ENV_KEY,
  deployEnvFromEnv,
  ipv4MappedAddress,
  isLocalHostname,
  isNonProductionOrigin,
  isProductionHost,
  telemetryAppVersion,
  telemetryOriginFromEnv,
} from "@/lib/telemetry/production-host";
import { classifyEvent, countsForBusinessFunnel } from "@/lib/analytics/population";
import { summariseFunnel } from "@/lib/admin/conversion-funnel";
import { summariseTtfv } from "@/lib/admin/ttfv-by-actor";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

const ENV_KEYS = ["VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "VERCEL_DEPLOYMENT_ID"] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  hostMock.mockReturnValue("labourmarket.ai");
  headersThrow.value = false;
  insertMock.mockClear();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const baseInput = {
  sessionId: "s_guard",
  route: "/pl/jobs/e3ec6c1e-51d9-47be-81d6-1dce0b5f0000",
  locale: "pl",
  eventName: FUNNEL_EVENTS.jobOpened,
  metadata: {
    utm_campaign: "lm-job-welder-se-2026-09",
    utm_content: "fbg-job-e3ec6c1e-10chef2-pl",
  },
};

const insertedRow = () =>
  insertMock.mock.calls[0]?.[0] as
    | { metadata: Record<string, unknown>; app_version: string | null }
    | undefined;

/* ------------------------------------------------------------------ */
/* Rule 1 — a local host is REFUSED, not tagged                          */
/* ------------------------------------------------------------------ */

describe("origin guard — a local host cannot write a row", () => {
  it("recognises every way a developer's own process is reached", () => {
    for (const h of [
      "localhost",
      "localhost:3000",
      "LOCALHOST:3000",
      "app.localhost:3000",
      "127.0.0.1",
      "127.0.0.1:3000",
      "127.1.2.3",
      "[::1]:3000",
      "::1",
      "0.0.0.0:3000",
      "10.0.0.5:3000",
      "192.168.1.10:3000",
      "172.16.0.2",
      "172.31.255.255:8080",
      "169.254.10.10",
      // IPv4-mapped IPv6 (2026-09-24): how a dual-stack listener reports a
      // loopback or LAN client — dotted, hex, bracketed, with a port.
      "::ffff:127.0.0.1",
      "[::ffff:127.0.0.1]:3000",
      "::ffff:127.5.6.7",
      "::ffff:7f00:1",
      "[::FFFF:7F00:0001]:3000",
      "::ffff:7f05:607",
      "0:0:0:0:0:ffff:7f00:1",
      "::ffff:10.0.0.5",
      "::ffff:a00:5",
      "::ffff:192.168.1.10",
      "[::ffff:c0a8:10a]:3000",
      "::ffff:169.254.10.10",
    ]) {
      expect(isLocalHostname(h), h).toBe(true);
    }
  });

  it("does NOT call a real deployment local — previews are tagged, not refused", () => {
    for (const h of [
      "labourmarket.ai",
      "www.labourmarket.ai",
      "labourmarket-ai.vercel.app",
      "lmai-git-feature-x.vercel.app",
      "172.32.0.1", // just outside the private range
      "8.8.8.8",
      // NEGATIVE CONTROL — a mapped PUBLIC address is judged as that address.
      "::ffff:8.8.8.8",
      "[::ffff:808:808]:3000",
      "::ffff:172.32.0.1",
      // Not a mapped form at all: a bare `ffff:` group, or a lookalike.
      "ffff:7f00:1",
      "::fffe:7f00:1",
      "",
      null,
      undefined,
    ]) {
      expect(isLocalHostname(h), String(h)).toBe(false);
    }
  });

  it("names the IPv4 an IPv4-mapped literal stands for, and nothing for any other spelling", () => {
    expect(ipv4MappedAddress("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(ipv4MappedAddress("::ffff:7f00:1")).toBe("127.0.0.1");
    expect(ipv4MappedAddress("::ffff:c0a8:10a")).toBe("192.168.1.10");
    expect(ipv4MappedAddress("0:0:0:0:0:ffff:a9fe:a0a")).toBe("169.254.10.10");
    expect(ipv4MappedAddress("::1")).toBeNull();
    expect(ipv4MappedAddress("127.0.0.1")).toBeNull();
    expect(ipv4MappedAddress("fe80::1")).toBeNull();
    expect(ipv4MappedAddress("labourmarket.ai")).toBeNull();
  });

  it("the production host is never local, and a local host is never production", () => {
    expect(isProductionHost("localhost:3000")).toBe(false);
    expect(isLocalHostname("labourmarket.ai")).toBe(false);
  });

  it("REFUSES the exact incident: a local `next start` walked like a visitor", async () => {
    hostMock.mockReturnValue("localhost:3000");
    const out = await recordTelemetryEvent(baseInput);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.code).toBe("non_production_origin");
    // No row. Not a tagged row — NO row.
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("refuses a LAN-address walk too", async () => {
    hostMock.mockReturnValue("192.168.1.10:3000");
    const out = await recordTelemetryEvent(baseInput);
    expect(out.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("refuses even when VERCEL_ENV claims production — the Host header is the evidence", async () => {
    process.env.VERCEL_ENV = "production";
    hostMock.mockReturnValue("localhost:3000");
    const out = await recordTelemetryEvent(baseInput);
    expect(out.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does NOT refuse when the header cannot be read — a header failure must never blank the funnel", async () => {
    headersThrow.value = true;
    process.env.VERCEL_ENV = "production";
    const out = await recordTelemetryEvent(baseInput);
    expect(out.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledTimes(1);
    // …and with no host in evidence, no preview marker is invented.
    expect(insertedRow()!.metadata.preview_host).toBeUndefined();
  });

  it("does NOT refuse on VERCEL_ENV alone: an unset env on a production host is tagged, not dropped", async () => {
    // The asymmetry that keeps a platform misconfiguration visible instead of
    // silent: the rows land, stamped `local`, and show up in the excluded
    // count — they are not lost.
    hostMock.mockReturnValue("labourmarket.ai");
    const out = await recordTelemetryEvent(baseInput);
    expect(out.ok).toBe(true);
    expect(insertedRow()!.metadata[DEPLOY_ENV_KEY]).toBe("local");
  });
});

/* ------------------------------------------------------------------ */
/* Rule 2 + 3 — the server stamps origin and build                       */
/* ------------------------------------------------------------------ */

describe("origin guard — every accepted row says where it was written from", () => {
  it("maps Vercel's environment to the origin, and anything else to local", () => {
    expect(telemetryOriginFromEnv({ VERCEL_ENV: "production" })).toBe("production");
    expect(telemetryOriginFromEnv({ VERCEL_ENV: "Production" })).toBe("production");
    expect(telemetryOriginFromEnv({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(telemetryOriginFromEnv({ VERCEL_ENV: "development" })).toBe("local");
    expect(telemetryOriginFromEnv({ VERCEL_ENV: "" })).toBe("local");
    expect(telemetryOriginFromEnv({})).toBe("local");
    expect(telemetryOriginFromEnv({ VERCEL_ENV: "staging" })).toBe("local");
  });

  it("reads VERCEL_ENV as a bounded fact — a MISSING variable is `unset`, never mistaken for a deployment (2026-09-24)", () => {
    expect(deployEnvFromEnv({ VERCEL_ENV: "production" })).toBe("production");
    expect(deployEnvFromEnv({ VERCEL_ENV: " Preview " })).toBe("preview");
    expect(deployEnvFromEnv({ VERCEL_ENV: "development" })).toBe("development");
    expect(deployEnvFromEnv({ VERCEL_ENV: "" })).toBe("unset");
    expect(deployEnvFromEnv({})).toBe("unset");
    expect(deployEnvFromEnv({ VERCEL_ENV: "staging" })).toBe("other");
    // Closed set: nothing from the environment reaches the answer verbatim.
    expect(deployEnvFromEnv({ VERCEL_ENV: "https://secret.host" })).toBe("other");
  });

  it("app_version names the origin and the build, bounded to the column", () => {
    expect(
      telemetryAppVersion({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: "0d7bac4cf8f9baa79488ff701ee2a5a155b6761e",
      }),
    ).toBe("production@0d7bac4cf8f9");
    expect(
      telemetryAppVersion({ VERCEL_ENV: "preview", VERCEL_DEPLOYMENT_ID: "dpl_ABC123" }),
    ).toBe("preview@dpl_ABC123");
    expect(telemetryAppVersion({})).toBe("local");
    // Never longer than the DB check constraint (64).
    expect(
      telemetryAppVersion({ VERCEL_ENV: "preview", VERCEL_DEPLOYMENT_ID: "x".repeat(200) })
        .length,
    ).toBeLessThanOrEqual(64);
    // A non-hex "sha" is not trusted as a commit.
    expect(telemetryAppVersion({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "not a sha" }))
      .toBe("production");
  });

  it("stamps a production write as production, with the build, and no preview marker", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_SHA = "0d7bac4cf8f9baa79488ff701ee2a5a155b6761e";
    hostMock.mockReturnValue("labourmarket.ai");
    const out = await recordTelemetryEvent(baseInput);
    expect(out.ok).toBe(true);
    const row = insertedRow()!;
    expect(row.metadata[DEPLOY_ENV_KEY]).toBe("production");
    expect(row.metadata.preview_host).toBeUndefined();
    expect(row.app_version).toBe("production@0d7bac4cf8f9");
    // The campaign attribution the reader depends on survives the stamp.
    expect(row.metadata.utm_campaign).toBe("lm-job-welder-se-2026-09");
    expect(row.metadata.utm_content).toBe("fbg-job-e3ec6c1e-10chef2-pl");
  });

  it("stamps a preview deployment as preview AND marks preview_host from the Host header", async () => {
    process.env.VERCEL_ENV = "preview";
    hostMock.mockReturnValue("lmai-git-feature-x.vercel.app");
    const out = await recordTelemetryEvent(baseInput);
    expect(out.ok).toBe(true);
    const row = insertedRow()!;
    expect(row.metadata[DEPLOY_ENV_KEY]).toBe("preview");
    expect(row.metadata.preview_host).toBe(true);
    expect(row.app_version).toBe("preview");
  });

  it("OVERWRITES a client-supplied deploy_env / app_version — the client never says which build it is", async () => {
    process.env.VERCEL_ENV = "preview";
    hostMock.mockReturnValue("lmai-git-feature-x.vercel.app");
    const out = await recordTelemetryEvent({
      ...baseInput,
      appVersion: "production@deadbeefcafe",
      metadata: { ...baseInput.metadata, [DEPLOY_ENV_KEY]: "production" },
    });
    expect(out.ok).toBe(true);
    const row = insertedRow()!;
    expect(row.metadata[DEPLOY_ENV_KEY]).toBe("preview");
    expect(row.app_version).toBe("preview");
  });

  it("never CLEARS a client preview marker", async () => {
    // A client that saw a non-production location stays excluded even if the
    // server's view of the host is production-shaped (e.g. a proxy).
    process.env.VERCEL_ENV = "production";
    hostMock.mockReturnValue("labourmarket.ai");
    const out = await recordTelemetryEvent({
      ...baseInput,
      metadata: { ...baseInput.metadata, preview_host: true },
    });
    expect(out.ok).toBe(true);
    expect(insertedRow()!.metadata.preview_host).toBe(true);
  });

  it("the stamp counts toward the byte cap — a payload at the edge cannot slip past it", async () => {
    process.env.VERCEL_ENV = "production";
    // 10 allowlisted 200-char strings ≈ 2.1 KB serialized → over the 2 KB cap
    // with or without the stamp; the point is that the stamp is INSIDE the
    // measured object (the rejection code is the same one the cap uses).
    const big: Record<string, unknown> = {};
    for (const k of [
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "referrer_host", "landing_path", "surface", "step", "result_kind",
    ]) big[k] = "x".repeat(200);
    const out = await recordTelemetryEvent({ ...baseInput, metadata: big });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.code).toBe("metadata_too_large");
    expect(insertMock).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Rule 4 + 5 — one reader rule, excluded count reported                 */
/* ------------------------------------------------------------------ */

const ADMINS = new Set(["admin-1"]);
const campaignRow = (
  event: string,
  metadata: Record<string, unknown> | null,
  profile_id: string | null = null,
) => ({
  event_name: event,
  metadata: {
    utm_campaign: "lm-job-welder-se-2026-09",
    utm_content: "fbg-job-e3ec6c1e-10chef2-pl",
    ...(metadata ?? {}),
  },
  profile_id,
});

describe("origin guard — readers exclude non-production origins by one rule", () => {
  it("the shared rule reads both the client marker and the server stamp", () => {
    expect(isNonProductionOrigin({ preview_host: true })).toBe(true);
    expect(isNonProductionOrigin({ [DEPLOY_ENV_KEY]: "local" })).toBe(true);
    expect(isNonProductionOrigin({ [DEPLOY_ENV_KEY]: "preview" })).toBe(true);
    expect(isNonProductionOrigin({ [DEPLOY_ENV_KEY]: "production" })).toBe(false);
    // Rule 5: an unstamped historical row is judged by the client marker alone.
    expect(isNonProductionOrigin({})).toBe(false);
    expect(isNonProductionOrigin(null)).toBe(false);
    expect(isNonProductionOrigin({ utm_campaign: "x" })).toBe(false);
  });

  it("classifies a server-stamped local or preview row as non-production, above identity", () => {
    expect(classifyEvent({ profileId: null, metadata: { [DEPLOY_ENV_KEY]: "local" } }, ADMINS)).toBe("preview");
    expect(classifyEvent({ profileId: "user-9", metadata: { [DEPLOY_ENV_KEY]: "preview" } }, ADMINS)).toBe("preview");
    expect(classifyEvent({ profileId: "admin-1", metadata: { [DEPLOY_ENV_KEY]: "local" } }, ADMINS)).toBe("preview");
    expect(classifyEvent({ profileId: "user-9", metadata: { [DEPLOY_ENV_KEY]: "production" } }, ADMINS)).toBe("identified_user");
    expect(countsForBusinessFunnel({ profileId: null, metadata: { [DEPLOY_ENV_KEY]: "local" } }, ADMINS)).toBe(false);
  });

  it("the acquisition funnel drops them from every count AND reports how many it dropped", () => {
    const out = summariseFunnel(
      [
        // Real campaign readers on production.
        ...Array.from({ length: 7 }, () => campaignRow(FUNNEL_EVENTS.landingViewed, { [DEPLOY_ENV_KEY]: "production" })),
        ...Array.from({ length: 2 }, () => campaignRow(FUNNEL_EVENTS.jobOpened, { [DEPLOY_ENV_KEY]: "production" })),
        // The incident's shape, had it landed unmarked: a local build's rows.
        ...Array.from({ length: 5 }, () => campaignRow(FUNNEL_EVENTS.landingViewed, { [DEPLOY_ENV_KEY]: "local" })),
        ...Array.from({ length: 5 }, () => campaignRow(FUNNEL_EVENTS.jobOpened, { [DEPLOY_ENV_KEY]: "local" })),
        // A preview deployment's rows.
        ...Array.from({ length: 3 }, () => campaignRow(FUNNEL_EVENTS.jobBoardViewed, { [DEPLOY_ENV_KEY]: "preview" })),
        // Historical client-marked rows (the 12:52Z / 14:06Z smoke).
        ...Array.from({ length: 2 }, () => campaignRow(FUNNEL_EVENTS.landingViewed, { preview_host: true })),
      ],
      ADMINS,
    );
    expect(out.excludedPreview).toBe(15);
    expect(out.totalEvents).toBe(9);
    expect(out.counts.find((c) => c.key === FUNNEL_EVENTS.landingViewed)!.count).toBe(7);
    expect(out.counts.find((c) => c.key === FUNNEL_EVENTS.jobOpened)!.count).toBe(2);
    expect(out.counts.find((c) => c.key === FUNNEL_EVENTS.jobBoardViewed)!.count).toBe(0);
  });

  it("the per-campaign read-out (#1814) describes only production readers of the post", () => {
    const out = summariseFunnel(
      [
        ...Array.from({ length: 4 }, () => campaignRow(FUNNEL_EVENTS.landingViewed, { [DEPLOY_ENV_KEY]: "production" })),
        campaignRow(FUNNEL_EVENTS.jobOpened, { [DEPLOY_ENV_KEY]: "production" }),
        // Local smoke: same campaign, same content — must not inflate the row.
        ...Array.from({ length: 20 }, () => campaignRow(FUNNEL_EVENTS.landingViewed, { [DEPLOY_ENV_KEY]: "local" })),
        ...Array.from({ length: 20 }, () => campaignRow(FUNNEL_EVENTS.jobOpened, { [DEPLOY_ENV_KEY]: "local" })),
      ],
      ADMINS,
    );
    expect(out.campaigns).toHaveLength(1);
    const row = out.campaigns[0];
    expect(row.campaign).toBe("lm-job-welder-se-2026-09");
    expect(row.content).toBe("fbg-job-e3ec6c1e-10chef2-pl");
    expect(row.landing).toBe(4);
    expect(row.jobOpened).toBe(1);
  });

  it("a campaign that only ever had local traffic does not appear at all", () => {
    const out = summariseFunnel(
      Array.from({ length: 9 }, () => campaignRow(FUNNEL_EVENTS.landingViewed, { [DEPLOY_ENV_KEY]: "local" })),
      ADMINS,
    );
    expect(out.campaigns).toEqual([]);
    expect(out.excludedPreview).toBe(9);
  });

  it("TTFV applies the same rule", () => {
    const t0 = "2026-09-20T12:00:00.000Z";
    const t1 = "2026-09-20T12:05:00.000Z";
    const out = summariseTtfv([
      { event_name: FUNNEL_EVENTS.signupCompleted, profile_id: "p1", created_at: t0, metadata: { [DEPLOY_ENV_KEY]: "local", role_context: "worker" } },
      { event_name: FUNNEL_EVENTS.firstRealAction, profile_id: "p1", created_at: t1, metadata: { [DEPLOY_ENV_KEY]: "local", role_context: "worker" } },
      { event_name: FUNNEL_EVENTS.signupCompleted, profile_id: "p2", created_at: t0, metadata: { [DEPLOY_ENV_KEY]: "production", role_context: "worker" } },
    ]);
    expect(out.excludedPreview).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* Structural pins — the rule cannot be quietly removed                  */
/* ------------------------------------------------------------------ */

describe("origin guard — structural pins", () => {
  it("no reader filters on preview_host by hand any more — they call the shared rule", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "..", "..");
    for (const rel of [
      "lib/admin/conversion-funnel.ts",
      "lib/admin/pilot-metrics.ts",
      "lib/admin/ttfv-by-actor.ts",
      "lib/analytics/population.ts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      expect(src, `${rel} filters preview_host by hand`).not.toMatch(
        /metadata\?\.\["preview_host"\]\s*!==\s*true/,
      );
    }
  });

  it("the server action refuses on the Host header and stamps from VERCEL_ENV", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "..", "..");
    const action = readFileSync(join(root, "lib/telemetry/actions.ts"), "utf8");
    expect(action).toMatch(/isLocalHostname\(requestHost\)/);
    expect(action).toMatch(/"non_production_origin"/);
    expect(action).toMatch(/telemetryOriginFromEnv\(\)/);
    expect(action).toMatch(/telemetryAppVersion\(\)/);
    const host = readFileSync(join(root, "lib/telemetry/production-host.ts"), "utf8");
    expect(host).toMatch(/env\.VERCEL_ENV/);
    // The refusal is never keyed on the environment variable — the action's
    // CODE (comments blanked) never reads it; only production-host.ts does.
    const actionCode = action
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(actionCode).not.toMatch(/VERCEL_ENV/);
  });
});
