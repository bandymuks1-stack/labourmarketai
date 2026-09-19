import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { stripTimingForRepeat } from "./demand-request";

/**
 * REPEAT THIS NEED (2026-09-19) — a past request is the starting point for a
 * new one. Structure travels; time, status and every execution fact do not.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("stripTimingForRepeat — dates never travel to a new period", () => {
  const v2 = {
    time: {
      start_earliest: "2026-05-01",
      start_latest: "2026-05-10",
      end_date: "2026-08-31",
      application_deadline: "2026-04-20",
      hours_per_week: 40,
      shifts: ["day"],
    },
    languages: [{ code: "lt", level: "B1" }],
  } as unknown as Parameters<typeof stripTimingForRepeat>[0];

  it("clears every date and deadline, keeps the shape of the work", () => {
    const out = stripTimingForRepeat(v2)!;
    expect(out.time).toEqual({ hours_per_week: 40, shifts: ["day"] });
    expect((out as { languages: unknown }).languages).toEqual([{ code: "lt", level: "B1" }]);
  });

  it("a time block that held only dates disappears entirely", () => {
    const onlyDates = { time: { start_earliest: "2026-05-01", end_date: "2026-06-01" } } as unknown as Parameters<typeof stripTimingForRepeat>[0];
    expect(stripTimingForRepeat(onlyDates)!.time).toBeUndefined();
  });

  it("null and a cluster without time pass through", () => {
    expect(stripTimingForRepeat(null)).toBeNull();
    const noTime = { languages: [] } as unknown as Parameters<typeof stripTimingForRepeat>[0];
    expect(stripTimingForRepeat(noTime)).toBe(noTime);
  });
});

describe("the by-id reader clones structure only, as the caller, in their workspace", () => {
  const src = read("lib/demand/demand-request.ts");
  const fn = src.split("export async function getOwnDemandPrefillById(")[1]?.split("export function stripTimingForRepeat")[0] ?? "";

  it("reads the caller's OWN row of the intent's kind, after the workspace gate", () => {
    expect(fn).toMatch(/requireEmployerCompany\(\)/);
    expect(fn).toMatch(/\.eq\("profile_id", user\.id\)/);
    expect(fn).toMatch(/\.eq\("kind", INTENT_KIND\[intent\]\)/);
    expect(fn).toMatch(/\.eq\("id", requestId\)/);
  });

  it("selects only the structural columns — no signals, offers, bookings, messages, evidence", () => {
    const select = fn.match(/\.select\(\s*"([^"]+)"/)?.[1] ?? "";
    expect(select).toBe("id, status, title, need_summary, country, role_or_work_type, team_size, start_period, payload");
    for (const forbidden of ["demand_interest", "booking", "offer", "conversation", "evidence", "assignment"]) {
      expect(fn.toLowerCase()).not.toContain(`from("${forbidden}`);
    }
  });

  it("resets urgency and the timing cluster, and never continues the old row's draft", () => {
    expect(fn).toMatch(/urgency: null/);
    expect(fn).toMatch(/stripTimingForRepeat\(base\.structuredV2\)/);
    expect(fn).toMatch(/source: "request"/);
  });

  it("is reachable: the readback offers it and the wizard honours it", () => {
    const readback = read("components/app/demand-requests-readback.tsx");
    expect(readback).toMatch(/data-testid="demand-readback-repeat-link"/);
    expect(readback).toMatch(/\?repeat=\$\{r\.id\}#demand-intake/);
    expect(readback).toMatch(/r\.status !== "draft"/);
    const button = read("components/app/demand-request-button.tsx");
    expect(button).toMatch(/repeatRequestId\?: string \| null/);
    expect(button).toMatch(/getDemandPrefillByIdAction\(intent, repeatRequestId\)/);
    const page = read("app/[locale]/dashboard/company/needs/page.tsx");
    expect(page).toMatch(/repeatRequestId=\{repeatRequestId\}/);
    for (const locale of ["en", "lt", "ru", "nl", "de"]) {
      expect(read(`messages/${locale}.json`)).toMatch(/"repeatLink": "/);
    }
  });
});
