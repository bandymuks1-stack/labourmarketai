import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  deriveWorkerAdsReadiness,
  type WorkerAdsRuntimeSignals,
} from "@/lib/ads/limited-worker-ads-readiness";

/**
 * Limited-worker-ads readiness (Wagon 1) — no-fake-green guard.
 *
 * Pins: READY requires EVERY signal (consent spine applied, real
 * discoverable supply > 0, contact-request model applied); unknown counts
 * fail closed; and every cited proof artifact actually exists in the repo.
 */

const webRoot = join(__dirname, "..", "..");
const repoRoot = join(webRoot, "..", "..");

const ALL_GREEN: WorkerAdsRuntimeSignals = {
  consentSpineApplied: true,
  discoverableWorkers: 5,
  contactRequestModelApplied: true,
};

describe("deriveWorkerAdsReadiness — no fake green", () => {
  it("is READY only when every runtime signal is green", () => {
    expect(deriveWorkerAdsReadiness(ALL_GREEN).status).toBe("READY");
  });

  it("NOT_READY while the contact-request migration is unapplied", () => {
    const r = deriveWorkerAdsReadiness({
      ...ALL_GREEN,
      contactRequestModelApplied: false,
    });
    expect(r.status).toBe("NOT_READY");
    expect(
      r.items.find((i) => i.key === "contact_request_flow")?.ok,
    ).toBe(false);
  });

  it("NOT_READY without the consent spine", () => {
    expect(
      deriveWorkerAdsReadiness({ ...ALL_GREEN, consentSpineApplied: false })
        .status,
    ).toBe("NOT_READY");
  });

  it("NOT_READY with zero or UNKNOWN discoverable supply (fail closed)", () => {
    expect(
      deriveWorkerAdsReadiness({ ...ALL_GREEN, discoverableWorkers: 0 }).status,
    ).toBe("NOT_READY");
    expect(
      deriveWorkerAdsReadiness({ ...ALL_GREEN, discoverableWorkers: null })
        .status,
    ).toBe("NOT_READY");
  });

  it("exposes the real supply number, never a fabricated one", () => {
    const r = deriveWorkerAdsReadiness({ ...ALL_GREEN, discoverableWorkers: 3 });
    expect(r.items.find((i) => i.key === "discoverable_supply")?.value).toBe(3);
  });
});

describe("every cited proof artifact exists", () => {
  it("code + runtime proofs resolve to real files", () => {
    const items = deriveWorkerAdsReadiness(ALL_GREEN).items;
    expect(items.length).toBeGreaterThanOrEqual(7);
    for (const item of items) {
      const base = item.proof.startsWith("supabase/") ? repoRoot : webRoot;
      expect(existsSync(join(base, item.proof)), item.proof).toBe(true);
    }
  });
});

describe("code seams are actually wired (not just present)", () => {
  it("the scouting surface renders the freshness badge and filters", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync(
      join(webRoot, "app", "[locale]", "dashboard", "company", "scouting", "page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/lastActiveBucket/);
    expect(page).toMatch(/parseScoutFilterParams/);
    expect(page).toMatch(/RequestContactDetailsButton/);
  });

  it("the supply ranking demotes dormant profiles", async () => {
    const { readFileSync } = await import("node:fs");
    const scouting = readFileSync(join(webRoot, "lib", "scouting", "scouting.ts"), "utf8");
    expect(scouting).toMatch(/freshnessDemotionRank/);
  });
});
