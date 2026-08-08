import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  unavailabilityOverlaps,
  workersUnavailableFor,
  type WorkerUnavailability,
} from "@/lib/planning/employer-availability";
import {
  projectAbsenceItem,
  rangesOverlapInclusive,
} from "@/lib/planning/planning-model";

/**
 * Guard for the W12 EMPLOYER projection.
 *
 * WHAT WAS MISSING. The canonical calendar answered all eleven worker
 * questions and none of the employer ones. An employer could assign a worker
 * to days that worker had approved leave for and the product said nothing —
 * the only employer-side absence read filters `status = 'requested'`, so it is
 * an approval queue, not a schedule.
 *
 * THE TWO RULES THIS HOLDS.
 *
 * 1. MINIMUM NECESSARY, ENFORCED BY THE QUERY. An employer learns that a
 *    worker is unavailable and when. Never why. `worker_absences.note` is free
 *    text and `absence_type` includes `sickness` — health information. Neither
 *    column may be REQUESTED, because "we fetch it and don't render it" leaks
 *    the moment any component changes, and puts it in a server payload
 *    regardless.
 *
 * 2. ONE CANONICAL TRUTH. Overlap is the booking accept guard's inclusive
 *    day-range rule (`daterange(start, coalesce(end,start), '[]') &&`,
 *    errcode 23P01), reached through the shared model — not a second
 *    implementation that would drift the first time either side changed.
 *
 * Authorization is deliberately NOT tested here: it lives in
 * `worker_absences` RLS (`caller_manages_worker`), which is a database
 * property and is proven against a real database, not against a fake.
 */

const APP = resolve(__dirname, "..", "..");

const band = (id: string, start: string, end: string): WorkerUnavailability => ({
  workerId: `w-${id}`,
  workerName: `Worker ${id}`,
  item: projectAbsenceItem({
    id,
    startDate: start,
    endDate: end,
    status: "approved",
  })!,
});

describe("W12 employer — minimum necessary visibility is enforced by the query", () => {
  const src = readFileSync(
    resolve(APP, "lib", "planning", "employer-availability.ts"),
    "utf8",
  );

  it("never requests the private columns from the database", async () => {
    // A recording fake: run the real read and capture the column list it asks
    // for. Asserting on the SELECT the module actually issues, not on whether
    // a component happens to render the value.
    const selects: string[] = [];
    const filters: string[] = [];
    const builder = () => {
      const chain: Record<string, unknown> = {
        select: (cols: string) => {
          selects.push(cols);
          return chain;
        },
        eq: () => chain,
        in: (col: string, vals: readonly string[]) => {
          filters.push(`${col}:${vals.join("|")}`);
          return chain;
        },
        order: () => chain,
        limit: () => Promise.resolve({ data: [], error: null }),
      };
      return chain;
    };
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
        from: () => builder(),
      }),
    }));
    vi.resetModules();
    const mod = await import("@/lib/planning/employer-availability");
    const out = await mod.getEmployerWorkerAvailability();
    expect(out.status).toBe("ok");

    const absenceSelect = selects.find((s) => s.includes("worker_id") && s.includes("start_date"));
    expect(absenceSelect, "absence read never ran").toBeTruthy();
    // THE PRIVACY ASSERTION — the free-text reason and the type (which
    // includes `sickness`) are not in the payload at all.
    expect(absenceSelect).not.toContain("note");
    expect(absenceSelect).not.toContain("absence_type");
    // …while the scheduling facts are.
    expect(absenceSelect).toContain("start_date");
    expect(absenceSelect).toContain("end_date");
    expect(absenceSelect).toContain("status");

    // Only APPROVED leave counts as unavailability — a `requested` absence is
    // a pending intention and must not block scheduling.
    expect(filters).toContain("status:approved");
    vi.doUnmock("@/lib/supabase/server");
    vi.resetModules();
  });

  it("does not name the private columns anywhere in the module", () => {
    // Belt and braces: not selected above, and not reachable via a later
    // convenience read added to the same file.
    expect(src).not.toMatch(/["']absence_type["']/);
    expect(src).not.toMatch(/\bnote\b\s*:/);
  });

  it("carries no reason on the projected item", () => {
    const u = band("a1", "2026-08-10", "2026-08-14");
    const blob = JSON.stringify(u.item);
    expect(blob).not.toContain("sickness");
    expect(blob).not.toContain("annual_leave");
    // The canonical mapper deliberately leaves the label null — the employer
    // sees an unavailability band, not a described one.
    expect(u.item.label).toBeNull();
    expect(u.item.detail).toBeNull();
  });
});

