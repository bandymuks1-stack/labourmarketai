import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Demand-visibility honesty guards (findings F-E1/F-E2/F-E3 of the
 * full-project audit 2026-07-02).
 *
 * Contract:
 *   - The demand read-back tells companies the truth that workers cannot
 *     see submitted needs yet (the worker board is closed until the
 *     approved-route migration is applied).
 *   - The marketplace discover empty state is not a dead end — it links to
 *     /dashboard/services.
 *   - The silent best-effort structured-fields UPDATE after demand submit
 *     emits a telemetry error event on failure (observable drift).
 */

const APP = join(process.cwd());
const read = (rel: string) => readFileSync(join(APP, rel), "utf-8");

describe("worker-visibility honesty note (F-E1)", () => {
  it("readback renders the note and the page passes it", () => {
    const readback = read("components/app/demand-requests-readback.tsx");
    expect(readback).toMatch(/workerVisibilityNote/);
    expect(readback).toMatch(/demand-readback-worker-visibility-note/);
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/workerVisibilityNote: tReadback\("workerVisibilityNote"\)/);
  });

  it("the key exists in en/lt/ru and states workers cannot see needs yet", () => {
    for (const locale of ["en", "lt", "ru"]) {
      const msgs = JSON.parse(read(`messages/${locale}.json`));
      expect(
        msgs.demandReadback.workerVisibilityNote,
        `workerVisibilityNote ${locale}`,
      ).toBeTruthy();
    }
    const en = JSON.parse(read("messages/en.json"));
    expect(en.demandReadback.workerVisibilityNote).toMatch(
      /workers do not see submitted needs yet/i,
    );
  });
});

describe("marketplace discover empty state links out (F-E2)", () => {
  it("empty state carries the services CTA", () => {
    const section = read("components/app/marketplace-loop-section.tsx");
    expect(section).toMatch(/marketplace-discover-empty-cta/);
    expect(section).toMatch(/\/dashboard\/services/);
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/discoverEmptyCta: t\("linkToServices"\)/);
  });
});

describe("structured-fields drift is observable (F-E3)", () => {
  it("demand-request fires a telemetry error on upErr", () => {
    const src = read("lib/demand/demand-request.ts");
    expect(src).toMatch(/recordTelemetryEvent/);
    expect(src).toMatch(/demand_structured_fields/);
    expect(src).toMatch(/result: "error"/);
  });
});
