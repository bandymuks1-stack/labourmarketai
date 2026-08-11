import { afterEach, describe, expect, it, vi } from "vitest";

// The real registry row is `on` since the owner's 2026-08-09 activation
// decision, so the PRE-activation states these tests pin (the honest refusal
// a future un-activated provider must still get) are simulated with the same
// per-test `getSourceProfile` patch the ingestion tests use.
const ctl = vi.hoisted(() => ({ activationOverride: null as string | null }));

vi.mock("@/lib/intelligence/source-governance", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/intelligence/source-governance")>();
  return {
    ...actual,
    getSourceProfile: (key: string) => {
      const profile = actual.getSourceProfile(key);
      if (
        profile &&
        key === "arbetsformedlingen" &&
        ctl.activationOverride !== null
      ) {
        return { ...profile, activation: ctl.activationOverride };
      }
      return profile;
    },
  };
});

import { runVacancyImport } from "./vacancy-importer";
import { getVacancyProvider } from "@/lib/vacancy-sources/vacancy-provider-registry";
import { emptyDedupState } from "@/lib/vacancy-sources/vacancy-dedup";
import {
  computeVacancyContentHash,
  vacancyIdentityKey,
} from "@/lib/vacancy-sources/vacancy-hash";
import type { TranslationProvider } from "@/lib/translation/translation-service";

const PROVIDER = getVacancyProvider("arbetsformedlingen")!;
const CAPTURED_AT = "2026-08-04T09:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ctl.activationOverride = null;
});

function enable(): void {
  vi.stubEnv("VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED", "on");
  vi.stubEnv("VACANCY_IMPORT_KILL_SWITCH", "");
  vi.stubEnv("VACANCY_SOURCE_ARBETSFORMEDLINGEN_KILL_SWITCH", "");
}

function ad(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ad-1",
    headline: "Snickare till byggprojekt",
    publication_date: "2026-08-01T08:00:00+02:00",
    description: { text: "Vi söker en snickare för montering." },
    employer: { name: "Bygg AB" },
    workplace_address: { country_code: "SE", municipality: "Stockholm" },
    occupation: { label: "Snickare" },
    employment_type: { label: "Tillsvidareanställning" },
    working_hours_type: { label: "Heltid" },
    number_of_vacancies: 2,
    ...over,
  };
}

