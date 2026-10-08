/**
 * NAV per-session request budget, end to end through the real importer and
 * adapter: a budget-exhausted session persists progress, reports
 * caughtUp=false, never moves the checkpoint past an unfetched entry, and the
 * next session re-reads exactly the entries that were left. Nothing here
 * touches a network: `fetch` is a stub and request spacing is recorded, not
 * waited for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runVacancyImport } from "./vacancy-importer";
import { vacancyPacing } from "./vacancy-adapter";
import { getVacancyEndpoint, getVacancyProvider } from "@/lib/vacancy-sources/vacancy-provider-registry";

const NAV = getVacancyProvider("nav")!;
const FAN = getVacancyEndpoint(NAV, "stream")!.detailFanOut!;
const BUDGET = FAN.maxDetailFetchesPerSession!;
const NOW = "2026-10-08T09:00:00.000Z";
const TOKEN = "test-jwt-value-never-logged";

const realSleep = vacancyPacing.sleep;
const slept: number[] = [];

beforeEach(() => {
  vacancyPacing.sleep = async (ms: number) => {
    slept.push(ms);
  };
  vi.stubEnv("VACANCY_SOURCE_NAV_ENABLED", "on");
  vi.stubEnv("VACANCY_IMPORT_KILL_SWITCH", "");
  vi.stubEnv("VACANCY_SOURCE_NAV_KILL_SWITCH", "");
});

afterEach(() => {
  vacancyPacing.sleep = realSleep;
  slept.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function navAd(uuid: string): Record<string, unknown> {
  return {
    uuid,
    status: "ACTIVE",
    ad_content: {
      uuid,
      title: "Tømrer til byggeprosjekt",
      description: "Vi søker tømrer med erfaring fra bygg.",
      published: "2026-10-01T08:00:00+02:00",
      expires: "2026-11-20T00:00:00+02:00",
      positioncount: 1,
      engagementtype: "Fast",
      extent: "Heltid",
      employer: { name: "Bygg AS", orgnr: "123456789" },
      workLocations: [{ country: "NORGE", county: "Viken", municipal: "Drammen" }],
      categoryList: [{ categoryType: "STYRK08", code: "7115", name: "Tømrer" }],
      applicationUrl: `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`,
    },
  };
}

const navEntry = (uuid: string, status = "ACTIVE") => ({
  id: uuid,
  url: `/api/v1/feedentry/${uuid}`,
  title: "t",
  _feed_entry: { uuid, status, title: "t", sistEndret: "2026-10-01T08:00:00+02:00" },
});

const ids = (prefix: string, n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `${prefix}${from + i}`);

/** A mutable two-page feed: head ("") -> "page-two-token" (the end). */
function feed(pages: Record<string, { items: unknown[]; next_id?: string }>) {
  const calls: { path: string; ims: string | null }[] = [];
  const impl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ path, ims: headers["If-Modified-Since"] ?? null });
    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    const d = /^\/api\/v1\/feedentry\/([^/]+)$/.exec(path);
    if (d) return json(navAd(d[1]));
    const token = /^\/api\/v1\/feed\/([^/]+)$/.exec(path)?.[1] ?? "";
    const page = pages[token];
    return page === undefined ? json({}, 404) : json(page);
  });
  vi.stubGlobal("fetch", impl);
  const detailIds = () =>
    calls.filter((c) => c.path.startsWith("/api/v1/feedentry/")).map((c) => c.path.split("/").pop()!);
  const listCalls = () => calls.filter((c) => !c.path.startsWith("/api/v1/feedentry/"));
  return { calls, detailIds, listCalls, reset: () => (calls.length = 0) };
}

function session(cursor: string | null, n: number) {
  return runVacancyImport({
    provider: NAV,
    channel: "stream",
    mode: "dry_run",
    sessionId: `budget-${n}`,
    startedAtIso: NOW,
    // A different clock every session: the head page must NOT depend on it.
    finishedAtIso: NOW,
    capturedAt: new Date(Date.parse(NOW) + n * 600_000).toISOString(),
    apiKey: TOKEN,
    cursor,
  });
}

