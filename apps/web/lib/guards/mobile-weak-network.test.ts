import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * WEAK NETWORK ON THE NATIVE APP — a failed or stalled read is a FAILURE with
 * a retry, never an empty list and never an endless spinner (#1314 on the
 * phone).
 *
 * The behaviour is proven in `packages/client-core/src/transport.test.ts`
 * ("weak network") and on an Android emulator in airplane mode
 * (`apps/mobile/.maestro/offline-sign-in-journey.yaml`). What can silently
 * regress without either noticing is the WIRING, so the wiring is pinned:
 *
 *   1. every capability call has a deadline (React Native's fetch has none);
 *   2. the auth client uses the same deadline, so sign-in cannot hang either;
 *   3. every screen that reads a capability renders it through the gate that
 *      turns a failure into a sentence + "Try again".
 */
const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("mobile weak network — every bad link ends in an honest failure", () => {
  it("callDomain races every exchange against a finite deadline", () => {
    const transport = read("packages/client-core/src/transport.ts");
    expect(transport).toMatch(/export const DOMAIN_REQUEST_TIMEOUT_MS = \d/);
    expect(transport).toMatch(/withDeadline\(timeoutMs,/);
  });

  it("the auth client (supabase-js) gets the same deadline", () => {
    const supabase = read("apps/mobile/src/supabase.ts");
    expect(supabase).toMatch(/global:\s*\{\s*fetch:\s*fetchWithDeadline\(/);
  });

  it("every screen that reads a capability renders it through the failure-aware gate", () => {
    const files = [
      ...walk(resolve(REPO, "apps/mobile/app")),
      ...walk(resolve(REPO, "apps/mobile/src/screens")),
    ];
    const readers = files.filter((f) => /useCapability<|useProfile\(\)/.test(readFileSync(f, "utf8")));
    expect(readers.length, "no capability-reading screen found — re-read this guard's premise").toBeGreaterThan(0);
    for (const f of readers) {
      const src = readFileSync(f, "utf8");
      expect(
        /<CapabilityGate\b/.test(src) || /<CapabilityFailureNotice\b/.test(src),
        `${f} reads a capability but never renders CapabilityGate / CapabilityFailureNotice — a failed read would show as nothing`,
      ).toBe(true);
    }
  });

  it("the failure notice keeps its retry and its offline sentence", () => {
    const notice = read("apps/mobile/src/screens/capability-failure.tsx");
    expect(notice).toMatch(/testID="capability-retry"/);
    const domain = read("apps/mobile/src/domain.ts");
    expect(domain).toMatch(/case "unreachable":\s*return "domain\.unavailable\.offline"/);
  });
});
