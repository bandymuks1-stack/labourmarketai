/**
 * Guard — NAV / Arbeidsplassen.no INBOUND SCAFFOLD (2026-09-22).
 *
 * The scaffold registers a second vacancy provider whose transport shapes
 * (bearer auth, continuation-token paging, a per-provider secret) did not
 * exist before. This guard pins that the scaffold is exactly that — a shape
 * — and not an activation:
 *
 *   (1) `nav` is registered but INACTIVE at every gate: governance
 *       unconfirmed/off/proposed, env switch closed, batch gate refuses;
 *   (2) the adapter sends `Authorization: Bearer` for a `bearer` endpoint
 *       and `api-key` for the default, keeps `requestRef` secret-free, and
 *       refuses a key-requiring endpoint without a key (no anonymous call);
 *   (3) a `cursor` channel walks by continuation token and checkpoints on
 *       the token through the EXISTING `vacancy_import_cursors` upsert;
 *   (4) NO nav.no host is reachable while activation is off — an empty
 *       environment blocks every code path before `fetch`, and the host
 *       literal exists nowhere but the registry;
 *   (5) the per-provider secret is read from ONE conventional env NAME and
 *       is never logged;
 *   (6) public copy names the source only through i18n codes present in
 *       every locale (no presentation guard for provider names existed in
 *       the repo — recorded as NOT_FOUND in the gate document — so this pins
 *       the weaker, true invariant: no hard-coded "Arbeidsplassen"/"NAV"
 *       copy in app or components).
 *
 * Runs in CI via `pnpm -F web test`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ctl = vi.hoisted(() => ({
  // Simulates a FUTURE owner decision for `nav` — the state (3) needs in
  // order to reach the cursor write. Null = the real registry row (off).
  navGovernance: null as null | { activation: string; legalStatus: string },
}));

vi.mock("@/lib/intelligence/source-governance", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/intelligence/source-governance")>();
  return {
    ...actual,
    getSourceProfile: (key: string) => {
      const profile = actual.getSourceProfile(key);
      if (profile && key === "nav" && ctl.navGovernance !== null) {
        return { ...profile, ...ctl.navGovernance, proposedOnly: false };
      }
      return profile;
    },
  };
});

import {
  INTELLIGENCE_SOURCE_PROFILES,
  isExternalSourceActive,
} from "@/lib/intelligence/source-governance";
import {
  VACANCY_PROVIDERS,
  getVacancyEndpoint,
  getVacancyProvider,
} from "@/lib/vacancy-sources/vacancy-provider-registry";
import { getVacancyParser } from "@/lib/vacancy-sources/providers";
import { NAV_FIELD_MAP, parseNavBatch } from "@/lib/vacancy-sources/providers/nav-parse";
import { evaluateVacancyBatchGate } from "@/lib/vacancy-sources/vacancy-validation";
import { isActivationGatedOnly } from "@/lib/vacancy-sources/vacancy-contract";
import {
  cursorRequestBound,
  decodeContinuationTokenCursor,
  decodeRecordOffsetCursor,
  encodeContinuationTokenCursor,
  readContinuationToken,
} from "@/lib/vacancy-sources/vacancy-cursor";
import {
  evaluateVacancySwitch,
  providerEnabledEnvName,
} from "@/lib/vacancy-import/vacancy-kill-switch";
import {
  providerApiTokenEnvName,
  readProviderApiToken,
} from "@/lib/vacancy-import/vacancy-provider-secret";
import {
  buildVacancyRequestHeaders,
  buildVacancyRequestUrl,
  fetchVacancyPage,
} from "@/lib/vacancy-import/vacancy-adapter";
import { runVacancyImport } from "@/lib/vacancy-import/vacancy-importer";
import { runVacancyIngestionSession } from "@/lib/vacancy-runner/vacancy-ingestion";

const APP_ROOT = join(__dirname, "..", "..");
const NAV = getVacancyProvider("nav")!;
const NAV_STREAM = getVacancyEndpoint(NAV, "stream")!;
const SE = getVacancyProvider("arbetsformedlingen")!;
const NOW = "2026-09-22T09:00:00.000Z";
const TOKEN = "test-jwt-value-never-logged";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ctl.navGovernance = null;
});

function enableNav(withToken: boolean): void {
  vi.stubEnv("VACANCY_SOURCE_NAV_ENABLED", "on");
  vi.stubEnv("VACANCY_IMPORT_KILL_SWITCH", "");
  vi.stubEnv("VACANCY_SOURCE_NAV_KILL_SWITCH", "");
  if (withToken) vi.stubEnv("VACANCY_SOURCE_NAV_API_TOKEN", TOKEN);
}

/** A feed ad in the ASSUMED shape (see NAV_FIELD_MAP). */
function navAd(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uuid: "nav-1",
    status: "ACTIVE",
    title: "Tømrer til byggeprosjekt",
    description: "Vi søker tømrer med erfaring fra bygg.",
    published: "2026-09-20T08:00:00+02:00",
    expires: "2026-10-20T00:00:00+02:00",
    positioncount: 2,
    employmentType: "Fast",
    extent: "Heltid",
    employer: { name: "Bygg AS", orgnr: "123456789" },
    workLocations: [{ country: "NO", county: "Viken", municipal: "Drammen" }],
    categoryList: [{ categoryType: "STYRK08", code: "7115", name: "Tømrer" }],
    applicationUrl: "https://arbeidsplassen.nav.no/stillinger/stilling/nav-1",
    ...over,
  };
}