describe("NAV per-session request budget", () => {
  it("a cold start drains across sessions: every entry read exactly once, none skipped", async () => {
    const head = ids("h", BUDGET * 2 + 50); // 2.5 budgets on the head page
    const tail = ids("t", 30);
    const f = feed({
      "": { items: head.map((u) => navEntry(u)), next_id: "page-two-token" },
      "page-two-token": { items: tail.map((u) => navEntry(u)) },
    });

    const accepted: string[] = [];
    let cursor: string | null = null;
    const seenCursors: (string | null)[] = [];
    for (let n = 0; n < 6; n += 1) {
      f.reset();
      const r = await session(cursor, n);
      // Budget respected every session: details + listing <= budget + pages.
      expect(f.detailIds().length).toBeLessThanOrEqual(BUDGET);
      expect(f.calls.length).toBeLessThanOrEqual(BUDGET + 2);
      accepted.push(...r.acceptedVacancies.map((v) => v.externalId));
      cursor = r.nextCursor;
      seenCursors.push(cursor);
      if (n === 0) {
        // Budget hit mid-head-page: not caught up, checkpoint ON the head page
        // at the first unfetched entry, never at page-two-token.
        expect(r.caughtUp).toBe(false);
        expect(cursor).toMatch(new RegExp(`^continuation-token:#${BUDGET}@\\d+$`));
        expect(f.detailIds()).toEqual(head.slice(0, BUDGET));
      }
      if (r.caughtUp) break;
    }

    expect([...accepted].sort()).toEqual([...head, ...tail].sort());
    expect(new Set(accepted).size).toBe(accepted.length); // no repeats either
    expect(seenCursors.at(-1)).toBe(`continuation-token:page-two-token#${tail.length}`);
  });

  it("the head page keeps the SAME cold-start instant across sessions", async () => {
    const f = feed({ "": { items: ids("h", BUDGET + 5).map((u) => navEntry(u)), next_id: "page-two-token" }, "page-two-token": { items: [] } });
    const first = await session(null, 0);
    const firstIms = f.listCalls()[0].ims;
    f.reset();
    await session(first.nextCursor, 7); // much later clock
    expect(f.listCalls()[0].ims).toBe(firstIms);
    expect(firstIms).toBeTruthy();
  });

  it("a failed detail mid-session leaves the checkpoint where it was (no advance past unread ads)", async () => {
    const entries = ids("h", 10).map((u) => navEntry(u));
    const impl = vi.fn().mockImplementation(async (url: string) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/v1/feedentry/h4") return new Response("{}", { status: 500 });
      if (path.startsWith("/api/v1/feedentry/"))
        return new Response(JSON.stringify(navAd(path.split("/").pop()!)), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ items: entries, next_id: "p2" }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", impl);
    const stored = "continuation-token:abc12345#3";
    const r = await session(stored, 0);
    expect(r.metrics.pagesFailed).toBe(1);
    expect(r.nextCursor).toBe(stored);
    expect(r.caughtUp).toBe(false);
  });

  it("steady state: the drained head page costs one listing request plus only NEW entries", async () => {
    const tail = ids("t", 12);
    const f = feed({ "": { items: tail.map((u) => navEntry(u)) } });
    const s1 = await session(null, 0);
    expect(s1.caughtUp).toBe(true);
    expect(f.detailIds()).toHaveLength(12);
    expect(s1.nextCursor).toMatch(/^continuation-token:#12@\d+$/);

    f.reset();
    const s2 = await session(s1.nextCursor, 1);
    expect(f.calls).toHaveLength(1); // listing only, zero details
    expect(s2.caughtUp).toBe(true);

    // NAV appends two changes to the log: only those two are fetched.
    const f2 = feed({ "": { items: [...tail, "n1", "n2"].map((u) => navEntry(u)) } });
    const s3 = await session(s2.nextCursor, 2);
    expect(f2.detailIds()).toEqual(["n1", "n2"]);
    expect(s3.nextCursor).toMatch(/^continuation-token:#14@\d+$/);
  });

  it("a head page SHORTER than the stored position is re-read from the start (fail toward a re-read)", async () => {
    const f = feed({ "": { items: ids("t", 5).map((u) => navEntry(u)) } });
    const r = await session(`continuation-token:#50@${Math.floor(Date.parse(NOW) / 1000)}`, 0);
    expect(f.detailIds()).toHaveLength(5);
    expect(r.caughtUp).toBe(true);
  });

  it("requests are spaced: every request after the first reserves a slot of the declared gap", async () => {
    feed({ "": { items: ids("h", 6).map((u) => navEntry(u)) } });
    await session(null, 0);
    // 1 listing + 6 details = 7 requests; the first needs no wait, the rest queue.
    expect(slept.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...slept)).toBeGreaterThan(0);
  });
});
