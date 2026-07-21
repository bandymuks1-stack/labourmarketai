import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: every interactive client-side fetch is bounded by a timeout.
 *
 * A `"use client"` component that does `fetch(...)` to load or save and tracks a
 * pending state ("Įrašoma…" / "sending" / loading) will HANG forever if the
 * request never settles — the classic mobile failure (radio sleep, cell↔wifi
 * handoff, a backgrounded tab the OS freezes). A `try/catch/finally` does NOT
 * save it: a fetch that never resolves OR rejects never reaches `finally`. The
 * fix is an abort timeout (`AbortSignal.timeout(...)`) so the request rejects and
 * the pending state clears into a visible, retryable error.
 *
 * This guard fails if any client component issues a `fetch(` without an abort
 * signal / timeout in the same file. Static, secret-free, no-DB. Runs in CI via
 * `pnpm -F web test`.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

/** Client components that legitimately need no fetch timeout — explicit, with a
 *  reason. Each entry is a deliberate exception, not an oversight. */
const ALLOWLIST: Record<string, string> = {
  // (empty) The former test-checkout-button exception was closed by the
  // Stripe TEST subscriptions v1 work: both billing buttons now carry
  // AbortSignal.timeout — the guard is strengthened, never widened.
};

/** Recursively collect .tsx files under a dir. */
function tsxFiles(absDir: string, relBase: string, out: string[] = []): string[] {
  for (const name of readdirSync(absDir)) {
    const abs = join(absDir, name);
    const rel = `${relBase}/${name}`;
    if (statSync(abs).isDirectory()) tsxFiles(abs, rel, out);
    else if (name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

const CLIENT_DIRS = ["components/app", "components/marketing"] as const;
const FETCH_RE = /\bfetch\s*\(/;
const TIMEOUT_RE = /AbortSignal\.timeout|AbortController|withTimeout|signal:/;

describe("Guard: interactive client fetches are timeout-bounded (no mobile hang)", () => {
  const offenders: string[] = [];
  for (const dir of CLIENT_DIRS) {
    for (const rel of tsxFiles(join(APP_ROOT, dir), dir)) {
      const src = read(rel);
      if (!src.includes('"use client"')) continue;
      if (!FETCH_RE.test(src)) continue;
      if (ALLOWLIST[rel]) continue;
      if (!TIMEOUT_RE.test(src)) offenders.push(rel);
    }
  }

  it("no client component issues an un-timed fetch", () => {
    expect(
      offenders,
      `client components with a fetch but no abort/timeout (would hang on mobile):\n${offenders.join(
        "\n",
      )}\nAdd AbortSignal.timeout(SAVE_TIMEOUT_MS) or document an exception in ALLOWLIST.`,
    ).toEqual([]);
  });

  // Pin the specific real-user flows this hunt fixed so they can't regress.
  it("the skills picker bounds BOTH its load and save fetches", () => {
    const src = read("components/app/profession-skills-picker.tsx");
    const count = (src.match(/AbortSignal\.timeout/g) ?? []).length;
    expect(count, "both the load and save fetch must carry a timeout").toBeGreaterThanOrEqual(2);
  });

  it("the public waitlist submit is timeout-bounded", () => {
    expect(read("components/marketing/waitlist-modal.tsx")).toMatch(/AbortSignal\.timeout/);
  });
});
