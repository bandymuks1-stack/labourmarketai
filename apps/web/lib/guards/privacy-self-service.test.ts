import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PRIVACY_REQUEST_TYPES,
  isPrivacyRequestType,
} from "@/lib/privacy/privacy-request-model";
import {
  EXPORTED_RELATIONS,
  ROOT_RELATIONS,
  WITHHELD_RELATIONS,
} from "@/lib/privacy/personal-relations";

/**
 * Privacy self-service guard (quality-train PR G).
 *
 * Two honest mechanics, pinned:
 * - the EXPORT is a real RLS-scoped read of the caller's OWN data — no
 *   service role, no other-user tables, nothing destructive;
 * - the DELETION path files a reviewed REQUEST — nothing in the privacy
 *   layer ever deletes, and the intake migration carries the owner's
 *   @human-gate-approved marker with a rollback and no notification
 *   machinery.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const EXPORT_LIB = read("lib/privacy/export-data.ts");
const ACTIONS = read("lib/privacy/actions.ts");
// The RED-class intake migration (SECURITY DEFINER + GRANT) was owner-
// approved 2026-07-06 (@human-gate-approved). Until it exists in the tree
// these migration assertions are pending, and the app degrades honestly (the
// deletion form shows "not accepted yet"; the export needs no migration).
const MIGRATION_REL =
  "../../supabase/migrations/20260706150000_privacy_request_intake.sql";
const hasMigration = existsSync(join(ROOT, MIGRATION_REL));
const MIGRATION = hasMigration ? read(MIGRATION_REL) : "";
const migrationIt = hasMigration ? it : it.skip;

describe("the data export reads ONLY the caller's own data", () => {
  it("every exported table is on the own-data allowlist", () => {
    // The allowlist used to be six table names inlined here, matching six
    // `.from()` calls. PER-12 moved the set to `lib/privacy/personal-relations`
    // because the bundle covered six relations out of sixty and named neither
    // the gap nor most of the omissions. The allowlist is now that register,
    // and its completeness is enforced by
    // `privacy-export-completeness.test.ts`. What THIS guard keeps is the
    // narrower property it always had: the exporter must not read a table
    // off its own bat. Only the two ROOT relations may be named in the file;
    // everything else has to come from the register, where classifying it is
    // mandatory.
    const fromCalls = [...EXPORT_LIB.matchAll(/\.from\("([a-z_]+)"\)/g)].map(
      (m) => m[1],
    );
    expect(fromCalls.sort()).toEqual(ROOT_RELATIONS.slice().sort());
    // And every register entry is joined to the caller by a person column —
    // never by an id the caller could choose. The two chained keys resolve
    // from rows the earlier stages returned AS the caller (their roster
    // links, the evidence records on those links), so they are still the
    // caller's own identity, one hop removed.
    for (const r of EXPORTED_RELATIONS) {
      expect([
        "profile_id",
        "worker_id",
        "organization_person_id",
        "organization_evidence_record_id",
      ]).toContain(r.key);
    }
    expect(EXPORTED_RELATIONS.length).toBeGreaterThan(20);
  });

  it("scoped by the caller's identity, never a service role", () => {
    expect(EXPORT_LIB).toMatch(/eq\("id", user\.id\)/);
    expect(EXPORT_LIB).toMatch(/eq\("profile_id", user\.id\)/);
    expect(EXPORT_LIB).not.toMatch(/service_role|SERVICE_ROLE|createAdminClient/);
  });

  it("read-only: no insert/update/delete anywhere in the privacy layer", () => {
    for (const src of [EXPORT_LIB, ACTIONS]) {
      expect(src).not.toMatch(/\.delete\(|\.update\(|\.insert\(|\.upsert\(/);
    }
  });

  it("the withheld categories are stated inside the bundle itself", () => {
    // Renamed `excluded` -> `withheld` in bundle format v2, and the reasons
    // moved to the register so the SAME text is both the rule and what the
    // person reads. The property is unchanged and stricter: the bundle must
    // carry the reasons, not merely the fact that something was left out.
    expect(EXPORT_LIB).toMatch(/withheld:/);
    expect(EXPORT_LIB).toMatch(/WITHHELD_RELATIONS/);
    const reasons = WITHHELD_RELATIONS.map((w) => w.reason).join(" ");
    expect(reasons).toMatch(/other party's words/);
    for (const w of WITHHELD_RELATIONS) {
      expect(w.reason.length, `${w.table} is withheld without a reason`).toBeGreaterThan(30);
    }
  });

  it("the download route serves an attachment and never caches", () => {
    const route = read("app/[locale]/dashboard/privacy/export/route.ts");
    expect(route).toMatch(/Content-Disposition.*attachment/);
    expect(route).toMatch(/no-store/);
    expect(route).toMatch(/force-dynamic/);
  });
});

describe("deletion is a reviewed REQUEST — never a destructive action", () => {
  it("the action calls the intake RPC and degrades honestly when absent", () => {
    expect(ACTIONS).toMatch(/submit_privacy_request_v1/);
    expect(ACTIONS).toMatch(/needs-migration/);
  });

  it("the request-type set is closed", () => {
    expect([...PRIVACY_REQUEST_TYPES].sort()).toEqual(
      ["account_deletion", "data_export"].sort(),
    );
    for (const t of PRIVACY_REQUEST_TYPES) {
      expect(isPrivacyRequestType(t)).toBe(true);
    }
    expect(isPrivacyRequestType("drop_everything")).toBe(false);
  });

  migrationIt("the RPC's closed type set mirrors the code set", () => {
    for (const t of PRIVACY_REQUEST_TYPES) {
      expect(MIGRATION).toContain(`when '${t}'`);
    }
  });

  migrationIt("the migration is human-gated, non-destructive, notification-free", () => {
    // Owner approved 2026-07-06 — the RED-class human gate must stay
    // explicitly recorded in the migration header.
    expect(MIGRATION).toMatch(/@human-gate-approved/);
    expect(MIGRATION).toMatch(/security definer/i);
    expect(MIGRATION).toMatch(/auth\.uid\(\)/);
    // Scan the executable SQL only — the header comments legitimately SAY
    // "no email, no webhook", which is a promise, not machinery.
    const sql = MIGRATION.split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/\bdrop table|\bdelete from|\btruncate/i);
    expect(sql).not.toMatch(/http|webhook|pg_notify|net\./i);
    // Rollback exists and drops only the new function.
    const down = read(
      "../../supabase/rollbacks/20260706150000_privacy_request_intake.down.sql",
    );
    expect(down).toMatch(/drop function if exists public\.submit_privacy_request_v1/);
  });

  it("the page copy says a person reviews it, in every served locale", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        privacySelfService: {
          deletion: Record<string, string>;
          export: Record<string, string>;
          requests: { type: Record<string, string> };
        };
      };
      const ns = msgs.privacySelfService;
      expect(ns, `${loc}: privacySelfService missing`).toBeTruthy();
      // Human-review honesty is stated, not implied.
      const deletionBlob = JSON.stringify(ns.deletion).toLowerCase();
      expect(deletionBlob).toMatch(/žmogus|person|человек/);
      // No instant-deletion claim anywhere.
      expect(deletionBlob).not.toMatch(
        /ištrinta iš karto|deleted immediately|удалено немедленно/,
      );
      for (const key of ["data_export", "account_deletion"]) {
        expect(ns.requests.type[key], `${loc}: type.${key}`).toBeTruthy();
      }
    }
  });

  it("the privacy page and the account link both exist", () => {
    expect(read("app/[locale]/dashboard/privacy/page.tsx")).toMatch(
      /data-testid="privacy-page"/,
    );
    expect(read("app/[locale]/dashboard/account/page.tsx")).toMatch(
      /account-privacy-self-service-link/,
    );
  });
});

describe("stale 'no export' claims cannot reappear in served catalogs", () => {
  // Real self-service exports shipped (own-data JSON download + journal CSV),
  // so privacy/legal/account copy may no longer claim that no export exists.
  // Deletion honesty is separate (covered above): deletion stays a reviewed
  // REQUEST and copy may truthfully say there is no INSTANT deletion.
  const STALE_NO_EXPORT_CLAIMS: RegExp[] = [
    /no self-service export/i,
    /no data export/i,
    /export unavailable/i,
    /export or deletion button yet/i,
    /savitarnos eksporto/i,
    /eksporto .{0,30}mygtuko dar nėra/i,
    /nėra eksporto/i,
    /кнопки самостоятельного экспорта/i,
    /экспорт недоступен/i,
    /нет экспорта/i,
  ];

  it("lt/en/ru catalogs contain none of the stale claims", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const blob = read(`messages/${loc}.json`);
      for (const pattern of STALE_NO_EXPORT_CLAIMS) {
        expect(
          pattern.test(blob),
          `${loc}.json: stale no-export claim /${pattern.source}/ found — real JSON + journal-CSV exports exist`,
        ).toBe(false);
      }
    }
  });

  it("sanity: the guarded catalogs still exist and parse", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const parsed = JSON.parse(read(`messages/${loc}.json`)) as Record<
        string,
        unknown
      >;
      expect(parsed.legal, `${loc}: legal namespace missing`).toBeTruthy();
    }
  });
});
