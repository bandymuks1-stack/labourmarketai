/**
 * VACANCY INGESTION RUNNER — behaviour tests.
 *
 * The load-bearing claims:
 *   1. a blocked provider costs ZERO database reads;
 *   2. a DRY RUN never writes the cursor (advancing past what it merely
 *      looked at would make the next real run skip records forever);
 *   3. a fetch failure records failure health but never advances the cursor;
 *   4. one provider's exception does not stop the batch;
 *   5. the imported path's numbers come from the repository's exact
 *      partition, not from the batch size.
 *
 * Governance states are simulated by patching `getSourceProfile` — the ONE
 * lookup the shared import boundary uses. The real registry row is now `on`
 * (owner-approved 2026-08-09), so the PRE-activation states are the ones that
 * need the override. The patch is per-test and explicit.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

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

import {
  runVacancyIngestionBatch,
  runVacancyIngestionSession,
  readVacancySourceHealth,
} from "./vacancy-ingestion";
import { getVacancyProvider } from "@/lib/vacancy-sources/vacancy-provider-registry";

const PROVIDER = getVacancyProvider("arbetsformedlingen")!;
const NOW = "2026-08-09T18:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ctl.activationOverride = null;
});

function enableEnv(): void {
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

/**
 * Serve the shape the REAL endpoint serves for that path: the snapshot channel
 * answers line-delimited JSON (`application/jsonl`, one ad per line), every
 * other channel answers one JSON document. Keying on the URL rather than on a
 * per-test flag means these tests keep exercising the transport each channel
 * actually uses, instead of a uniform stub that no endpoint matches.
 */
function stubFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const impl = vi.fn().mockImplementation(async (url: string) => {
    const jsonLines = String(url).includes("/v2/snapshot");
    if (!jsonLines) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
    const rows = Array.isArray(body) ? body : [body];
    return new Response(rows.map((r) => JSON.stringify(r)).join("\n") + "\n", {
      status,
      headers: { "content-type": "application/jsonl" },
    });
  });
  vi.stubGlobal("fetch", impl);
  return impl;
}

interface Op {
  readonly table: string;
  readonly kind: "select" | "upsert" | "update";
  readonly payload?: unknown;
}

/** Recording fake for the two store tables. */
function fakeDb(options: {
  vacancies?: readonly Record<string, unknown>[];
  cursorRow?: Record<string, unknown> | null;
  tableMissing?: boolean;
} = {}) {
  const ops: Op[] = [];
  const missing = { code: "42P01" };

  const chainFor = (table: string) => {
    const result =
      options.tableMissing === true
        ? { data: null, error: missing }
        : table === "vacancy_import_cursors"
          ? { data: options.cursorRow ? [options.cursorRow] : [], error: null }
          : { data: options.vacancies ?? [], error: null };
    const single =
      options.tableMissing === true
        ? { data: null, error: missing }
        : { data: options.cursorRow ?? null, error: null };

    const chain: Record<string, unknown> = {};
    const self = () => chain;
    // HEAD count support (health read): a select with { count, head } answers
    // `count` over the vacancy fixtures matching every eq() filter whose
    // column the fixture actually carries (fixtures list provider_key only).
    let headCount = false;
    const eqFilters: [string, unknown][] = [];
    chain.select = (...args: unknown[]) => {
      ops.push({ table, kind: "select", payload: args[0] });
      const opts = args[1] as { head?: boolean } | undefined;
      headCount = opts?.head === true;
      return chain;
    };
    chain.eq = (col: string, value: unknown) => {
      eqFilters.push([col, value]);
      return chain;
    };
    chain.in = self;
    chain.or = self;
    chain.order = self;
    chain.range = self;
    chain.maybeSingle = () => Promise.resolve(single);
    chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
      if (headCount) {
        const value =
          options.tableMissing === true
            ? { data: null, error: missing, count: null }
            : {
                data: null,
                error: null,
                count: (options.vacancies ?? []).filter((row) =>
                  eqFilters.every(
                    ([col, v]) => !(col in row) || row[col] === v,
                  ),
                ).length,
              };
        return Promise.resolve(value).then(ok, err);
      }
      return Promise.resolve(result).then(ok, err);
    };
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

  return {
    client: { from: (t: string) => chainFor(t) as never } as never,
    ops,
  };
}

