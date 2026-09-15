import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
 *       lib/worker/external-profiles* or the section component
 *   (e) DELETED CONSUMERS STAY DELETED (consolidation slice 1, 2026-08-17):
 *       the talent_source_records / identity_resolution_events consumer
 *       modules (lib/talent/*, lib/identity/identity-resolution*) were
 *       removed as dead code — the tables were never applied to production
 *       and the modules had zero importers. See
 *       docs/audits/duplication-freeze-register-2026-08-17.md. Any revival
 *       must be a deliberate owner decision, not a silent re-add.
 *   (f) identity_resolution_events is append-only: no update/delete RPC or
 *       policy in the migration, mutation-blocking trigger present — the
 *       DRAFT migration keeps these invariants even while unapplied.
 *
 * EXTENDED 2026-09-15 (owner approval condition 3, PER-11). The owner approved
 * the SPLIT — 20260914210000_external_profiles_v1.sql — as the canonical
 * minimal implementation, and it is the file that actually SHIPS. Until now
 * every invariant above was pinned only against the rejected 601-line parent,
 * so the moment the split shipped the guarantees would have stopped being
 * enforced against the thing running in production.
 *
 * So §(g) below re-asserts the SAME invariants against the split, and they are
 * deliberately NOT weakened to make it pass: private by default, worker-owned
 * read, no employer read, no automatic fetch/import/scrape, soft disconnect,
 * bounded snapshot/profile inputs. The parent's assertions stay exactly as they
 * were — it remains recorded architecture, and P5/P7 stay deferred rather than
 * quietly declared implemented.
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

/** The APPROVED split — the file that actually ships (PER-11, owner 2026-09-15). */
const SPLIT = join(
  ROOT,
  "supabase",
  "migrations",
  "20260914210000_external_profiles_v1.sql",
);
const SPLIT_ROLLBACK = join(
  ROOT,
  "supabase",
  "rollbacks",
  "20260914210000_external_profiles_v1.down.sql",
);
const splitSql = readFileSync(SPLIT, "utf8");
const splitNoComments = splitSql.replace(/--[^\n]*/g, "");

const CONSUMER_FILES = [
  "lib/worker/external-profiles.ts",
  "lib/worker/external-profiles-model.ts",
  "lib/worker/external-profiles-actions.ts",
  "components/app/external-profiles-section.tsx",
];

/** Deleted 2026-08-17 (consolidation slice 1) — zero importers, backing
 *  tables never applied to prod. Assert they STAY deleted; see header (e). */
const DELETED_CONSUMER_FILES = [
  "lib/talent/provenance.ts",
  "lib/talent/provenance-model.ts",
  "lib/talent/provenance-model.test.ts",
  "lib/talent/provenance-actions.ts",
  "lib/identity/identity-resolution.ts",
  "lib/identity/identity-resolution.test.ts",
  "lib/identity/identity-resolution-service.ts",
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

describe("(e) deleted talent/identity-resolution consumers STAY deleted", () => {
  it.each(DELETED_CONSUMER_FILES)("%s stays deleted (dead code, consolidation slice 1)", (rel) => {
    expect(
      existsSync(join(APP, rel)),
      `${rel} was deleted 2026-08-17 as dead code (zero importers; its backing ` +
        `table was never applied to production — see ` +
        `docs/audits/duplication-freeze-register-2026-08-17.md). Re-adding it ` +
        `requires an explicit owner decision to wire the multi-source talent ` +
        `draft for real, not a silent revival.`,
    ).toBe(false);
  });

  it("no app code imports the deleted modules", () => {
    // A fresh import would fail typecheck too; this pins the intent in the
    // guard suite so the failure names the doctrine, not a resolver error.
    for (const rel of CONSUMER_FILES) {
      const src = read(rel);
      expect(src).not.toMatch(/@\/lib\/talent\/|@\/lib\/identity\/identity-resolution/);
    }
  });

  it("migration STILL enforces the human decider at the table level for merge_confirmed", () => {
    // The unapplied DRAFT keeps its own honesty invariants: if it is ever
    // applied (owner decision), the table refuses a machine-only merge.
    expect(sqlNoComments).toMatch(
      /check\s*\(kind\s*<>\s*'merge_confirmed'\s+or\s+decided_by\s+is\s+not\s+null\)/,
    );
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
    // The TS mirror of this vocabulary (lib/talent/provenance-model.ts) was
    // deleted with the dead consumer family — the SQL vocabulary is now the
    // only place the rule can regress.
    expect(sqlNoComments).not.toMatch(/'scraped'|'scraping'|'crawl/);
  });
});

// ── (g) THE SHIPPING FILE — the same invariants, against the approved split ──
//
// PER-11, owner approval 2026-09-15 condition 3. Everything above pins the
// REJECTED parent. This block pins the file that is actually applied, so the
// privacy guarantees cannot quietly stop being enforced the moment the split
// ships. None of these is a weakened restatement.

describe("(g) the approved split carries the same privacy invariants", () => {
  it("exists, with a paired rollback, and is owner-approved for apply", () => {
    expect(existsSync(SPLIT)).toBe(true);
    expect(existsSync(SPLIT_ROLLBACK)).toBe(true);
    expect(splitSql).toMatch(/^--\s*@human-gate-approved/m);
    // The approval is recorded IN the file, so the annotation can never read
    // as a bare bypass of the static gate.
    expect(splitSql).toMatch(/REVIEWED AND APPROVED BY THE OWNER 2026-09-15/);
  });

  it("(a) visibility still defaults to 'private'", () => {
    expect(splitNoComments).toMatch(
      /visibility\s+text\s+not\s+null\s+default\s+'private'/,
    );
    expect(splitNoComments).toMatch(/check\s*\(visibility\s+in\s*\('private','employers'\)\)/);
  });

  it("(b) read is worker-owned, and no employer path exists", () => {
    const policy =
      splitNoComments
        .split("create policy worker_external_profiles_select")[1]
        ?.split(";")[0] ?? "";
    expect(policy).toMatch(
      /using\s*\(public\.owns_worker\(worker_id\)\s+or\s+public\.is_admin\(\)\)/,
    );
    expect(policy).not.toMatch(/can_view_worker|is_employer|manages_organization|owns_company/);
    // Exactly ONE policy, and it is SELECT: no write policy may appear.
    const policies = splitNoComments.match(/create policy/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(splitNoComments).not.toMatch(/for\s+(insert|update|delete|all)\b/);
  });

  it("(b2) nothing is granted to anon or public; the table gets SELECT only", () => {
    expect(splitNoComments).toMatch(
      /grant select on public\.worker_external_profiles to authenticated/,
    );
    // No write privilege on the table at all — writes are RPC-only.
    expect(splitNoComments).not.toMatch(
      /grant[^;]*\b(insert|update|delete)\b[^;]*on public\.worker_external_profiles/,
    );
    // Every grant in the file goes to `authenticated`, never anon/public.
    for (const g of splitNoComments.match(/grant[^;]+;/g) ?? []) {
      expect(g, `grant must target authenticated only: ${g}`).toMatch(/to authenticated/);
      expect(g).not.toMatch(/\bto\s+(anon|public)\b/);
    }
    // Both definer functions are revoked from public AND anon before granting.
    for (const fn of [
      "save_worker_external_profile_v1",
      "disconnect_external_profile_v1",
    ]) {
      expect(splitNoComments).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public`),
      );
      expect(splitNoComments).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon`),
      );
    }
  });

  it("(c) disconnect is SOFT — no hard delete of provenance anywhere", () => {
    expect(splitNoComments).toMatch(/set disconnected_at = coalesce\(ep\.disconnected_at, now\(\)\)/);
    // Disconnecting also forces the row private — a disconnected link can
    // never remain marked shareable.
    expect(splitNoComments).toMatch(/visibility\s*=\s*'private'/);
    // No DELETE statement against the table in the migration at all.
    expect(splitNoComments).not.toMatch(/delete\s+from\s+public\.worker_external_profiles/);
  });

  it("(d) NO automatic fetch/import/scrape — in the migration or any consumer", () => {
    expect(splitNoComments).not.toMatch(/pg_net|dblink|\bhttp_(get|post)\b|create extension/i);
    for (const f of CONSUMER_FILES) {
      const src = read(f);
      expect(
        src,
        `${f} must not fetch an external host — profile data is supplied by the worker`,
      ).not.toMatch(/\bfetch\s*\(|axios|puppeteer|playwright|cheerio|\bscrape|\bcrawl/i);
    }
  });

  it("(e) bounded inputs — a snapshot can never become an unbounded shadow profile", () => {
    // Column-level bounds.
    expect(splitNoComments).toMatch(/pg_column_size\(imported_snapshot\)\s*<=\s*65536/);
    expect(splitNoComments).toMatch(/char_length\(url\) between 12 and 500/);
    expect(splitNoComments).toMatch(/url like 'https:\/\/%'/);
    // Closed platform set, not an open string.
    expect(splitNoComments).toMatch(
      /platform in\s*\(\s*'linkedin','github','behance','portfolio',\s*'certification_registry','other'\s*\)/,
    );
    // Function-level bounds, so the cap holds on the write path too.
    expect(splitNoComments).toMatch(/Snapshot too large/);
    expect(splitNoComments).toMatch(/v_count >= 20/);
  });

  it("(f) the excluded P5/P7 world is absent from the shipping file", () => {
    // Applying the split must create NOTHING from the rejected remainder.
    for (const banned of [
      "talent_source_records",
      "identity_resolution_events",
      "record_talent_source_v1",
      "record_identity_resolution_event_v1",
      "set_external_profile_visibility_v1",
      "review_external_profile_snapshot_v1",
    ]) {
      expect(
        splitNoComments,
        `${banned} must not appear in the executable SQL of the split`,
      ).not.toContain(banned);
    }
  });

  it("the rollback drops exactly what the split creates — and nothing more", () => {
    const down = readFileSync(SPLIT_ROLLBACK, "utf8").replace(/--[^\n]*/g, "");
    expect(down).toMatch(/drop table if exists public\.worker_external_profiles/);
    expect(down).toMatch(/drop function if exists public\.save_worker_external_profile_v1/);
    expect(down).toMatch(/drop function if exists public\.disconnect_external_profile_v1/);
    // It must NOT drop the parent's other tables — they were never created here.
    expect(down).not.toMatch(/drop table if exists public\.talent_source_records/);
    expect(down).not.toMatch(/drop table if exists public\.identity_resolution_events/);
  });
});

// ── (h) the personal data is visible to the privacy surfaces ────────────────
//
// Owner approval conditions 1 and 2. A subject-access export that silently
// omits a personal-data table, or a deletion preview that under-counts what a
// deletion removes, is the same class of defect as an unreachable capability:
// the data exists and the truth surface does not say so.

describe("(h) external profiles are accounted for by the privacy surfaces", () => {
  it("the subject-access export reads and returns the relation", () => {
    const exportData = read("lib/privacy/export-data.ts");
    expect(exportData).toMatch(/\.from\("worker_external_profiles"\)/);
    expect(exportData).toMatch(/worker_external_profiles: workerExternalProfiles/);
    // An unreadable relation is reported as UNAVAILABLE, never as an empty
    // list — "we hold none" and "we could not read it" are different claims.
    expect(exportData).toMatch(/unavailable\.push\("worker_external_profiles"\)/);
  });

  it("the deletion plan counts the class and plans to delete it", () => {
    const plan = read("lib/privacy/deletion-plan.ts");
    expect(plan).toMatch(/"externalProfiles",/);
    expect(plan).toMatch(/headCount\(supabase, "worker_external_profiles", byWorker\("worker_id"\)\)/);
    expect(plan).toMatch(
      /dataClass: "externalProfiles", rowCount: externalProfiles, plannedAction: "delete"/,
    );
  });

  it("the FK cascade stays the actual deletion mechanism", () => {
    // The owner's condition: preserve the existing cascade unless evidence
    // shows it insufficient. The preview reports; the cascade deletes.
    expect(splitNoComments).toMatch(
      /worker_id\s+uuid not null references public\.workers\(id\) on delete cascade/,
    );
  });
});