/** Serve pages keyed on the continuation token the request carries. */
function stubFeed(
  pages: Readonly<Record<string, unknown>>,
): ReturnType<typeof vi.fn> {
  const impl = vi.fn().mockImplementation(async (url: string) => {
    const last = new URL(String(url)).searchParams.get("last") ?? "";
    const body = pages[last];
    if (body === undefined) {
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", impl);
  return impl;
}

const read = (p: string) => readFileSync(p, "utf8");
/**
 * Strip comments so scans check real CODE only. Line comments go FIRST: a
 * `/**` inside a `//` line (a glob such as `lib/x/**` in prose) must not
 * open a block that swallows the next hundred lines of real code.
 */
const code = (s: string) =>
  s.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (/\.(ts|tsx)$/.test(abs)) acc.push(abs);
  }
  return acc;
}
const rel = (abs: string) => abs.slice(APP_ROOT.length + 1).replace(/\\/g, "/");

// ── (1) registered, inactive at every gate ──────────────────────────────────

describe("(1) nav is registered but inactive at every gate", () => {
  it("the descriptor exists with the recorded transport facts", () => {
    expect(VACANCY_PROVIDERS.map((p) => p.key)).toContain("nav");
    expect(NAV.countryIso).toBe("NO");
    expect(NAV.sourceLanguage).toBe("nb");
    expect(NAV_STREAM.host).toBe("pam-stilling-feed.nav.no");
    expect(NAV_STREAM.pagination).toBe("cursor");
    expect(NAV_STREAM.cursor).toBeTruthy();
    expect(NAV_STREAM.requiresApiKey).toBe(true);
    expect(NAV_STREAM.authScheme).toBe("bearer");
    expect(getVacancyParser("nav")).not.toBeNull();
  });

  it("the governance row is unconfirmed, off and a proposal", () => {
    const row = INTELLIGENCE_SOURCE_PROFILES.find((p) => p.key === "nav")!;
    expect(row).toBeTruthy();
    expect(row.legalStatus).toBe("unconfirmed");
    expect(row.activation).toBe("off");
    expect(row.proposedOnly).toBe(true);
    expect(row.attributionRequired).toBe(true);
    expect(row.importPolicy).toBeNull();
    expect(isExternalSourceActive("nav")).toBe(false);
  });

  it("the env switch is closed in an empty environment and the batch gate refuses", () => {
    const state = evaluateVacancySwitch("nav", {});
    expect(state.operational).toBe(false);
    expect(state.blockedReason).toBe("provider_disabled");
    expect(providerEnabledEnvName("nav")).toBe("VACANCY_SOURCE_NAV_ENABLED");

    const gate = evaluateVacancyBatchGate(
      { providerKey: "nav", snapshotRef: "s", requestRef: "nav:stream", capturedAt: NOW },
      "stream",
    );
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    // Blocked ONLY by owner-activation reasons — a well-formed source
    // awaiting a decision, not a data defect.
    expect(isActivationGatedOnly(gate.reasons)).toBe(true);
  });
});

// ── (2) bearer auth ─────────────────────────────────────────────────────────

describe("(2) the adapter sends the credential in the declared header shape", () => {
  it("bearer → Authorization header; api-key (default) → api-key header", () => {
    const bearer = buildVacancyRequestHeaders(
      { requiresApiKey: true, authScheme: "bearer" },
      "application/json",
      "secret",
    );
    expect(bearer.Authorization).toBe("Bearer secret");
    expect(bearer).not.toHaveProperty("api-key");

    const legacy = buildVacancyRequestHeaders(
      { requiresApiKey: true },
      "application/json",
      "secret",
    );
    expect(legacy["api-key"]).toBe("secret");
    expect(legacy).not.toHaveProperty("Authorization");

    // A keyless endpoint carries no credential header at all, whatever the
    // caller passes — arbetsformedlingen stays byte-identical.
    const keyless = buildVacancyRequestHeaders(
      { requiresApiKey: false },
      "application/json",
      "ignored",
    );
    expect(Object.keys(keyless)).toEqual(["Accept"]);
  });

  it("a live nav page request carries Bearer and never puts the token in the URL or requestRef", async () => {
    enableNav(true);
    const impl = stubFeed({ "": { items: [] } });

    const result = await fetchVacancyPage({
      provider: NAV,
      channel: "stream",
      apiKey: TOKEN,
    });
    expect(result.ok).toBe(true);
    expect(impl).toHaveBeenCalledTimes(1);
    const [url, init] = impl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers).not.toHaveProperty("api-key");
    expect(String(url)).not.toContain(TOKEN);
    expect(result.requestRef).not.toContain(TOKEN);
    expect(new URL(String(url)).hostname).toBe("pam-stilling-feed.nav.no");
  });

  it("refuses a key-requiring endpoint without a key — no anonymous request", async () => {
    enableNav(false);
    const impl = stubFeed({ "": { items: [] } });
    const result = await fetchVacancyPage({ provider: NAV, channel: "stream" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("api_key_required");
    expect(impl).not.toHaveBeenCalled();
  });

  it("the descriptor's cursor key is accepted by the URL builder; foreign keys are still dropped", () => {
    const url = buildVacancyRequestUrl(NAV_STREAM, {
      last: "abc",
      "redirect-to": "https://evil.invalid",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("last")).toBe("abc");
    expect(parsed.searchParams.has("redirect-to")).toBe(false);
    // The same key is NOT accepted on an endpoint that did not declare it.
    const se = buildVacancyRequestUrl(getVacancyEndpoint(SE, "links")!, { last: "abc" });
    expect(new URL(se).searchParams.has("last")).toBe(false);
  });
});

// ── (3) continuation-token walk + checkpoint ────────────────────────────────

describe("(3) a cursor channel walks by continuation token and checkpoints on it", () => {
  it("the checkpoint codec is prefixed, bounded, and disjoint from the other two kinds", () => {
    expect(encodeContinuationTokenCursor("abc")).toBe("continuation-token:abc");
    expect(decodeContinuationTokenCursor("continuation-token:abc")).toBe("abc");
    // Other kinds fail closed in both directions.
    expect(decodeContinuationTokenCursor("2026-09-22T09:00:00.000Z")).toBeNull();
    expect(decodeContinuationTokenCursor("record-offset:5000")).toBeNull();
    expect(decodeRecordOffsetCursor("continuation-token:5000")).toBeNull();
    expect(cursorRequestBound("continuation-token:abc")).toBeNull();
    // Bounded and shape-checked: not a place to smuggle a path.
    expect(encodeContinuationTokenCursor("")).toBeNull();
    expect(encodeContinuationTokenCursor("a".repeat(513))).toBeNull();
    expect(encodeContinuationTokenCursor("../x?y=1")).toBeNull();
    expect(readContinuationToken({ next_id: " t1 " }, ["next_id"])).toBe("t1");
    expect(readContinuationToken({ next_id: 42 }, ["next_id"])).toBeNull();
    expect(readContinuationToken([], ["next_id"])).toBeNull();
  });

  it("dry run: walks page → page by token, stops at the head, reports the token checkpoint", async () => {
    enableNav(true);
    const impl = stubFeed({
      "": { items: [{ ad_content: navAd({ uuid: "nav-1" }) }], next_id: "p2" },
      p2: { items: [{ ad_content: navAd({ uuid: "nav-2" }) }], next_id: "p3" },
      p3: { items: [{ ad_content: navAd({ uuid: "nav-3" }) }] },
    });

    const result = await runVacancyImport({
      provider: NAV,
      channel: "stream",
      mode: "dry_run",
      sessionId: "s1",
      startedAtIso: NOW,
      finishedAtIso: NOW,
      capturedAt: NOW,
      apiKey: TOKEN,
      cursor: null,
    });

    expect(impl).toHaveBeenCalledTimes(3);
    const urls = impl.mock.calls.map((c) => new URL(String(c[0])));
    expect(urls[0].searchParams.has("last")).toBe(false);
    expect(urls[1].searchParams.get("last")).toBe("p2");
    expect(urls[2].searchParams.get("last")).toBe("p3");
    expect(result.metrics.pagesRequested).toBe(3);
    expect(result.metrics.itemsParsed).toBe(3);
    // Governance is off: nothing enters, but the well-formed rows are counted
    // as the evidence the owner needs.
    expect(result.activated).toBe(false);
    expect(result.acceptedVacancies).toEqual([]);
    expect(result.metrics.validAfterActivation).toBe(3);
    // The checkpoint is the token of the last page read (p3 named no
    // successor, so the next poll re-reads it), and the walk drained.
    expect(result.nextCursor).toBe("continuation-token:p3");
    expect(result.caughtUp).toBe(true);
  });

  it("resumes from a stored token and leaves the checkpoint at the last consumed page on failure", async () => {
    enableNav(true);
    const impl = stubFeed({
      p2: { items: [{ ad_content: navAd({ uuid: "nav-2" }) }], next_id: "p3" },
      // p3 is missing → 404 → fetch failure mid-walk.
    });

    const result = await runVacancyImport({
      provider: NAV,
      channel: "stream",
      mode: "dry_run",
      sessionId: "s2",
      startedAtIso: NOW,
      finishedAtIso: NOW,
      capturedAt: NOW,
      apiKey: TOKEN,
      cursor: "continuation-token:p2",
    });

    expect(new URL(String(impl.mock.calls[0][0])).searchParams.get("last")).toBe("p2");
    expect(result.metrics.pagesFailed).toBe(1);
    // p2 was fully consumed and named p3, so p3 is the honest resume point.
    expect(result.nextCursor).toBe("continuation-token:p3");
    expect(result.caughtUp).toBe(false);
  });

  it("persist mode under a SIMULATED owner activation writes the token through vacancy_import_cursors", async () => {
    // A simulated future decision, scoped to this test — the real row is off.
    ctl.navGovernance = { activation: "on", legalStatus: "confirmed" };
    enableNav(true);
    stubFeed({
      "": { items: [{ ad_content: navAd({ uuid: "nav-1" }) }], next_id: "p2" },
      p2: { items: [] },
    });

    const ops: { table: string; kind: string; payload?: unknown }[] = [];
    const chainFor = (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = (...args: unknown[]) => {
        ops.push({ table, kind: "select", payload: args[0] });
        return chain;
      };
      chain.eq = self;
      chain.in = self;
      chain.or = self;
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(ok, err);
      chain.upsert = (payload: unknown) => {
        ops.push({ table, kind: "upsert", payload });
        return Promise.resolve({ data: null, error: null });
      };
      chain.update = (payload: unknown) => {
        ops.push({ table, kind: "update", payload });
        return chain;
      };
      return chain;
    };
    const client = { from: (t: string) => chainFor(t) as never } as never;

    const session = await runVacancyIngestionSession(client, NAV, {
      channel: "stream",
      mode: "persist",
      nowIso: NOW,
    });

    expect(session.status).toBe("imported");
    const cursorWrites = ops.filter(
      (o) => o.table === "vacancy_import_cursors" && o.kind === "upsert",
    );
    expect(cursorWrites).toHaveLength(1);
    const written = cursorWrites[0].payload as Record<string, unknown>;
    expect(written.provider_key).toBe("nav");
    expect(written.channel).toBe("stream");
    expect(written.cursor_value).toBe("continuation-token:p2");
    expect(written.consecutive_failures).toBe(0);
    expect(session.cursorAdvanced).toBe(true);
    // The token itself is nowhere in what was written or reported.
    expect(JSON.stringify(ops)).not.toContain(TOKEN);
    expect(JSON.stringify(session)).not.toContain(TOKEN);
  });
});

// ── (4) no nav.no host reachable while activation is off ────────────────────

describe("(4) no nav.no host is reachable while the switch is closed", () => {
  it("the importer makes no request for nav in an empty environment", async () => {
    const impl = stubFeed({ "": { items: [] } });
    const result = await runVacancyImport({
      provider: NAV,
      channel: "stream",
      mode: "dry_run",
      sessionId: "s0",
      startedAtIso: NOW,
      finishedAtIso: NOW,
      capturedAt: NOW,
      apiKey: TOKEN,
      cursor: null,
    });
    expect(result.operational).toBe(false);
    expect(result.blockedReason).toBe("provider_disabled");
    expect(impl).not.toHaveBeenCalled();
  });

  it("the adapter throws before fetch, and the runner reports `blocked` with zero reads", async () => {
    const impl = stubFeed({ "": { items: [] } });
    await expect(
      fetchVacancyPage({ provider: NAV, channel: "stream", apiKey: TOKEN }),
    ).rejects.toThrow("vacancy_import_blocked:provider_disabled");
    expect(impl).not.toHaveBeenCalled();

    const reads: string[] = [];
    const client = {
      from: (t: string) => {
        reads.push(t);
        throw new Error("must not be reached");
      },
    } as never;
    const session = await runVacancyIngestionSession(client, NAV, {
      channel: "stream",
      mode: "dry_run",
      nowIso: NOW,
    });
    expect(session.status).toBe("blocked");
    expect(session.blockedReason).toBe("provider_disabled");
    expect(reads).toEqual([]);
    expect(impl).not.toHaveBeenCalled();
  });

  it("env on but governance off: a persist run stores NOTHING and never advances a cursor", async () => {
    enableNav(true);
    stubFeed({ "": { items: [{ ad_content: navAd() }] } });
    const ops: string[] = [];
    const chainFor = (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.in = self;
      chain.or = self;
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(ok, err);
      chain.upsert = () => {
        ops.push(`upsert:${table}`);
        return Promise.resolve({ data: null, error: null });
      };
      return chain;
    };
    const client = { from: (t: string) => chainFor(t) as never } as never;
    const session = await runVacancyIngestionSession(client, NAV, {
      channel: "stream",
      mode: "persist",
      nowIso: NOW,
    });
    expect(session.status).toBe("blocked");
    expect(session.metrics?.validAfterActivation).toBe(1);
    expect(session.persisted).toEqual({ inserted: 0, updated: 0, unchanged: 0 });
    expect(session.cursorAdvanced).toBe(false);
    expect(ops).toEqual([]);
  });

  it("the nav.no host literal exists only in the registry and the governance row", () => {
    // The registry holds the FEED host (the one the adapter may build an
    // origin from); the governance row holds the informational homepage
    // (bare hostname, never fetched — pinned by intelligence-boundary).
    const offenders = walk(join(APP_ROOT, "lib"))
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .filter((f) => /nav\.no\b/.test(code(read(f))))
      .map(rel)
      .sort();
    expect(offenders).toEqual([
      "lib/intelligence/source-governance.ts",
      "lib/vacancy-sources/vacancy-provider-registry.ts",
    ]);
    // And there is exactly one nav.no host, the documented feed host.
    const hosts = new Set(
      VACANCY_PROVIDERS.flatMap((p) => p.endpoints.map((e) => e.host)).filter((h) =>
        h.endsWith("nav.no"),
      ),
    );
    expect([...hosts]).toEqual(["pam-stilling-feed.nav.no"]);
  });
});

// ── lifecycle invariant: actionable only while active AND not expired ───────

describe("lifecycle: a NAV row is actionable only while is_active AND not expired", () => {
  it("the read path applies BOTH predicates and carries no provider exception", () => {
    // NAV's terms require a withdrawn ad to leave our result lists at once.
    // The store's read path already decides liveness at read time from the
    // two stored facts, for every provider alike; this pins that a NAV row
    // gets exactly that treatment and that nobody added a per-provider
    // carve-out.
    const src = code(read(join(APP_ROOT, "lib", "vacancy-store", "vacancy-read.ts")));
    expect(src).toContain('.eq("is_active", true)');
    expect(src).toMatch(/expires_at\.is\.null,expires_at\.gt\./);
    expect(/["'`]nav["'`]/.test(src)).toBe(false);
  });

  it("a parsed withdrawal is the shape the repository flips to is_active=false", () => {
    const repo = code(read(join(APP_ROOT, "lib", "vacancy-store", "vacancy-repository.ts")));
    expect(repo).toMatch(/lifecycle\s*===\s*"removed"/);
    expect(repo).toMatch(/is_active:\s*false/);
    expect(/["'`]nav["'`]/.test(repo)).toBe(false);
  });
});

// ── (5) the per-provider secret ─────────────────────────────────────────────

describe("(5) the provider secret is one conventional env NAME, never a logged value", () => {
  it("derives VACANCY_SOURCE_NAV_API_TOKEN and reads null when blank", () => {
    expect(providerApiTokenEnvName("nav")).toBe("VACANCY_SOURCE_NAV_API_TOKEN");
    expect(readProviderApiToken("nav", {})).toBeNull();
    expect(readProviderApiToken("nav", { VACANCY_SOURCE_NAV_API_TOKEN: "  " })).toBeNull();
    expect(readProviderApiToken("nav", { VACANCY_SOURCE_NAV_API_TOKEN: " t " })).toBe("t");
  });

  it("the runner never logs the token and the importer's log/event types cannot carry one", () => {
    const runner = code(read(join(APP_ROOT, "lib", "vacancy-runner", "vacancy-ingestion.ts")));
    expect(runner).not.toMatch(/console\.(log|info|warn|error)/);
    const secret = read(join(APP_ROOT, "lib", "vacancy-import", "vacancy-provider-secret.ts"));
    expect(secret).toMatch(/^import "server-only";/m);
    expect(code(secret)).not.toMatch(/console\./);
  });
});

// ── (6) copy goes through i18n codes present in every locale ────────────────

describe("(6) NAV is named only through i18n codes, present in every locale", () => {
  it("the three codes exist and are non-empty in every catalogue", () => {
    const CODES = [
      "intelligence.sources.nav",
      "intelligence.sources.terms.nav",
      "vacancySources.attribution.nav",
    ];
    const messagesDir = join(APP_ROOT, "messages");
    const catalogues = readdirSync(messagesDir).filter((f) => f.endsWith(".json"));
    expect(catalogues.length).toBeGreaterThanOrEqual(11);
    const missing: string[] = [];
    for (const file of catalogues) {
      const json = JSON.parse(read(join(messagesDir, file))) as Record<string, unknown>;
      for (const codePath of CODES) {
        const value = codePath.split(".").reduce<unknown>(
          (acc, key) =>
            acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
          json,
        );
        if (typeof value !== "string" || value.trim().length === 0 || /\[EN\]/.test(value)) {
          missing.push(`${file}: ${codePath}`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
    expect(NAV.displayNameCode).toBe("intelligence.sources.nav");
    expect(NAV.attributionCode).toBe("vacancySources.attribution.nav");
  });

  it("no app or component file hard-codes the source name in copy", () => {
    // NOT_FOUND: the repo has no presentation guard forbidding provider
    // names in public copy, so this pins the invariant the codes above
    // exist for — copy reaches a person through the catalogue, never a
    // literal in a component.
    const offenders = [...walk(join(APP_ROOT, "app")), ...walk(join(APP_ROOT, "components"))]
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .filter((f) => /Arbeidsplassen|pam-stilling/.test(code(read(f))))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ── parser stub: assumed fields are declared, occupation stays verbatim ─────

describe("nav parser stub — every mapped field is declared ASSUMED; nothing is invented", () => {
  it("declares every key it reads as assumed until a real payload is captured", () => {
    for (const [name, entry] of Object.entries(NAV_FIELD_MAP)) {
      expect(entry.assumed, name).toBe(true);
      expect(entry.keys.length, name).toBeGreaterThan(0);
    }
  });

  it("maps a documented-shape ad verbatim, with occupation raw and no ESCO invention", () => {
    const batch = parseNavBatch({
      body: { items: [{ ad_content: navAd() }], next_id: "p2" },
      channel: "stream",
      capturedAt: NOW,
      requestRef: "https://pam-stilling-feed.nav.no/api/v1/feed",
    });
    expect(batch.ok).toBe(true);
    expect(batch.outcomes).toHaveLength(1);
    const outcome = batch.outcomes[0];
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    const v = outcome.vacancy;
    expect(v.providerKey).toBe("nav");
    expect(v.externalId).toBe("nav-1");
    expect(v.lifecycle).toBe("published");
    expect(v.sourceLanguage).toBe("nb");
    expect(v.location.country).toBe("NO");
    expect(v.location.city).toBe("Drammen");
    expect(v.employer.externalOrgId).toBe("123456789");
    expect(v.occupationRaw).toBe("Tømrer");
    expect(v.occupationConceptId).toBe("STYRK08:7115");
    expect(v.categorizationOrigin).toBe("derived");
    expect(v.positions).toBe(2);
    expect(v.employmentForm).toBe("permanent");
    expect(v.workingTime).toBe("full_time");
    expect(v.expiresAt).not.toBeNull();
    expect(v.applicationUrl).toContain("arbeidsplassen.nav.no");
    expect(v.attributionCode).toBe("vacancySources.attribution.nav");
    // No coordinates, no salary, no languages are invented.
    expect(v.location.lat).toBeNull();
    expect(v.compensation.min).toBeNull();
    expect(v.requiredLanguages).toEqual([]);
  });

  it("an inactive status is a withdrawal — the shape the removal duty needs", () => {
    const batch = parseNavBatch({
      body: [navAd({ status: "INACTIVE", title: "" })],
      channel: "stream",
      capturedAt: NOW,
      requestRef: "r",
    });
    const outcome = batch.outcomes[0];
    expect(outcome.kind).toBe("parsed");
    if (outcome.kind !== "parsed") return;
    expect(outcome.vacancy.lifecycle).toBe("removed");
  });

  it("rejects, never throws, on a malformed item; a non-list body is a body rejection", () => {
    const batch = parseNavBatch({
      body: [42, { uuid: "x" }, { title: "no id" }],
      channel: "stream",
      capturedAt: NOW,
      requestRef: "r",
    });
    expect(batch.outcomes.map((o) => (o.kind === "rejected" ? o.reason : "parsed"))).toEqual([
      "payload_not_an_object",
      "missing_title",
      "missing_external_id",
    ]);
    expect(parseNavBatch({ body: "nope", channel: "stream", capturedAt: NOW, requestRef: "r" }).bodyReason).toBe(
      "body_not_a_list",
    );
  });
});
