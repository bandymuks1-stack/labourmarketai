import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalInputHash,
  genuineTokenIssuedAt,
  issueConfirmationToken,
} from "@/lib/conversation/confirmation-token";
import {
  DRAFT_FACT_SLUGS,
  DRAFT_FIELDS_NOT_METRICS,
  draftFactsKeyOfFields,
  draftFactsKeyOfRows,
  findConfirmedDraftEntry,
  fragmentMetricRows,
  parseFragments,
} from "./journal-write-core";
import { intakeWorkTimeFields } from "./intake-work-time";

/**
 * P0-A (owner, 2026-10-30) — a confirm retried after its response was lost
 * must answer with the entry the first call recorded, never "not saved —
 * draft again" (which wrote the same day twice). Three parts:
 *  1. only a GENUINE token (ours, unexpired, this action / input / user) has
 *     an issue time to ask about — a moved state or a spent token is exactly
 *     the case it answers;
 *  2. the entry it asks for carries EVERY fact the signed draft's FormData
 *     mapping writes: context, words, project (columns) and every persisted
 *     metric — day, site, origin, durations, clock span (Codex on #2893);
 *  3. a guard: every field either transport's mapping sends is compared or
 *     named as not a metric, so a new signed field cannot be missed.
 */

const SECRET = "test-secret-0123456789";
const INPUT = { notes: "Klijavau plyteles 6 val.", workDate: "2026-10-29" };
const NOW = 1_800_000_000_000;

function token(overrides: Partial<{ input: unknown; userId: string; issuedAtMs: number }> = {}) {
  return issueConfirmationToken(SECRET, {
    actionId: "journal.confirm",
    inputHash: canonicalInputHash(overrides.input ?? INPUT),
    userId: overrides.userId ?? "user-1",
    stateFingerprint: "journal-head:v1:w:h0",
    issuedAtMs: overrides.issuedAtMs ?? NOW - 10_000,
  });
}

const ctx = {
  actionId: "journal.confirm",
  input: INPUT,
  userId: "user-1",
  currentStateFingerprint: "journal-head:v1:w:h1",
  nowMs: NOW,
};

describe("genuineTokenIssuedAt", () => {
  it("a genuine token whose state moved has an issue time", () => {
    expect(genuineTokenIssuedAt(SECRET, token(), ctx)).toBe(NOW - 10_000);
  });
  it("also when the state did not move (a spent token racing the first call)", () => {
    expect(
      genuineTokenIssuedAt(SECRET, token(), { ...ctx, currentStateFingerprint: "journal-head:v1:w:h0" }),
    ).toBe(NOW - 10_000);
  });
  it("never for another input, another user, an expired token or a forged one", () => {
    expect(genuineTokenIssuedAt(SECRET, token({ input: { ...INPUT, notes: "x" } }), ctx)).toBeNull();
    expect(genuineTokenIssuedAt(SECRET, token({ userId: "user-2" }), ctx)).toBeNull();
    expect(genuineTokenIssuedAt(SECRET, token({ issuedAtMs: NOW - 10 * 60_000 }), ctx)).toBeNull();
    expect(genuineTokenIssuedAt("another-secret-000000", token(), ctx)).toBeNull();
    expect(genuineTokenIssuedAt(SECRET, "not-a-real.token", ctx)).toBeNull();
  });
});

/** The rows the write core persists for a FormData mapping (the same
 *  builders and the same shapes as createJournalEntryCore). */
