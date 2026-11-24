/**
 * WORKER VISIBILITY FOUNDATION — permanent CI guard (Step 3A).
 *
 * Doctrine §4 (default-closed) + §7 (encode the negative-visibility rules as CI
 * tests so they survive future refactors). The behavioural proof lives in
 * `lib/visibility/worker-profile-visibility.test.ts`; THIS guard pins the
 * source-level invariants that keep company-facing surfaces contact-safe:
 *   - the central policy module exists and exposes the gate functions;
 *   - contact exposure is hard-wired off (no paid unlock yet);
 *   - the existing employer-facing supply shape carries no contact field;
 *   - no fake consent / fake paid-unlock / fake matching/verification language.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

// Strip comments so assertions check executable source, not prose.
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const MODULE = "lib/visibility/worker-profile-visibility.ts";

describe("worker visibility — central policy module exists", () => {
  const src = code(read(MODULE));

  it("exports the contact gate; the dead relation resolver stays deleted", () => {
    expect(src).toMatch(/export function canViewWorkerContact/);
    // W4: the app-layer relation resolver was deleted — it had no callers
    // and disagreed with the shipped `can_view_worker` DB predicate. Dead
    // policy code that contradicts the enforced policy must not return.
    expect(src).not.toMatch(/export function canViewProfilePreview/);
    expect(src).not.toMatch(/export function resolveWorkerVisibilityRelation/);
  });

  it("exports the profile-safe + shortlist-safe builders", () => {
    expect(src).toMatch(/export function toProfileSafePreview/);
    expect(src).toMatch(/export function toShortlistSafePreview/);
  });

  it("exports the communication/booking eligibility gate", () => {
    expect(src).toMatch(/export function canStartCommunicationOrBooking/);
  });

  it("exports the contact-safety net", () => {
    expect(src).toMatch(/export function assertContactSafe/);
    expect(src).toMatch(/export function isContactSafe/);
  });
});

describe("worker visibility — contact exposure is hard-wired off", () => {
  const src = code(read(MODULE));

  it("canViewWorkerContact returns the literal false (no paid unlock)", () => {
    // Return type pinned to `false` and body returns false — no parameterised
    // path can flip it on until a future paid/match-purchase slice replaces it.
    expect(src).toMatch(/canViewWorkerContact\(\)\s*:\s*false\s*\{[\s\S]*?return\s+false\s*;?[\s\S]*?\}/);
  });

  it("the forbidden-pattern list covers the core contact channels", () => {
    for (const must of ["phone", "email", "contact", "address", "bio", "profile_text"]) {
      expect(src).toContain(`"${must}"`);
    }
  });
});

describe("worker visibility — existing employer-facing supply shape stays contact-free", () => {
  // The admin matching workbench is the live company/operator-facing worker
  // shape. Pin it: it must carry no contact field. A future leak fails here.
  const src = code(read("lib/admin/matching-workbench.ts"));
  const supply = src.slice(
    src.indexOf("interface SupplyWorkerRow"),
    src.indexOf("interface SupplyWorkerRow") + 1600,
  );

  it("SupplyWorkerRow declares no contact/private field", () => {
    expect(supply.length).toBeGreaterThan(0);
    for (const forbidden of [/\bphone\b/i, /\bemail\b/i, /full_?name/i, /\baddress\b/i, /profile_?text/i, /\bbio\b/i]) {
      expect(supply).not.toMatch(forbidden);
    }
  });
});

describe("worker visibility — no fake consent / unlock / matching language", () => {
  const src = read(MODULE).toLowerCase();

  it("does not claim a paid unlock or contact purchase is available now", () => {
    // The module may NAME the future paid flow in comments, but must not assert
    // it is implemented/available. No "unlocked"/"purchased"/"verified contact".
    expect(src).not.toMatch(/contact (is )?(unlocked|purchased|available now)/);
    expect(src).not.toMatch(/fake|mock worker|dummy candidate/);
  });

  it("makes no AI/verification claim about matching", () => {
    expect(src).not.toMatch(/ai (match|matching|verif)/);
    expect(src).not.toMatch(/automatically verif/);
  });
});
