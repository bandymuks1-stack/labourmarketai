/**
 * BOOKING HONESTY — CI guard (supersedes the retired booking-inert guard).
 *
 * The owner approved booking persistence for the pre-payment readiness sprint
 * (Step 4B decision → migration 20260613100100_booking_requests + a booking UI).
 * The inert guard is retired; these invariants replace it and must hold forever:
 *   - the booking-state MACHINE stays pure (no IO) — only the actions touch IO;
 *   - the worker alone may accept (no company self-accept in the model);
 *   - WHERE the persistence migration is present on the branch, it is HONEST:
 *     overlap-conflict block (no double-book), no contact/PII column on
 *     booking_requests, and an immutable readiness snapshot.
 *
 * The migration-specific checks are CONDITIONAL on the migration file existing,
 * so the same guard is valid on a UI branch (migration lives in a separate,
 * owner-gated PR) and on the schema branch (migration present).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "..", "..");
const MIGRATIONS = resolve(APP, "..", "..", "supabase", "migrations");

describe("booking state machine stays pure", () => {
  const src = readFileSync(join(APP, "lib/booking/booking-state.ts"), "utf8");
  it("imports nothing / does no IO", () => {
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/supabase|createClient|fetch\(|http/i);
  });
  it("only the worker may accept (no company self-accept in the model)", () => {
    expect(src).toMatch(/to:\s*"accepted",\s*by:\s*"worker"/);
    expect(src).not.toMatch(/to:\s*"accepted",\s*by:\s*"company"/);
  });
});

describe("booking persistence migration is honest (when present)", () => {
  const file = readdirSync(MIGRATIONS).find((f) => /_booking_requests\.sql$/.test(f));
  const sql = file ? readFileSync(join(MIGRATIONS, file), "utf8") : "";

  it.skipIf(!file)("worker-only accept is enforced in the respond RPC", () => {
    expect(sql).toMatch(/Only the addressed worker may respond/i);
  });
  it.skipIf(!file)("blocks an overlapping accepted booking (no double-booking)", () => {
    expect(sql).toMatch(/daterange/i);
    expect(sql).toMatch(/Conflicting accepted booking/i);
  });
  it.skipIf(!file)("stores NO contact/PII column on booking_requests", () => {
    const head = sql.slice(0, sql.indexOf(");") + 2);
    expect(head).not.toMatch(/\b(email|phone|mobile|whatsapp|telegram|full_name|address|passport|iban)\b/i);
  });
  it.skipIf(!file)("captures an immutable readiness snapshot at propose time", () => {
    expect(sql).toMatch(/readiness_snapshot/);
  });
});
