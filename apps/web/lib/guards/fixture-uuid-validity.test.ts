import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { WORKER_ACTION_SCHEMAS } from "@/lib/conversation/worker-schemas";

/**
 * TEST DATA THAT CANNOT REACH THE CODE IT TESTS.
 *
 * ── WHAT HAPPENED ──────────────────────────────────────────────────────────
 * The chat-first work-log save — the product's flagship journey and the first
 * step of the entire education pilot — failed locally for every developer with
 * a generic "Nepavyko išsaugoti. Bandyk dar kartą." The canonical E2E
 * (`journal-chat-intake.spec.ts`) had a red persistence test to match.
 *
 * It looked exactly like a product defect. It was not. Instrumenting the
 * dispatcher gave the real answer in one line:
 *
 *   [DIAG parse] path ["engagementContextId"] format "uuid" — invalid_format
 *   INPUT { engagementContextId: "99999999-0000-0000-0000-000000000001", … }
 *
 * `workerLogWorkSchema.engagementContextId` is `z.uuid()`, and Zod v4 enforces
 * the RFC-4122 version and variant nibbles. The fixture's synthetic id carried
 * `0` in both positions, so it could never pass — while PRODUCTION was fine:
 * all 53 real engagement_contexts come from `gen_random_uuid()` and are v4
 * (verified against production 2026-08-27).
 *
 * So the fixture could not exercise the one path it existed to exercise, and
 * it failed in the most expensive way available: looking like a bug in the
 * product. This guard makes that impossible to reintroduce silently.
 *
 * ── WHAT IS PINNED, AND WHAT IS NOT ────────────────────────────────────────
 * Only the ids that actually travel into a `z.uuid()` schema. Fixture ids for
 * rows that never cross such a boundary (project ids, journal entry ids) stay
 * as they are — this guard is about reachability, not tidiness, and widening
 * it would be churn that protects nothing.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const FIXTURES = readFileSync(
  join(ROOT, "supabase", "dev-fixtures.sql"),
  "utf8",
);

/** RFC-4122: version nibble 1-8, variant nibble 8/9/a/b. */
const RFC_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Every id the fixtures give an `engagement_contexts` row. */
function fixtureEngagementContextIds(): string[] {
  const ids = new Set<string>();
  // The insert block names the table, then the id literal appears as the first
  // value; the follow-up UPDATE addresses the same row by id.
  for (const m of FIXTURES.matchAll(
    /insert into public\.engagement_contexts[\s\S]{0,400}?'([0-9a-f-]{36})'/gi,
  )) {
    ids.add(m[1]);
  }
  for (const m of FIXTURES.matchAll(
    /update public\.engagement_contexts[\s\S]{0,300}?where id = '([0-9a-f-]{36})'/gi,
  )) {
    ids.add(m[1]);
  }
  return [...ids];
}

describe("the work-log schema really does demand an RFC uuid", () => {
  it("z.uuid() rejects the old synthetic fixture form", () => {
    // Pinning the CAUSE, not just the symptom: if a future Zod relaxed this,
    // the fixture requirement below would be pointless ceremony and this test
    // says so out loud.
    const schema = WORKER_ACTION_SCHEMAS["worker.log-work"];
    const base = {
      notes: "Klojau plyteles vonioje",
      workDate: "2026-08-20",
      siteName: "Vilnius",
    };
    expect(
      schema.safeParse({
        ...base,
        engagementContextId: "99999999-0000-0000-0000-000000000001",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        engagementContextId: "99999999-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("z.uuid() is what the field actually uses", () => {
    expect(z.uuid().safeParse("99999999-0000-0000-0000-000000000001").success).toBe(
      false,
    );
  });
});

describe("fixture ids that reach a uuid schema are RFC-valid", () => {
  it("every fixture engagement_context id is a real UUID", () => {
    const ids = fixtureEngagementContextIds();
    // If this finds nothing, the extraction rotted — that is a failure too,
    // because a guard that silently checks an empty set protects nothing.
    expect(ids.length, "no engagement_context ids found in dev-fixtures.sql").toBeGreaterThan(0);
    for (const id of ids) {
      expect(
        RFC_UUID.test(id),
        `fixture engagement_context id "${id}" is not RFC-4122 — z.uuid() will reject it and the work-log save will fail locally while production works`,
      ).toBe(true);
    }
  });

  it("the fixture explains why, so the next author does not 'simplify' it", () => {
    expect(FIXTURES).toContain("FIXTURE UUIDs MUST BE RFC-4122 VALID");
  });
});