function rowsFor(fields: Record<string, string>) {
  return [
    ...(fields.work_date ? [{ metric_slug: "work_date", value_text: fields.work_date }] : []),
    ...(fields.site_name ? [{ metric_slug: "site_name", value_text: fields.site_name }] : []),
    ...(fields.input_origin === "voice" ? [{ metric_slug: "input_origin", value_text: "voice" }] : []),
    ...(fields.voice_language ? [{ metric_slug: "voice_language", value_text: fields.voice_language }] : []),
    ...fragmentMetricRows(parseFragments(fields.fragments_json ?? null)),
    ...(fields.quantity
      ? [{ metric_slug: "quantity", value_numeric: Number(fields.quantity), unit_slug: fields.unit_slug }]
      : []),
    ...(fields.work_start ? [{ metric_slug: "work_start", value_text: fields.work_start }] : []),
    ...(fields.work_end ? [{ metric_slug: "work_end", value_text: fields.work_end }] : []),
    ...(fields.break_minutes
      ? [{ metric_slug: "break_minutes", value_numeric: Number(fields.break_minutes), unit_slug: "minutes" }]
      : []),
    // rows the pipeline or other writers add are not draft facts
    { metric_slug: "skill_signal", value_text: "x" },
  ];
}

const draftFields = (over: Record<string, string> = {}) => ({
  locale: "lt",
  engagement_context_id: "ctx-1",
  notes: INPUT.notes,
  work_date: INPUT.workDate,
  site_name: "",
  project_id: "",
  ...intakeWorkTimeFields(INPUT.notes, INPUT.workDate),
  ...over,
});

describe("findConfirmedDraftEntry", () => {
  type Row = { id: string; project_id?: string | null; journal_entry_metrics?: unknown[] };
  function sb(result: { data: Row[] | null; error: unknown } | "throw") {
    const calls: string[] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "gte", "order"]) {
      b[m] = (...args: unknown[]) => {
        calls.push(`${m}:${String(args[0])}${m === "gte" || m === "eq" ? `=${String(args[1])}` : ""}`);
        return b;
      };
    }
    b.limit = async () => {
      if (result === "throw") throw new Error("x");
      return result;
    };
    return { client: { from: () => b } as never, calls };
  }
  const q = (fields = draftFields()) => ({ workerId: "worker-1", fields, issuedAtMs: NOW - 10_000 });
  const stored = (fields = draftFields(), extra: Partial<Row> = {}) => ({
    data: [{ id: "e-1", journal_entry_metrics: rowsFor(fields), ...extra }],
    error: null,
  });

  it("finds the live entry carrying every fact of the draft, recorded after the token (5 s clock skew)", async () => {
    const { client, calls } = sb(stored());
    expect(await findConfirmedDraftEntry(client, q())).toBe("e-1");
    expect(calls).toContain("eq:worker_id=worker-1");
    expect(calls).toContain("eq:engagement_context_id=ctx-1");
    expect(calls).toContain(`eq:original_text=${INPUT.notes}`);
    expect(calls).toContain("is:deleted_at");
    expect(calls).toContain("is:superseded_by");
    expect(calls).toContain(`gte:created_at=${new Date(NOW - 15_000).toISOString()}`);
  });

  it("the same words for another day are another entry", async () => {
    const { client } = sb(stored(draftFields({ work_date: "2026-10-28" })));
    expect(await findConfirmedDraftEntry(client, q())).toBeNull();
  });

  it("the same words saved elsewhere with OTHER reviewed hours, or none, are not this draft", async () => {
    const four = draftFields({
      fragments_json: JSON.stringify([{ rawPhrase: "Klijavau plyteles 6 val", timeValue: 4, timeUnit: "hours", source: "worker_input" }]),
    });
    expect(await findConfirmedDraftEntry(sb(stored(four)).client, q())).toBeNull();
    const none = draftFields({ fragments_json: "" });
    expect(await findConfirmedDraftEntry(sb(stored(none)).client, q())).toBeNull();
  });

  it("SITE: drafts identical except the site are different work (null ↔ null, A ≠ B)", async () => {
    const atA = draftFields({ site_name: "Objektas A" });
    const atB = draftFields({ site_name: "Objektas B" });
    expect(await findConfirmedDraftEntry(sb(stored(atA)).client, q(atA))).toBe("e-1");
    expect(await findConfirmedDraftEntry(sb(stored(atA)).client, q(atB))).toBeNull();
    expect(await findConfirmedDraftEntry(sb(stored(atA)).client, q(draftFields()))).toBeNull();
    expect(await findConfirmedDraftEntry(sb(stored(draftFields())).client, q(atA))).toBeNull();
  });

  it("voice origin is a fact too", async () => {
    const voice = draftFields({ input_origin: "voice", voice_language: "lt", voice_disclosure_version: "v1" });
    expect(await findConfirmedDraftEntry(sb(stored(voice)).client, q(voice))).toBe("e-1");
    expect(await findConfirmedDraftEntry(sb(stored(draftFields())).client, q(voice))).toBeNull();
  });

  it("the project choice must match: a project, 'none', or the database's own rule", async () => {
    const withP1 = stored(draftFields(), { project_id: "p1" });
    expect(await findConfirmedDraftEntry(sb(withP1).client, q(draftFields({ project_id: "p1" })))).toBe("e-1");
    expect(await findConfirmedDraftEntry(sb(withP1).client, q(draftFields({ project_id: "p2" })))).toBeNull();
    expect(await findConfirmedDraftEntry(sb(withP1).client, q(draftFields({ project_id: "none" })))).toBeNull();
    // absent = the database attributed it (auto-link), whatever it chose
    expect(await findConfirmedDraftEntry(sb(withP1).client, q())).toBe("e-1");
  });

  it("nothing, a read error and a throw all read as none", async () => {
    expect(await findConfirmedDraftEntry(sb({ data: [], error: null }).client, q())).toBeNull();
    expect(await findConfirmedDraftEntry(sb({ data: null, error: { message: "e" } }).client, q())).toBeNull();
    expect(await findConfirmedDraftEntry(sb("throw").client, q())).toBeNull();
  });
});