const request = (over: Partial<Parameters<typeof runVacancyIngestionSession>[2]> = {}) => ({
  channel: "snapshot" as const,
  mode: "dry_run" as const,
  nowIso: NOW,
  ...over,
});

describe("blocked states cost nothing and claim nothing", () => {
  it("a disabled provider (the production default) is `blocked` with ZERO db reads", async () => {
    // No env stubs: VACANCY_SOURCE_*_ENABLED is unset, exactly production.
    const { client, ops } = fakeDb();
    const fetchImpl = stubFetch([]);

    const result = await runVacancyIngestionSession(client, PROVIDER, request());

    expect(result.status).toBe("blocked");
    expect(result.blockedReason).toBe("provider_disabled");
    expect(ops).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("env on but governance owner_review: dry run fetches, is `blocked`, and REPORTS the waiting evidence", async () => {
    // This is the state the owner read to decide activation: the records are
    // well-formed, counted, and none entered. The registry row is `on` since
    // 2026-08-09, so the pre-activation state needs the explicit override —
    // the boundary must keep refusing any FUTURE provider in this state.
    enableEnv();
    ctl.activationOverride = "owner_review";
    stubFetch([ad(), ad({ id: "ad-2" })]);
    const { client, ops } = fakeDb();

    const result = await runVacancyIngestionSession(client, PROVIDER, request());

    expect(result.status).toBe("blocked");
    // Terms ARE confirmed (CC0) — what is closed is OUR activation decision,
    // and the reason must say exactly that.
    expect(result.blockedReason).toBe("activation_off");
    expect(result.metrics?.validAfterActivation).toBe(2);
    expect(result.persisted).toEqual({ inserted: 0, updated: 0, unchanged: 0 });
    // No cursor write in a blocked state.
    expect(ops.filter((o) => o.table === "vacancy_import_cursors" && o.kind !== "select")).toHaveLength(0);
  });
});

describe("dry run discipline", () => {
  it("an ACTIVATED dry run completes without writing rows OR the cursor", async () => {
    enableEnv();
    ctl.activationOverride = "on";
    stubFetch([ad()]);
    const { client, ops } = fakeDb();

    const result = await runVacancyIngestionSession(client, PROVIDER, request());

    expect(result.status).toBe("dry_run_complete");
    expect(result.metrics?.itemsAccepted).toBe(1);
    // NOTHING was written anywhere: no vacancy upsert, no cursor upsert.
    expect(ops.filter((o) => o.kind !== "select")).toHaveLength(0);
  });
});

describe("the imported path", () => {
  it("persists through the repository and advances the cursor exactly once", async () => {
    enableEnv();
    ctl.activationOverride = "on";
    stubFetch([ad(), ad({ id: "ad-2" })]);
    const { client, ops } = fakeDb();

    const result = await runVacancyIngestionSession(
      client,
      PROVIDER,
      request({ mode: "persist" }),
    );

    expect(result.status).toBe("imported");
    // Numbers from the repository's exact partition — a fresh store inserts.
    expect(result.persisted.inserted).toBe(2);
    expect(result.persisted.updated).toBe(0);

    const cursorWrites = ops.filter(
      (o) => o.table === "vacancy_import_cursors" && o.kind === "upsert",
    );
    expect(cursorWrites).toHaveLength(1);
    const written = cursorWrites[0].payload as Record<string, unknown>;
    expect(written.consecutive_failures).toBe(0);
    expect(written.last_failure_code).toBeNull();
    expect(typeof written.cursor_value).toBe("string");
    expect(result.cursorAdvanced).toBe(true);
  });

  it("a RE-RUN of identical content writes no vacancy rows — steady state is free", async () => {
    enableEnv();
    ctl.activationOverride = "on";
    stubFetch([ad()]);

    // First run against an empty fake; capture the EXACT row it stored.
    const firstDb = fakeDb();
    const first = await runVacancyIngestionSession(
      firstDb.client,
      PROVIDER,
      request({ mode: "persist" }),
    );
    expect(first.persisted.inserted).toBe(1);
    const storedRow = (
      firstDb.ops.find(
        (o) => o.table === "public_vacancies" && o.kind === "upsert",
      )?.payload as Record<string, unknown>[]
    )[0];

    // Second run against a store that already holds that row — the hash comes
    // from what the first run actually wrote, not hand-invented.
    stubFetch([ad()]);
    const secondDb = fakeDb({
      vacancies: [
        {
          provider_key: storedRow.provider_key,
          external_id: storedRow.external_id,
          content_hash: storedRow.content_hash,
        },
      ],
    });
    const second = await runVacancyIngestionSession(
      secondDb.client,
      PROVIDER,
      request({ mode: "persist" }),
    );

    // The deduper classifies the replay and drops it BEFORE persistence:
    // nothing inserted, nothing updated, and no vacancy write of any kind.
    expect(second.persisted.inserted).toBe(0);
    expect(second.persisted.updated).toBe(0);
    expect(
      secondDb.ops.filter(
        (o) => o.table === "public_vacancies" && o.kind !== "select",
      ),
    ).toHaveLength(0);
  });
});

describe("failure honesty", () => {
  it("a failed page records failure health but NEVER advances the cursor", async () => {
    enableEnv();
    ctl.activationOverride = "on";
    stubFetch({ error: "boom" }, 503);
    const { client, ops } = fakeDb({
      cursorRow: {
        provider_key: "arbetsformedlingen",
        channel: "snapshot",
        cursor_value: "2026-08-08T00:00:00Z",
        consecutive_failures: 1,
      },
    });

    const result = await runVacancyIngestionSession(
      client,
      PROVIDER,
      request({ mode: "persist" }),
    );

    expect(result.status).toBe("fetch_failed");
    expect(result.cursorAdvanced).toBe(false);

    const written = ops.find(
      (o) => o.table === "vacancy_import_cursors" && o.kind === "upsert",
    )?.payload as Record<string, unknown>;
    // Failure is RECORDED (health is observable)…
    expect(written.consecutive_failures).toBe(2);
    expect(typeof written.last_failure_code).toBe("string");
    // …but the checkpoint does not move.
    expect(written).not.toHaveProperty("cursor_value");
  });

  it("one provider's exception does not stop the batch", async () => {
    // Client whose reads throw outright — worse than an error result.
    const throwing = {
      from: () => {
        throw new Error("connection_destroyed");
      },
    } as never;
    enableEnv();
    stubFetch([]);

    const batch = await runVacancyIngestionBatch(throwing, {
      channel: "snapshot",
      mode: "dry_run",
      nowIso: NOW,
    });

    // Every registry provider produced a RESULT — none vanished, none threw
    // out of the batch.
    expect(batch.sessions.length).toBeGreaterThan(0);
    for (const session of batch.sessions) {
      expect(["blocked", "runner_exception"]).toContain(session.status);
    }
  });
});

describe("source health is readable before the store exists", () => {
  it("tolerates the unprovisioned store and still reports registry + governance truth", async () => {
    const { client } = fakeDb({ tableMissing: true });

    const health = await readVacancySourceHealth(client);

    expect(health.length).toBeGreaterThan(0);
    const se = health.find((h) => h.providerKey === "arbetsformedlingen")!;
    expect(se.countryIso).toBe("SE");
    expect(se.legalStatus).toBe("confirmed");
    expect(se.activation).toBe("on");
    expect(se.operational).toBe(false);
    expect(se.switchBlockedReason).toBe("provider_disabled");
    expect(se.cursors).toEqual([]);
    expect(se.storedActive).toBe(0);
  });

  it("reports stored rows and cursor health when the store exists", async () => {
    const { client } = fakeDb({
      vacancies: [
        { provider_key: "arbetsformedlingen" },
        { provider_key: "arbetsformedlingen" },
      ],
      cursorRow: {
        provider_key: "arbetsformedlingen",
        channel: "stream",
        cursor_value: "2026-08-09T00:00:00Z",
        last_success_at: "2026-08-09T00:00:00Z",
        consecutive_failures: 0,
      },
    });

    const health = await readVacancySourceHealth(client);
    const se = health.find((h) => h.providerKey === "arbetsformedlingen")!;

    expect(se.storedActive).toBe(2);
    expect(se.cursors).toHaveLength(1);
    expect(se.cursors[0].channel).toBe("stream");
    expect(se.cursors[0].lastSuccessAt).toBe("2026-08-09T00:00:00Z");
  });
});