describe("W12 employer — overlap is the canonical rule, not a second one", () => {
  it("agrees with the shared model on every boundary case", () => {
    const cases: [string, string, string, string][] = [
      ["2026-08-01", "2026-08-05", "2026-08-05", "2026-08-09"], // touching
      ["2026-08-01", "2026-08-05", "2026-08-06", "2026-08-09"], // adjacent
      ["2026-08-01", "2026-08-10", "2026-08-03", "2026-08-04"], // contained
      ["2026-08-10", "2026-08-12", "2026-08-01", "2026-08-02"], // disjoint
      ["2026-08-05", "2026-08-05", "2026-08-05", "2026-08-05"], // same day
    ];
    for (const [pStart, pEnd, uStart, uEnd] of cases) {
      const viaModel = rangesOverlapInclusive(pStart, pEnd, uStart, uEnd);
      const viaEmployer = unavailabilityOverlaps(
        { startDate: pStart, endDate: pEnd },
        band("x", uStart, uEnd).item,
      );
      expect(viaEmployer, `${pStart}..${pEnd} vs ${uStart}..${uEnd}`).toBe(viaModel);
    }
  });

  it("treats touching edges as a collision, like the DB accept guard", () => {
    // end A === start B. The database calls this an overlap (inclusive
    // daterange), so the employer view must too — otherwise it would green-light
    // a booking the accept RPC then refuses with 23P01.
    expect(
      unavailabilityOverlaps(
        { startDate: "2026-08-01", endDate: "2026-08-10" },
        band("t", "2026-08-10", "2026-08-15").item,
      ),
    ).toBe(true);
  });

  it("collapses an open-ended plan to its start day", () => {
    // Same coalesce(end, start) rule the worker calendar and the DB use.
    expect(
      unavailabilityOverlaps(
        { startDate: "2026-08-10", endDate: null },
        band("o", "2026-08-10", "2026-08-12").item,
      ),
    ).toBe(true);
    expect(
      unavailabilityOverlaps(
        { startDate: "2026-08-09", endDate: null },
        band("o", "2026-08-10", "2026-08-12").item,
      ),
    ).toBe(false);
  });
});

describe("W12 employer — 'can I staff these dates?'", () => {
  const roster = [
    band("a", "2026-08-10", "2026-08-14"),
    band("b", "2026-09-01", "2026-09-03"),
    band("c", "2026-08-13", "2026-08-20"),
  ];

  it("names exactly the workers who collide with the planned window", () => {
    const hit = workersUnavailableFor(
      { startDate: "2026-08-12", endDate: "2026-08-13" },
      roster,
    );
    expect(hit.map((h) => h.workerId).sort()).toEqual(["w-a", "w-c"]);
  });

  it("returns nobody when the window is clear", () => {
    expect(
      workersUnavailableFor({ startDate: "2026-10-01", endDate: "2026-10-05" }, roster),
    ).toHaveLength(0);
  });

  it("an empty roster is not a scheduling conflict", () => {
    expect(
      workersUnavailableFor({ startDate: "2026-08-12", endDate: "2026-08-13" }, []),
    ).toHaveLength(0);
  });
});

describe("W12 employer — no second calendar engine", () => {
  const src = readFileSync(
    resolve(APP, "lib", "planning", "employer-availability.ts"),
    "utf8",
  );

  it("reuses the canonical model rather than reimplementing date logic", () => {
    expect(src).toContain('from "@/lib/planning/planning-model"');
    expect(src).toContain("projectAbsenceItem");
    expect(src).toContain("rangesOverlapInclusive");
    expect(src).toContain("effectiveEndDay");
  });

  it("never reaches for a privileged client", () => {
    // The whole authorization argument rests on this being an ordinary
    // authenticated read that RLS filters.
    expect(src).not.toContain("service_role");
    expect(src).not.toContain("SERVICE_ROLE");
    expect(src).not.toMatch(/createServiceClient|serviceClient|admin_client/);
    expect(src).not.toMatch(/\.rpc\(/);
  });
});