describe("draft facts key — the FormData mapping and the rows the write core stores agree", () => {
  for (const notes of [
    "Klijavau plyteles 6 val., glaisčiau sienas 2 val.",
    "Dirbau nuo 22 iki 6, 30 min pertrauka",
    "Nuvažiavau 320 km",
    "Montavau lentynas",
  ]) {
    it(notes, () => {
      const fields = { work_date: "2026-10-29", site_name: "Vilnius A1", ...intakeWorkTimeFields(notes, "2026-10-29") };
      expect(draftFactsKeyOfRows(rowsFor(fields))).toBe(draftFactsKeyOfFields(fields));
    });
  }
});

describe("GUARD: every field a confirm sends is compared or named as not a metric", () => {
  const root = join(__dirname, "..", "..");
  const mappingKeys = (file: string, fn: string): string[] => {
    const src = readFileSync(join(root, file), "utf8");
    const at = src.indexOf(`function ${fn}(`);
    expect(at, `${fn} in ${file}`).toBeGreaterThan(-1);
    const ret = src.indexOf("return {", at);
    const body = src.slice(ret, src.indexOf("\n}\n", ret));
    return [...body.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]!);
  };
  const intakeKeys = new Set<string>();
  for (const n of ["Klijavau 6 val., glaisčiau 2 val.", "nuo 22 iki 6", "320 km", "9 valandas: 5 val. X, 2 val. Y"]) {
    for (const k of Object.keys(intakeWorkTimeFields(n, "2026-10-29"))) intakeKeys.add(k);
  }

  it.each([
    ["lib/capabilities/registry.ts", "journalConfirmFields"],
    ["lib/conversation/worker-executors.ts", "logWorkFields"],
  ])("%s %s", (file, fn) => {
    const keys = [...mappingKeys(file, fn), ...intakeKeys];
    expect(keys).toContain("work_date");
    expect(keys).toContain("site_name");
    for (const k of keys) {
      expect(DRAFT_FACT_SLUGS.has(k) || DRAFT_FIELDS_NOT_METRICS.has(k), `field "${k}" is neither compared nor named`).toBe(true);
    }
  });
});
