import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AUTO_MERGE_ENABLED,
  buildMergeConfirmedEvent,
  canAutoMerge,
  detectPotentialDuplicates,
  type DuplicateCandidate,
} from "@/lib/identity/identity-resolution";

/**
 * Multi-source talent v1 — consent / honesty guard (Labour Market OS P5–P7).
 *
 * Pins the invariants of DRAFT migration
 * supabase/migrations/20260713210000_multi_source_talent_v1.sql and its
 * consumer modules:
 *   (a) external-profile visibility defaults to 'private' (migration + model)
 *   (b) NO employer read path exists in v1 (services + RLS policy)
 *   (c) disconnect never hard-deletes (no delete path on the table anywhere)
 *   (d) NO automatic import — no fetch of external profile hosts anywhere in
 *       lib/worker/external-profiles*, lib/talent, or the section component
 *   (e) identity module: AUTO_MERGE_ENABLED is literally false; no merge
 *       event without a human decider; weak hints are structurally excluded
 *       from auto-merge
 *   (f) identity_resolution_events is append-only: no update/delete RPC or
 *       policy in the migration, mutation-blocking trigger present
 */

const APP = join(__dirname, "..", "..");
const ROOT = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const MIGRATION = join(
  ROOT,
  "supabase",
  "migrations",
  "20260713210000_multi_source_talent_v1.sql",
);
const ROLLBACK = join(
  ROOT,
  "supabase",
  "rollbacks",
  "20260713210000_multi_source_talent_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const sqlNoComments = sql.replace(/--[^\n]*/g, "");

const CONSUMER_FILES = [
  "lib/worker/external-profiles.ts",
  "lib/worker/external-profiles-model.ts",
  "lib/worker/external-profiles-actions.ts",
  "lib/talent/provenance.ts",
  "lib/talent/provenance-model.ts",
  "lib/talent/provenance-actions.ts",
  "lib/identity/identity-resolution.ts",
  "lib/identity/identity-resolution-service.ts",
  "components/app/external-profiles-section.tsx",
];

describe("migration + rollback files", () => {
  it("migration and paired rollback exist and are human-gated drafts", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(existsSync(ROLLBACK)).toBe(true);
    expect(sql).toMatch(/^--\s*@human-gate-approved/m);
    expect(sql).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
    const down = readFileSync(ROLLBACK, "utf8");
    expect(down).toMatch(/drop table if exists public\.worker_external_profiles/);
    expect(down).toMatch(/drop table if exists public\.talent_source_records/);
    expect(down).toMatch(/drop table if exists public\.identity_resolution_events/);
  });

  it("is listed under Deferred (NOT applied) in APPLIED_LEDGER.md", () => {
    const ledger = readFileSync(join(ROOT, "docs", "APPLIED_LEDGER.md"), "utf8");
    const deferred = ledger.split("## Deferred")[1] ?? "";
    expect(deferred).toMatch(/20260713210000_multi_source_talent_v1\.sql/);
  });
});

describe("(a) visibility defaults to 'private'", () => {
  it("migration column default is 'private'", () => {
    expect(sqlNoComments).toMatch(
      /visibility\s+text\s+not\s+null\s+default\s+'private'/,
    );
  });

  it("model pins DEFAULT_EXTERNAL_PROFILE_VISIBILITY to 'private'", () => {
    const model = read("lib/worker/external-profiles-model.ts");
    expect(model).toMatch(
      /DEFAULT_EXTERNAL_PROFILE_VISIBILITY:\s*ExternalProfileVisibility\s*=\s*\n?\s*"private"/,
    );
  });
});