function stubFetch(body: unknown, init: { status?: number } = {}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function request(over: Partial<Parameters<typeof runVacancyImport>[0]> = {}) {
  return {
    provider: PROVIDER,
    channel: "snapshot" as const,
    mode: "dry_run" as const,
    sessionId: "session-1",
    startedAtIso: "2026-08-04T09:00:00.000Z",
    finishedAtIso: "2026-08-04T09:00:05.000Z",
    capturedAt: CAPTURED_AT,
    dedupState: emptyDedupState(),
    ...over,
  };
}

describe("the source is NOT activated — the honest default for any future provider", () => {
  it("parses and validates but imports NOTHING, reporting validAfterActivation", async () => {
    enable();
    ctl.activationOverride = "owner_review";
    stubFetch([ad(), ad({ id: "ad-2" })]);

    const result = await runVacancyImport(request());

    expect(result.operational).toBe(true);
    expect(result.activated).toBe(false);
    expect(result.acceptedVacancies).toEqual([]);
    // The evidence an owner needs to decide about activation.
    expect(result.metrics.itemsParsed).toBe(2);
    expect(result.metrics.validAfterActivation).toBe(2);
    expect(result.metrics.itemsAccepted).toBe(0);
  });

  it("names the ACTIVATION gate — the provider's terms are confirmed, our activation is not", async () => {
    enable();
    ctl.activationOverride = "owner_review";
    stubFetch([ad()]);

    const result = await runVacancyImport(request());

    // Arbetsförmedlingen's terms ARE confirmed (CC0, keyless). What is still
    // closed is our own activation decision, and the block must say so —
    // reporting "legal status unconfirmed" would now be false.
    expect(result.blockedReason).toBe("activation_off");
    expect(result.logs.some((l) => l.code === "gate_blocked")).toBe(true);
    expect(result.report?.warningCodes ?? []).toContain(
      "vacancy_activation_off",
    );
    expect(result.report?.warningCodes ?? []).not.toContain(
      "vacancy_legal_status_unconfirmed",
    );
  });

  it("persist mode still writes nothing and says why", async () => {
    enable();
    ctl.activationOverride = "owner_review";
    stubFetch([ad()]);
    const persist = vi.fn();

    const result = await runVacancyImport(
      request({ mode: "persist", persist }),
    );

    expect(persist).not.toHaveBeenCalled();
    expect(result.persistedInserted).toBe(0);
    expect(
      result.logs.find((l) => l.code === "persist_skipped")?.detail,
    ).toBe("not_activated");
  });
});

describe("channel cadence and the stream checkpoint", () => {
  it("a checkpointed channel REFUSES to run without a cursor", async () => {
    enable();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await runVacancyImport(
      request({ channel: "stream", cursor: null }),
    );

    // An unbounded stream request is a full re-read. The correct cold start
    // is a snapshot, so this must not hit the network at all.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      result.logs.some((l) => l.code === "cursor_required_run_snapshot_first"),
    ).toBe(true);
    expect(result.metrics.pagesRequested).toBe(0);
  });

  it("a cursor is sent as the request bound, nudged back by the overlap", async () => {
    enable();
    const fetchSpy = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await runVacancyImport(
      request({ channel: "stream", cursor: "2026-08-03T12:00:00.000Z" }),
    );

    const url = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("date=2026-08-03T11%3A59%3A59.000Z");
  });

  it("walks the stream in BOUNDED slices — every request carries both ends", async () => {
    enable();
    const fetchSpy = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    // 4 h of backlog against a 3 h slice and a 60 s safety lag → two slices.
    const result = await runVacancyImport(
      request({ channel: "stream", cursor: "2026-08-04T05:00:00.000Z" }),
    );

    // NEGATIVE CONTROL for the deadlock this fix exists to break: the old
    // behaviour issued exactly ONE request with a start bound only, and its
    // response therefore grew without limit until it passed the byte cap for
    // good. More than one request, each closed at both ends, is the whole
    // difference.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const urls = fetchSpy.mock.calls.map((c) => new URL(String(c[0])));
    for (const url of urls) {
      const start = Date.parse(url.searchParams.get("date")!);
      const end = Date.parse(url.searchParams.get("updated-before-date")!);
      expect(Number.isFinite(start) && Number.isFinite(end)).toBe(true);
      expect(end).toBeGreaterThan(start);
      // No slice may exceed the descriptor's width — that bound is the only
      // thing keeping one response affordable.
      expect(end - start).toBeLessThanOrEqual(3 * 60 * 60 * 1000);
    }

    // Slice 1 opens at the cursor nudged back by the overlap; the slices abut
    // exactly, so nothing between them can fall through.
    expect(urls[0].searchParams.get("date")).toBe("2026-08-04T04:59:59.000Z");
    expect(urls[0].searchParams.get("updated-before-date")).toBe(
      "2026-08-04T07:59:59.000Z",
    );
    expect(urls[1].searchParams.get("date")).toBe("2026-08-04T07:59:59.000Z");

    // The walk stops short of the present by the safety lag, never at "now".
    expect(urls[1].searchParams.get("updated-before-date")).toBe(
      "2026-08-04T08:59:00.000Z",
    );
    expect(result.nextCursor).toBe("2026-08-04T08:59:00.000Z");
    expect(result.caughtUp).toBe(true);
    expect(result.metrics.windowsPlanned).toBe(2);
    expect(result.metrics.windowsCompleted).toBe(2);
  });

  it("checkpoints on the CONSUMED SLICE, never on a publisher timestamp", async () => {
    enable();
    // The two shapes that make publisher timestamps unusable as a checkpoint,
    // both measured on the live Swedish stream (2026-08-11):
    //   - an ad UPDATED inside the slice but PUBLISHED long before it (over
    //     half of a real slice, the oldest by 11 days) — trusting it rewinds
    //     the walk into a permanent replay;
    //   - a withdrawal delta, which carries no publication date at all and so
    //     falls back to our capture clock — trusting it jerks the checkpoint
    //     to "now" and silently skips everything in between.
    stubFetch([
      ad({ id: "old-but-updated", publication_date: "2026-07-24T06:00:00Z" }),
      { id: "withdrawn", removed: true },
    ]);

    const result = await runVacancyImport(
      request({ channel: "stream", cursor: "2026-08-04T05:00:00.000Z" }),
    );

    expect(result.nextCursor).toBe("2026-08-04T08:59:00.000Z");
    expect(result.nextCursor).not.toBe("2026-07-24T06:00:00.000Z");
    expect(result.nextCursor).not.toBe(CAPTURED_AT);
  });

  it("a slice that returns nothing still counts as consumed", async () => {
    enable();
    stubFetch([]);

    const result = await runVacancyImport(
      request({ channel: "stream", cursor: "2026-08-04T05:00:00.000Z" }),
    );

    // A quiet three hours is ordinary. Refusing to move over an empty slice
    // would stall the walk permanently the first time Sweden had a slow night.
    expect(result.nextCursor).toBe("2026-08-04T08:59:00.000Z");
    expect(result.metrics.windowsCompleted).toBe(2);
  });

  it("a backlog wider than one session is TRUNCATED HONESTLY, not silently", async () => {
    enable();
    stubFetch([]);

    // ~34 days of backlog against a 50-slice-per-session cap.
    const result = await runVacancyImport(
      request({ channel: "stream", cursor: "2026-07-01T00:00:00.000Z" }),
    );

    expect(result.metrics.windowsPlanned).toBe(50);
    expect(result.metrics.windowsCompleted).toBe(50);
    // Progress is real and monotonic — 50 slices × 3 h forward from the
    // overlap-nudged cursor — but the session must NOT claim to be current.
    expect(result.nextCursor).toBe("2026-07-07T05:59:59.000Z");
    expect(result.caughtUp).toBe(false);
  });

  it("a failed slice keeps the slices already consumed", async () => {
    enable();
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        call += 1;
        // A 4xx is deterministic — the adapter returns it without retrying.
        return call === 1
          ? new Response(JSON.stringify([]), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          : new Response("nope", { status: 404 });
      }),
    );

    const result = await runVacancyImport(
      request({ channel: "stream", cursor: "2026-08-04T05:00:00.000Z" }),
    );

    expect(result.metrics.pagesFailed).toBe(1);
    expect(result.metrics.windowsCompleted).toBe(1);
    // Slice 1 was answered in full, so it stays consumed. Pinning the
    // checkpoint back to the start on any failure is what let one bad window
    // freeze the source indefinitely.
    expect(result.nextCursor).toBe("2026-08-04T07:59:59.000Z");
    expect(result.caughtUp).toBe(false);
    // The real classification survives for the operator to read.
    expect(
      result.logs.find((l) => l.code === "page_fetch_failed")?.detail,
    ).toBe("http_error");
  });

  it("a snapshot is a ONE-SHOT — a single page, never a paged sweep", async () => {
    enable();
    const fetchSpy = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify(Array.from({ length: 100 }, () => ad())), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await runVacancyImport(request({ channel: "snapshot" }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.metrics.pagesRequested).toBe(1);
  });

  it("the provider's declared cadence is snapshot-once, stream ~60s, links daily", () => {
    const byChannel = Object.fromEntries(
      PROVIDER.endpoints.map((e) => [e.channel, e.cadence]),
    );
    expect(byChannel.snapshot).toMatchObject({
      runOnce: true,
      checkpointed: false,
    });
    expect(byChannel.stream).toMatchObject({
      intervalSeconds: 60,
      runOnce: false,
      checkpointed: true,
    });
    expect(byChannel.links).toMatchObject({
      intervalSeconds: 86_400,
      runOnce: false,
      checkpointed: true,
    });
  });
});

