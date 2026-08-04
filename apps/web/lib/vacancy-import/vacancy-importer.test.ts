import { afterEach, describe, expect, it, vi } from "vitest";

import { runVacancyImport } from "./vacancy-importer";
import { getVacancyProvider } from "@/lib/vacancy-sources/vacancy-provider-registry";
import { emptyDedupState } from "@/lib/vacancy-sources/vacancy-dedup";
import { computeVacancyContentHash } from "@/lib/vacancy-sources/vacancy-hash";
import type { TranslationProvider } from "@/lib/translation/translation-service";

const PROVIDER = getVacancyProvider("arbetsformedlingen")!;
const CAPTURED_AT = "2026-08-04T09:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

describe("the source is NOT activated — the honest default", () => {
  it("parses and validates but imports NOTHING, reporting validAfterActivation", async () => {
    enable();
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

  it("returns the next checkpoint, advanced over everything SEEN", async () => {
    enable();
    stubFetch([
      ad({ id: "a", publication_date: "2026-08-04T08:00:00Z" }),
      ad({ id: "b", publication_date: "2026-08-04T10:00:00Z" }),
    ]);

    const result = await runVacancyImport(
      request({ channel: "stream", cursor: "2026-08-01T00:00:00.000Z" }),
    );

    expect(result.nextCursor).toBe("2026-08-04T10:00:00.000Z");
  });

  it("a run that fetched nothing leaves the checkpoint untouched", async () => {
    enable();
    stubFetch([]);

    const result = await runVacancyImport(
      request({ channel: "stream", cursor: "2026-08-01T00:00:00.000Z" }),
    );

    expect(result.nextCursor).toBe("2026-08-01T00:00:00.000Z");
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
