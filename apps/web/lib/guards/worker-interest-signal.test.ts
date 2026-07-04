import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { needFromRoleText } from "@/lib/opportunities/opportunity-need";
import {
  buildMatchSnapshot,
  cleanInterestNote,
  isWorkerWritableInterestStatus,
  INTEREST_NOTE_MAX,
  WORKER_WRITABLE_INTEREST_STATUSES,
} from "@/lib/opportunities/interest-snapshot";
import { matchWorkerToNeed, type MatchSubject } from "@/lib/market/match-v1";

/**
 * WORKER EXPRESS-INTEREST GUARDS (worker-interest-signal slice, Tasks 6+).
 *
 * The interest signal must be: internal-only (no external sending, pinned at
 * source level), canonical (snapshot carries SLUGS from the shared PR4/PR5
 * pipeline, never display names), owner-scoped (worker writes own rows;
 * company reads only its own demand), honest in the UI (real flow, gated on
 * the applied table, honest internal-signal copy), and additive at the DB
 * level (migration + 0-row-guarded rollback, grant to authenticated only).
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

const CATALOGUE: Set<string> = new Set(
  Object.keys(
    JSON.parse(
      readFileSync(join(APP_ROOT, "messages", "lt", "skill-names.json"), "utf8"),
    ) as Record<string, string>,
  ),
);

describe("snapshot comes from the canonical pipeline (slugs, never display names)", () => {
  const subject: MatchSubject = {
    skills: [
      { uri: "order-picking", evidence: "work_journal" },
      { uri: "warehouse-operations", evidence: "manager_confirmed" },
    ],
    professionSlug: "warehouse_worker",
    country: "LT",
    availabilityStatus: "available",
  };

  it("matched/missing skills in the snapshot are catalogue slugs", () => {
    const { need, source } = needFromRoleText(
      "warehouse_worker — order picking, pallet handling, stock taking",
      "LT",
    );
    const match = matchWorkerToNeed(need, subject);
    const snap = buildMatchSnapshot(match, source);
    expect(snap.matched_skills.length).toBeGreaterThan(0);
    expect(snap.missing_skills.length).toBeGreaterThan(0);
    for (const slug of [...snap.matched_skills, ...snap.missing_skills]) {
      expect(CATALOGUE.has(slug), `'${slug}' is not a catalogue slug`).toBe(true);
      expect(slug).toMatch(/^[a-z0-9-]+$/); // slug shape — never a display name
    }
    expect(snap.status_band).toBeTruthy();
    expect(snap.evidence_basis.need_total).toBeGreaterThan(0);
    expect(snap.evidence_basis.matched_total).toBe(snap.matched_skills.length);
    expect(snap.need_source).toBe("recognized_from_text");
  });

  it("board and interest share ONE derivation (source pin)", () => {
    const loader = readFileSync(
      join(APP_ROOT, "lib", "opportunities", "load-worker-opportunities.ts"),
      "utf8",
    );
    const interest = readFileSync(
      join(APP_ROOT, "lib", "opportunities", "interest.ts"),
      "utf8",
    );
    for (const src of [loader, interest]) {
      expect(src).toMatch(/needFromRoleText/);
      expect(src).toMatch(/buildOwnWorkerContext/);
    }
    expect(interest).toMatch(/isApprovedRouteRow/); // same visibility gate
    expect(interest).toMatch(/buildMatchSnapshot/);
  });
});

describe("worker-writable statuses are the honest closed set", () => {
  it("worker can set interested/withdrawn only — never reviewed/contacted", () => {
    expect([...WORKER_WRITABLE_INTEREST_STATUSES].sort()).toEqual([
      "interested",
      "withdrawn",
    ]);
    expect(isWorkerWritableInterestStatus("interested")).toBe(true);
    expect(isWorkerWritableInterestStatus("withdrawn")).toBe(true);
    expect(isWorkerWritableInterestStatus("reviewed")).toBe(false);
    expect(isWorkerWritableInterestStatus("contacted")).toBe(false);
    expect(isWorkerWritableInterestStatus("verified")).toBe(false);
  });

  it("notes are trimmed, bounded, and never fabricated", () => {
    expect(cleanInterestNote("  hello  ")).toBe("hello");
    expect(cleanInterestNote("")).toBeNull();
    expect(cleanInterestNote(null)).toBeNull();
    expect(cleanInterestNote(undefined)).toBeNull();
    expect(cleanInterestNote("x".repeat(INTEREST_NOTE_MAX + 100))!.length).toBe(
      INTEREST_NOTE_MAX,
    );
  });
});

describe("no external sending, ever (source scan)", () => {
  const FILES = [
    join(APP_ROOT, "lib", "opportunities", "interest.ts"),
    join(APP_ROOT, "lib", "opportunities", "interest-actions.ts"),
    join(APP_ROOT, "lib", "opportunities", "interest-snapshot.ts"),
    join(APP_ROOT, "components", "app", "worker-interest-button.tsx"),
  ];
  const FORBIDDEN = [
    /\bfetch\s*\(/,
    /mailto:/i,
    /nodemailer|sendgrid|resend|postmark|mailgun/i,
    /twilio|whatsapp|telegram/i,
    /smtp/i,
    /webhook/i,
    /https?:\/\//i,
  ];
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

  it("interest modules contain no outbound primitive", () => {
    for (const f of FILES) {
      const src = stripComments(readFileSync(f, "utf8"));
      for (const re of FORBIDDEN) {
        expect(re.test(src), `${f} matches ${re}`).toBe(false);
      }
    }
  });

  it("the button carries the honest internal-signal copy in all active locales", () => {
    for (const [locale, needle] of [
      ["en", "internal signal"],
      ["lt", "vidinį signalą"],
      ["ru", "внутренний сигнал"],
    ] as const) {
      const j = JSON.parse(
        readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"),
      ) as { opportunities?: { interest?: { internalNote?: string } } };
      expect(
        j.opportunities?.interest?.internalNote ?? "",
        `${locale} internalNote`,
      ).toContain(needle);
    }
  });
});

describe("ownership scoping (source pins — RLS is the runtime authority)", () => {
  it("company read verifies demand ownership before selecting interest", () => {
    const src = readFileSync(join(APP_ROOT, "lib", "opportunities", "interest.ts"), "utf8");
    const fn = src.slice(src.indexOf("listDemandInterestForCompany"));
    expect(fn).toMatch(/customer_requests/);
    expect(fn).toMatch(/profile_id.*user\.id|eq\("profile_id", user\.id\)/);
    expect(fn).toMatch(/not-owner/);
  });

  it("express validates worker-visibility through the board's RPC gate", () => {
    const src = readFileSync(join(APP_ROOT, "lib", "opportunities", "interest.ts"), "utf8");
    expect(src).toMatch(/list_open_demand_for_workers/);
    expect(src).toMatch(/not-visible/);
  });
});

describe("migration is additive, reversible, and default-closed", () => {
  const migration = readFileSync(
    join(REPO_ROOT, "supabase", "migrations", "20260704230000_demand_interest_signals.sql"),
    "utf8",
  );
  const rollback = readFileSync(
    join(REPO_ROOT, "supabase", "rollbacks", "20260704230000_demand_interest_signals.down.sql"),
    "utf8",
  );
  const code = migration
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

  it("creates only the new table (no ALTER/DROP of existing objects)", () => {
    expect(code).toMatch(/create table if not exists public\.demand_interest_signals/);
    expect(code).not.toMatch(/\bdrop\s+(table|policy|function)/i);
    // the only ALTER is enabling RLS on the NEW table itself
    const alters = [...code.matchAll(/alter table\s+([a-z_.]+)/gi)].map((m) => m[1]);
    expect(alters).toEqual(["public.demand_interest_signals"]);
  });

  it("RLS is enabled, default-closed, and the grant is authenticated-only", () => {
    expect(code).toMatch(/enable row level security/);
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(code).not.toMatch(/to\s+anon\b/i);
    expect(code).not.toMatch(/to\s+public\b/i);
    expect(code).toMatch(/grant select, insert, update on public\.demand_interest_signals to authenticated/);
    expect(code).toMatch(/unique \(worker_id, request_id\)/);
    expect(code).not.toMatch(/security definer/i);
  });

  it("rollback exists and is 0-row guarded", () => {
    expect(rollback).toMatch(/refusing to drop/);
    expect(rollback).toMatch(/count\(\*\)\s*from public\.demand_interest_signals/);
  });

  it("carries the human-gate annotation (RED class, owner-gated apply)", () => {
    expect(migration).toMatch(/@human-gate-approved/);
  });
});
