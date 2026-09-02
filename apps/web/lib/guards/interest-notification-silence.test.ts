import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A BELL THAT NEVER RANG, AND NO WAY TO FIND OUT WHY.
 *
 * Production 2026-08-27: five `demand_interest_signals`, two
 * `demand_interest_expressed` rows. Read carelessly that is "three lost
 * notifications". Read against the data it is not:
 *
 *   - two of the three unnotified signals are SELF-INTEREST (the demand owner
 *     and the interested worker are one profile), which the emitter suppresses
 *     on purpose. Correct, not lost.
 *   - exactly ONE signal (2026-08-25) is a genuine miss: distinct owner, live
 *     demand, nothing emitted.
 *
 * And both "delivered" rows carry a `created_at` identical to their signal to
 * the microsecond — which `emitNotificationEvent` cannot produce, because it
 * never sets `created_at`. They are backfill artifacts. The LIVE emitter has
 * delivered nothing since it shipped.
 *
 * WHY IT COULD NOT BE DIAGNOSED. Every path by which it fails was silent: the
 * caller skipped emission entirely when `.select("id")` came back empty, and
 * the emitter ended in a BARE `catch {}` while its own docblock claimed it
 * turned "every failure into a logged outcome". Nothing threw, nothing logged,
 * and a permanent delivery failure looked exactly like a quiet marketplace.
 *
 * This guard pins the marker, and pins that the APPROVED silences stay silent —
 * a marker that fires on correct behaviour is one everybody learns to ignore.
 *
 * It deliberately does NOT assert a fix for the delivery failure itself: the
 * cause is not yet known, and inventing one would be worse than observing it.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

const EMITTERS = read("lib", "notifications", "event-emitters.ts");
const INTEREST = read("lib", "opportunities", "interest.ts");

/** The body of `emitDemandInterestNotification` only. */
function emitterBody(): string {
  const start = EMITTERS.indexOf(
    "export async function emitDemandInterestNotification",
  );
  expect(start).toBeGreaterThan(-1);
  const next = EMITTERS.indexOf("\nexport ", start + 10);
  return EMITTERS.slice(start, next === -1 ? undefined : next);
}

describe("an undelivered interest notification is observable", () => {
  it("there is ONE greppable marker, shared by both files", () => {
    expect(EMITTERS).toContain("export const INTEREST_UNDELIVERED");
    // The caller imports the same constant rather than re-typing the string,
    // so an operator's grep can never match one site and miss the other.
    expect(INTEREST).toContain("INTEREST_UNDELIVERED");
    expect(INTEREST).not.toMatch(/console\.warn\(\s*"\[notifications\/interest\]/);
  });

  it("the emitter's catch is no longer bare", () => {
    const body = emitterBody();
    // The exact defect: `} catch {` with nothing but a comment inside.
    expect(body).not.toMatch(/\}\s*catch\s*\{\s*(\/\/[^\n]*\n\s*)*\}/);
    expect(body).toMatch(/catch\s*\(\s*err\s*\)/);
    expect(body).toMatch(/undelivered\(\s*"threw"/);
  });

  it("every unexplained early return is named", () => {
    const body = emitterBody();
    for (const reason of [
      "signal_unreadable",
      "owner_unresolved",
      "insert_failed",
    ]) {
      expect(body, `unnamed failure path: ${reason}`).toContain(`"${reason}"`);
    }
  });

  it("the caller no longer skips emission in silence", () => {
    // `if (signalId) await emit(...)` with no else: the interest is stored,
    // the owner is never told, and nothing anywhere says so.
    expect(INTEREST).toMatch(/"no_signal_id"/);
    const call = INTEREST.slice(
      INTEREST.indexOf("const signalId ="),
      INTEREST.indexOf("return { kind: \"ok\", status: \"interested\" }"),
    );
    expect(call).toContain("else");
  });
});

describe("correct suppressions stay silent", () => {
  it("self-interest does not fire the marker", () => {
    const body = emitterBody();
    const selfCheck = body.indexOf("actor === owner");
    expect(selfCheck).toBeGreaterThan(-1);
    // The self-interest branch returns without logging. A marker that fires on
    // approved behaviour trains everyone to ignore it.
    const branch = body.slice(selfCheck, selfCheck + 200);
    expect(branch).not.toContain("undelivered(");
  });

  it("the marker carries a reason, never the worker's note or a person", () => {
    const body = emitterBody();
    for (const leak of ["note", "recipientProfileId:", "profile_id"]) {
      const line = body
        .split("\n")
        .find((l) => l.includes("undelivered(") && l.includes(leak));
      expect(line, `marker leaked "${leak}"`).toBeUndefined();
    }
  });
});