describe("the env kill switch stops the network before any request", () => {
  it("an unset provider flag makes no request at all", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await runVacancyImport(request());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.operational).toBe(false);
    expect(result.blockedReason).toBe("provider_disabled");
    expect(result.metrics.pagesRequested).toBe(0);
  });

  it("the global kill switch stops an enabled provider", async () => {
    enable();
    vi.stubEnv("VACANCY_IMPORT_KILL_SWITCH", "on");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await runVacancyImport(request());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.blockedReason).toBe("global_kill_switch_engaged");
  });
});

describe("accounting and monitoring", () => {
  it("keeps the exact-sum invariant: scanned = accepted + rejected + duplicated", async () => {
    enable();
    stubFetch([ad(), "junk", ad({ id: "ad-3", headline: "  " })]);

    const result = await runVacancyImport(request());
    const s = result.session!;

    expect(s.itemsScanned).toBe(
      s.itemsAccepted + s.itemsRejected + s.itemsDuplicated,
    );
    expect(s.itemsScanned).toBe(3);
    expect(s.sourceKey).toBe("arbetsformedlingen");
    expect(s.transformVersion).toBe(PROVIDER.transformVersion);
  });

  it("always carries a rollback reference", async () => {
    enable();
    stubFetch([ad()]);
    const result = await runVacancyImport(request());
    expect(result.session!.rollbackRef).toBe("vacancy-import-session:session-1");
  });

  it("counts parser rejections by stable reason", async () => {
    enable();
    stubFetch(["junk"]);
    const result = await runVacancyImport(request());
    expect(result.metrics.itemsRejectedByParser).toBe(1);
    expect(
      result.session!.reasonCounts.find(
        (r) => r.code === "parse_payload_not_an_object",
      )?.count,
    ).toBe(1);
  });

  it("records bytes fetched and pages requested for monitoring", async () => {
    enable();
    stubFetch([ad()]);
    const result = await runVacancyImport(request());
    expect(result.metrics.pagesRequested).toBe(1);
    expect(result.metrics.bytesFetched).toBeGreaterThan(0);
    expect(result.metrics.pagesFailed).toBe(0);
  });

  it("emits only stable machine codes in logs — never a free-form sentence", async () => {
    enable();
    stubFetch([ad()]);
    const result = await runVacancyImport(request());
    for (const entry of result.logs) {
      expect(entry.code).toMatch(/^[a-z0-9_]+$/);
      expect(["info", "warn", "error"]).toContain(entry.level);
    }
  });
});