describe("(b) no employer read path in v1", () => {
  it("worker_external_profiles SELECT policy is owner-or-admin ONLY (no can_view_worker, no employer clause)", () => {
    const policy =
      sqlNoComments
        .split("create policy worker_external_profiles_select")[1]
        ?.split(";")[0] ?? "";
    expect(policy).toMatch(
      /using\s*\(public\.owns_worker\(worker_id\)\s+or\s+public\.is_admin\(\)\)/,
    );
    expect(policy).not.toMatch(/can_view_worker|is_employer/);
  });

  it("no consumer module reads external profiles through an employer-visibility helper", () => {
    for (const f of [
      "lib/worker/external-profiles.ts",
      "lib/worker/external-profiles-model.ts",
      "lib/worker/external-profiles-actions.ts",
    ]) {
      const src = read(f);
      expect(src, `${f} must not wire an employer read path in v1`).not.toMatch(
        /can_view_worker|listEmployerExternalProfiles|forEmployer/,
      );
    }
  });

  it("the UI carries the honest 'employer viewing not switched on yet' note", () => {
    const section = read("components/app/external-profiles-section.tsx");
    expect(section).toMatch(/visibilityNote/);
    expect(section).toMatch(/external-profiles-visibility-note/);
  });
});

describe("(c) disconnect never hard-deletes", () => {
  it("no consumer file calls .delete() on worker_external_profiles", () => {
    for (const f of CONSUMER_FILES) {
      const src = read(f);
      expect(src, `${f} must not delete external profile rows`).not.toMatch(
        /worker_external_profiles["'`][\s\S]{0,200}?\.delete\(/,
      );
      expect(src, `${f} must not delete external profile rows`).not.toMatch(
        /\.delete\(\)/,
      );
    }
  });

  it("migration has no DELETE path on worker_external_profiles (soft disconnect only)", () => {
    expect(sqlNoComments).not.toMatch(
      /delete\s+from\s+public\.worker_external_profiles/i,
    );
    // disconnect RPC stamps disconnected_at instead.
    const rpc =
      sqlNoComments.split("function public.disconnect_external_profile_v1")[1] ?? "";
    expect(rpc).toMatch(/set\s+disconnected_at\s*=\s*coalesce/);
  });
});

describe("(d) no automatic import — nothing fetches external profile hosts", () => {
  it("no fetch()/axios/http client in the external-profile and talent modules", () => {
    for (const f of CONSUMER_FILES) {
      const src = read(f);
      expect(src, `${f} must never fetch external content`).not.toMatch(
        /\bfetch\s*\(|axios|XMLHttpRequest|new\s+Request\(|https?\.request/,
      );
    }
  });

  it("the section offers no automatic-import control — only the honest note + CV upload link", () => {
    const section = read("components/app/external-profiles-section.tsx");
    expect(section).toMatch(/external-profiles-import-note/);
    expect(section).toMatch(/#profile-edit/);
    expect(section).not.toMatch(/importNow|startImport|autoImport/i);
  });
});

describe("(e) identity resolution — human confirms every merge", () => {
  it("AUTO_MERGE_ENABLED is the literal false (source-pinned + runtime)", () => {
    const src = read("lib/identity/identity-resolution.ts");
    expect(src).toMatch(/export const AUTO_MERGE_ENABLED = false/);
    expect(AUTO_MERGE_ENABLED).toBe(false);
  });

  it("canAutoMerge is false even for a strong deterministic match with legal basis (v1 policy)", () => {
    const strong: DuplicateCandidate = {
      primaryProfileId: "a",
      duplicateProfileId: "b",
      matchKind: "strong_deterministic_id",
      maskedHint: "same email (domain example.com) and same phone",
    };
    expect(canAutoMerge(strong, "GDPR Art. 6(1)(f) — duplicate hygiene")).toBe(false);
  });

  it("canAutoMerge's parameter type structurally excludes WeakHint (name similarity can never merge)", () => {
    const src = read("lib/identity/identity-resolution.ts");
    const fn = src.split("export function canAutoMerge")[1]?.split("{")[0] ?? "";
    expect(fn).toMatch(/match:\s*DuplicateCandidate/);
    expect(fn).not.toMatch(/WeakHint/);
    // And detection itself never emits a weak-similarity kind.
    const dupes = detectPotentialDuplicates([
      { profileId: "p1", fullName: "Jonas Jonaitis", email: "a@x.com" },
      { profileId: "p2", fullName: "Jonas Jonaitis", email: "b@y.com" },
    ]);
    expect(dupes).toEqual([]);
  });

  it("a merge_confirmed event cannot be built without a human decider", () => {
    const match: DuplicateCandidate = {
      primaryProfileId: "a",
      duplicateProfileId: "b",
      matchKind: "email_exact",
      maskedHint: "same email (domain example.com)",
    };
    const noDecider = buildMergeConfirmedEvent({
      match,
      decidedByProfileId: null,
      legalBasis: "basis",
    });
    expect(noDecider).toEqual({ ok: false, reason: "missing_human_decider" });
  });

  it("migration enforces the human decider at the table level for merge_confirmed", () => {
    expect(sqlNoComments).toMatch(
      /check\s*\(kind\s*<>\s*'merge_confirmed'\s+or\s+decided_by\s+is\s+not\s+null\)/,
    );
  });

  it("duplicate candidate summaries carry NO contact fields", () => {
    const dupes = detectPotentialDuplicates([
      { profileId: "p1", email: "same@x.com", phone: "+37060000001" },
      { profileId: "p2", email: "same@x.com", phone: "+37060000002" },
    ]);
    expect(dupes).toHaveLength(1);
    const keys = Object.keys(dupes[0]).sort();
    expect(keys).toEqual([
      "duplicateProfileId",
      "maskedHint",
      "matchKind",
      "primaryProfileId",
    ]);
    // Masked hint shows the domain only — never the address itself.
    expect(dupes[0].maskedHint).not.toContain("same@x.com");
  });
});

describe("(f) identity_resolution_events is append-only", () => {
  it("no UPDATE/DELETE statement or RPC touches identity_resolution_events", () => {
    expect(sqlNoComments).not.toMatch(
      /update\s+public\.identity_resolution_events/i,
    );
    expect(sqlNoComments).not.toMatch(
      /delete\s+from\s+public\.identity_resolution_events/i,
    );
  });

  it("no write policy exists on identity_resolution_events (SELECT admin-only is the only policy)", () => {
    // Inspect each policy HEAD (name + ON clause), not the unrelated SQL
    // that follows it in the same split segment.
    const policies = sqlNoComments
      .split(/create policy/)
      .slice(1)
      .filter((p) =>
        p.slice(0, 200).includes("on public.identity_resolution_events"),
      );
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatch(/for select/);
    expect(policies[0]).toMatch(/public\.is_admin\(\)/);
  });

  it("a trigger blocks UPDATE and DELETE for every role (defense-in-depth)", () => {
    expect(sqlNoComments).toMatch(
      /create trigger trg_identity_resolution_events_immutable\s*\n?\s*before update or delete on public\.identity_resolution_events/,
    );
  });

  it("the record RPC is the only insert path and re-checks is_admin server-side", () => {
    const rpc =
      sqlNoComments.split(
        "function public.record_identity_resolution_event_v1",
      )[1] ?? "";
    expect(rpc).toMatch(/if not public\.is_admin\(\) then/);
    expect(rpc).toMatch(/insert into public\.identity_resolution_events/);
  });
});

describe("provenance ledger boundaries (P5)", () => {
  it("record_talent_source_v1 refuses writing provenance about another person unless admin", () => {
    const rpc =
      sqlNoComments.split("function public.record_talent_source_v1")[1] ?? "";
    expect(rpc).toMatch(/if v_subject <> uid and not public\.is_admin\(\)/);
  });

  it("talent_source_records SELECT is subject-or-admin only", () => {
    const policy =
      sqlNoComments
        .split("create policy talent_source_records_select")[1]
        ?.split(";")[0] ?? "";
    expect(policy).toMatch(
      /using\s*\(subject_profile_id\s*=\s*auth\.uid\(\)\s+or\s+public\.is_admin\(\)\)/,
    );
  });

  it("the source-type vocabulary has no scraping source (and never may)", () => {
    expect(sqlNoComments).not.toMatch(/'scraped'|'scraping'|'crawl/);
    const model = read("lib/talent/provenance-model.ts");
    const list = model.split("TALENT_SOURCE_TYPES = [")[1]?.split("]")[0] ?? "";
    expect(list).not.toMatch(/scrap|crawl/i);
  });
});
