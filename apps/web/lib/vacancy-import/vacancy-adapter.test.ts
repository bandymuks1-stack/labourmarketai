import { afterEach, describe, expect, it, vi } from "vitest";
import { buildVacancyRequestUrl, fetchVacancyPage } from "./vacancy-adapter";
import {
  getVacancyEndpoint,
  getVacancyProvider,
} from "@/lib/vacancy-sources/vacancy-provider-registry";

const PROVIDER = getVacancyProvider("arbetsformedlingen")!;
const STREAM = getVacancyEndpoint(PROVIDER, "stream")!;

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

describe("query allowlist", () => {
  it("carries the slice END bound — the parameter that keeps a response affordable", () => {
    const url = buildVacancyRequestUrl(STREAM, {
      date: "2026-08-04T00:00:00.000Z",
      "updated-before-date": "2026-08-04T03:00:00.000Z",
    });

    expect(new URL(url).searchParams.get("updated-before-date")).toBe(
      "2026-08-04T03:00:00.000Z",
    );
  });

  it("still drops an unknown parameter rather than forwarding it", () => {
    const url = buildVacancyRequestUrl(STREAM, {
      date: "2026-08-04T00:00:00.000Z",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "redirect-to": "https://evil.invalid",
    });

    expect(url).not.toContain("evil.invalid");
    expect(new URL(url).searchParams.has("redirect-to")).toBe(false);
  });
});

describe("the request timeout bounds the TRANSFER, not just the headers", () => {
  it("times out a response whose headers arrive but whose body never ends", async () => {
    enable();

    // The exact shape the old code could not stop: headers land immediately,
    // then the body drips forever. `clearTimeout` used to run as soon as
    // `fetch` resolved — i.e. on the headers — leaving the body read with no
    // bound at all, so a stalled transfer hung the importer indefinitely.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const signal = init.signal!;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("[")); // never closes
            signal.addEventListener("abort", () => {
              controller.error(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              );
            });
          },
        });
        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const started = Date.now();
    const result = await fetchVacancyPage({
      provider: {
        ...PROVIDER,
        // Keep the test fast; overrides may only ever tighten a bound.
        boundOverrides: { requestTimeoutMs: 150 },
      },
      channel: "stream",
      query: { date: "2026-08-04T00:00:00.000Z" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("timeout");
    // Bounded by the timeout and its retries — emphatically not forever.
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("retries are reported to the caller (onRetry)", () => {
  it("calls onRetry once per attempt after the first, and not at all on first-try success", async () => {
    enable();
    // The shared retry backoff (1 s, 2 s) is not overridable by design; the
    // test simply lives with ~3 s of real waiting.
    const provider = PROVIDER;

    // Two transient network failures, then a good page: exactly 2 retries.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(
        new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    let retries = 0;
    const result = await fetchVacancyPage({
      provider,
      channel: "stream",
      query: { date: "2026-08-04T00:00:00.000Z" },
      onRetry: () => {
        retries += 1;
      },
    });
    expect(result.ok).toBe(true);
    expect(retries).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // First-try success: zero retries reported.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    let none = 0;
    await fetchVacancyPage({
      provider,
      channel: "stream",
      query: { date: "2026-08-04T00:00:00.000Z" },
      onRetry: () => {
        none += 1;
      },
    });
    expect(none).toBe(0);
  });
}, 15_000);