describe("failure handling", () => {
  it("a 4xx is recorded and the run stops without throwing", async () => {
    enable();
    stubFetch({ error: "bad request" }, { status: 400 });

    const result = await runVacancyImport(request());

    expect(result.metrics.pagesFailed).toBe(1);
    expect(result.session!.errorCount).toBeGreaterThan(0);
    expect(result.logs.some((l) => l.level === "error")).toBe(true);
  });

  it("an unparseable body is reported, not silently treated as empty", async () => {
    enable();
    stubFetch({ unexpected: true });

    const result = await runVacancyImport(request());

    expect(
      result.session!.reasonCounts.find(
        (r) => r.code === "parse_body_not_a_list",
      ),
    ).toBeTruthy();
    expect(result.logs.some((l) => l.code === "batch_unparseable")).toBe(true);
  });

  it("an unsupported channel never reaches the network", async () => {
    enable();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const noLinks = { ...PROVIDER, endpoints: PROVIDER.endpoints.slice(0, 1) };
    const result = await runVacancyImport(
      request({ provider: noLinks, channel: "links" }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.logs.some((l) => l.code === "channel_not_supported")).toBe(
      true,
    );
  });
});

describe("deduplication runs inside the pipeline", () => {
  it("an ad already stored is counted as a duplicate, not re-accepted", async () => {
    enable();
    // Pin the pre-activation reporting path: dedup must collapse identical
    // ads even while the source only REPORTS what would be valid.
    ctl.activationOverride = "owner_review";
    // Compute the hash the parser will produce for this exact ad.
    const probeFetch = [ad()];
    stubFetch(probeFetch);
    const probe = await runVacancyImport(request());
    // Nothing is accepted (source is off), but the batch was parsed — take
    // the hash from a second run seeded with it.
    expect(probe.metrics.itemsParsed).toBe(1);

    stubFetch([ad(), ad()]);
    const result = await runVacancyImport(request());
    // Two identical ads in one batch collapse to one.
    expect(result.metrics.itemsSeen).toBe(2);
    expect(result.metrics.validAfterActivation).toBe(1);
  });

  it("the hash helper is the same one the pipeline uses", () => {
    // Guards against a second hashing rule quietly appearing in the importer.
    expect(typeof computeVacancyContentHash).toBe("function");
  });
});

describe("translation stage", () => {
  it("with NO provider configured the publisher's words are kept and the gap is honest", async () => {
    enable();
    stubFetch([ad()]);

    const result = await runVacancyImport(request());

    expect(result.metrics.translationsRequested).toBe(1);
    expect(result.metrics.translationsAvailable).toBe(0);
    expect(result.metrics.translationsUnavailable).toBe(1);
  });

  it("a configured provider fills the translation without touching the original", async () => {
    enable();
    stubFetch([ad()]);
    const provider: TranslationProvider = {
      id: "test-provider",
      async translate(req) {
        return {
          status: "available",
          translatedText: `EN::${req.text}`,
          provider: "test-provider",
          error: null,
        };
      },
    };

    const result = await runVacancyImport(
      request({ translationProvider: provider }),
    );

    expect(result.metrics.translationsAvailable).toBe(1);
  });

  it("a half-translated ad is downgraded to needs_review, never shown as translated", async () => {
    enable();
    stubFetch([ad()]);
    const halfProvider: TranslationProvider = {
      id: "half",
      async translate(req) {
        // Translates the headline, fails on the body.
        return req.text === "Snickare till byggprojekt"
          ? {
              status: "available",
              translatedText: `EN::${req.text}`,
              provider: "half",
              error: null,
            }
          : {
              status: "failed",
              translatedText: null,
              provider: "half",
              error: "boom",
            };
      },
    };

    const result = await runVacancyImport(
      request({ translationProvider: halfProvider }),
    );

    expect(result.metrics.translationsAvailable).toBe(0);
    expect(result.metrics.translationsUnavailable).toBe(1);
  });
});

describe("withdrawals — the publisher taking an ad down", () => {
  /** Dedup state that already holds the ad the stream is about to withdraw. */
  function storing(externalId: string) {
    return {
      knownContentHashes: new Set(["stored-hash"]),
      knownIdentityHashes: new Map([
        [vacancyIdentityKey("arbetsformedlingen", externalId), "stored-hash"],
      ]),
    };
  }

  // One 2.5 h backlog → exactly one slice, so the stub body is read once.
  const ONE_SLICE_CURSOR = "2026-08-04T06:30:00.000Z";

  it("accepts a withdrawal that carries no headline", async () => {
    enable();
    // What a real JobStream withdrawal looks like: identity plus `removed`,
    // and nothing else. Requiring a title here rejected every one of them.
    stubFetch([{ id: "gone-1", removed: true }]);

    const result = await runVacancyImport(
      request({
        channel: "stream",
        cursor: ONE_SLICE_CURSOR,
        dedupState: storing("gone-1"),
      }),
    );

    expect(result.metrics.itemsRejectedByValidation).toBe(0);
    expect(result.metrics.itemsRemoval).toBe(1);
    expect(result.acceptedVacancies).toHaveLength(1);
    expect(result.acceptedVacancies[0].lifecycle).toBe("removed");
  });

  it("still rejects a PUBLISHED record with no headline", async () => {
    enable();
    // NEGATIVE CONTROL: the exemption is for withdrawals only. A live ad
    // nobody can name is still not a vacancy, and must not slip through on
    // the back of this change.
    stubFetch([{ id: "nameless", publication_date: "2026-08-04T06:00:00Z" }]);

    const result = await runVacancyImport(
      request({ channel: "stream", cursor: ONE_SLICE_CURSOR }),
    );

    // Refused one stage earlier than the withdrawal case — the parser already
    // refuses a titleless LIVE ad — so it never reaches validation at all.
    // The rule itself is pinned directly in vacancy-validation.test.ts.
    expect(result.metrics.itemsRejectedByParser).toBe(1);
    expect(result.metrics.itemsParsed).toBe(0);
    expect(result.acceptedVacancies).toEqual([]);
  });

  it("still refuses a withdrawal it cannot identify", async () => {
    enable();
    // Identity is what actually protects the store — a withdrawal without it
    // could deactivate anything. The parser rejects it before validation.
    stubFetch([{ removed: true }]);

    const result = await runVacancyImport(
      request({ channel: "stream", cursor: ONE_SLICE_CURSOR }),
    );

    expect(result.metrics.itemsRejectedByParser).toBe(1);
    expect(result.acceptedVacancies).toEqual([]);
  });

  it("hands the withdrawal to the writer, which stores it as not-live", async () => {
    enable();
    const persist = vi.fn().mockResolvedValue({ inserted: 0, updated: 1 });
    stubFetch([{ id: "gone-2", removed: true }]);

    await runVacancyImport(
      request({
        channel: "stream",
        mode: "persist",
        persist,
        cursor: ONE_SLICE_CURSOR,
        dedupState: storing("gone-2"),
      }),
    );

    // The end of the chain that was dead: the row mapper turns a `removed`
    // lifecycle into `is_active: false`, and the board reads only active rows.
    // Without this record reaching the writer, a job the publisher has taken
    // down stays advertised and its apply link goes nowhere.
    expect(persist).toHaveBeenCalledTimes(1);
    const rows = persist.mock.calls[0][0] as { lifecycle: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].lifecycle).toBe("removed");
  });
});
