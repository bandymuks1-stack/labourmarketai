import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EMPTY_ORG_REGISTER_FILTERS,
  ORG_DOCUMENT_APPROVAL_STATES,
  ORG_DOCUMENT_COUNTERPARTY_MAX,
  ORG_DOCUMENT_COUNTERPARTY_REF_MAX,
  ORG_DOCUMENT_RETENTION_NOTE_MAX,
  ORG_DOCUMENT_WORKFLOW_CONTEXT,
  ORG_REGISTER_SEARCH_MAX,
  correspondenceDirectionForSlug,
  isCorrespondenceSlug,
  orgRegisterHref,
  parseOrgRegisterFilters,
  retentionState,
  sanitizeRegisterSearch,
} from "@/lib/documents/document-file-model";

/**
 * ORG DOCUMENT REGISTER DELTA v1 guards — the TS↔SQL contract of the
 * human-gated migration 20260817240000, on top of the train C document
 * engine (20260817140000).
 *
 * What these pins keep true:
 *   1. NOTHING DERIVABLE IS STORED TWICE: there is no
 *      `correspondence_direction` column and no `our_reference` column
 *      anywhere — direction comes from the type slug, and the
 *      organization's own reference stays `external_ref`.
 *   2. TRAIN C IS NOT RECREATED: the delta migration never redefines
 *      `create_org_document_v1` or any other train C object; the extended
 *      contract is a NEW `_v2` (rollback-chain rule).
 *   3. THE ENGINE IS CONSUMED, NEVER WIDENED: the approval mirror uses the
 *      existing `generic_request` context; the delta migration creates,
 *      drops and triggers nothing on an engine table, and does not touch
 *      the engine's context vocabulary.
 *   4. NO DESTRUCTIVE RETENTION: retention is a record. No delete/purge/
 *      cron anywhere in the migration or the module.
 *   5. SEARCH IS BOUNDED METADATA ONLY: the query is sanitized before it
 *      reaches PostgREST's `or=` grammar, and it never reads file bytes.
 *   6. HONEST DEGRADATION: with only train C applied the delta controls do
 *      not render, and a supplied delta field is never silently dropped by
 *      the v1 fallback.
 *   7. The migration ships as a gated draft with a paired 0-row-guarded
 *      rollback, a gate doc, a ledger Deferred entry, and i18n in all 11
 *      catalogues.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
const readRepo = (...p: string[]) => readFileSync(join(REPO, ...p), "utf8");

const NAME = "20260817240000_org_document_register_delta_v1";
const MIGRATION = readRepo("supabase", "migrations", `${NAME}.sql`);
const ROLLBACK = readRepo("supabase", "rollbacks", `${NAME}.down.sql`);
const MODEL = read("lib", "documents", "document-file-model.ts");
const READS = read("lib", "documents", "document-files.ts");
const ORG_ACTIONS = read("lib", "documents", "org-document-actions.ts");
const REGISTER = read("components", "app", "org-documents-register.tsx");
const PAGE = read("app", "[locale]", "dashboard", "documents", "page.tsx");
const LEDGER = readRepo("docs", "APPLIED_LEDGER.md");

/** SQL with every `--` comment line AND every `comment on …` statement
 *  removed — the doctrine sections and the column comments deliberately
 *  NAME the columns they refuse to add, so the "no such column" pins must
 *  read the executable statements only. */
function sqlOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .replace(/comment on [\s\S]*?;\s*\n/g, "");
}

const MIGRATION_SQL = sqlOnly(MIGRATION);
const ROLLBACK_SQL = sqlOnly(ROLLBACK);

const CATALOGUE = [
  "en",
  "lt",
  "lv",
  "et",
  "nl",
  "de",
  "da",
  "no",
  "sv",
  "pl",
  "ru",
] as const;

describe("1. nothing derivable is stored twice", () => {
  it("no correspondence_direction column exists anywhere", () => {
    // The migration's prose explains WHY it is absent; no statement creates,
    // selects or writes it.
    expect(MIGRATION).toMatch(/NO `correspondence_direction` column/);
    expect(MIGRATION_SQL).not.toMatch(/correspondence_direction/i);
    expect(ROLLBACK_SQL).not.toMatch(/correspondence_direction/i);
    expect(READS).not.toMatch(/correspondence_direction/i);
  });

  it("no our_reference column exists — external_ref stays the own reference", () => {
    expect(MIGRATION).toMatch(/NO `our_reference` column/);
    expect(MIGRATION_SQL).not.toMatch(/\bour_reference\b/i);
    expect(ROLLBACK_SQL).not.toMatch(/\bour_reference\b/i);
    expect(READS).not.toMatch(/\bour_reference\b/i);
    // The register row labels external_ref as OUR reference.
    expect(REGISTER).toContain("fields.ourRef");
  });

  it("direction is derived from the type slug, in TS and in the RPC", () => {
    expect(correspondenceDirectionForSlug("org_correspondence_incoming")).toBe(
      "incoming",
    );
    expect(correspondenceDirectionForSlug("org_correspondence_outgoing")).toBe(
      "outgoing",
    );
    expect(correspondenceDirectionForSlug("org_policy")).toBeNull();
    expect(isCorrespondenceSlug("org_internal")).toBe(false);
    // The RPC decides the same way, from the same two slugs.
    expect(MIGRATION).toMatch(
      /is_correspondence\s*:=\s*p_document_type_slug in[\s\S]{0,160}org_correspondence_incoming[\s\S]{0,60}org_correspondence_outgoing/,
    );
  });

  it("a correspondence fact on a non-correspondence type is REFUSED, not stored", () => {
    expect(MIGRATION).toMatch(
      /if not is_correspondence[\s\S]{0,220}return 'invalid'/,
    );
    // The action fences the same rule before the RPC is ever called.
    expect(ORG_ACTIONS).toMatch(
      /!isCorrespondenceSlug\(typeSlug\)[\s\S]{0,200}finish\(locale, "invalid"\)/,
    );
  });
});

describe("2. train C is consumed, never recreated", () => {
  it("the delta migration never redefines a train C function", () => {
    for (const fn of [
      "create_org_document_v1",
      "archive_org_document_v1",
      "revoke_org_document_v1",
      "register_document_file_v1",
      "assign_document_acknowledgement_v1",
      "acknowledge_document_v1",
      "record_org_document_download_v1",
      "owns_worker_document_v1",
      "org_owner_admin_v1",
      "manages_org_document_v1",
      "can_read_org_document_v1",
    ]) {
      expect(
        MIGRATION,
        `${fn} must not be recreated by the delta migration`,
      ).not.toMatch(
        new RegExp(`create\\s+(or replace\\s+)?function\\s+public\\.${fn}\\b`, "i"),
      );
    }
  });

  it("the extended contract is a NEW _v2 with same-org object validation", () => {
    expect(MIGRATION).toMatch(
      /create or replace function public\.create_org_document_v2\(/,
    );
    expect(MIGRATION).toMatch(
      /from public\.work_objects o[\s\S]{0,120}o\.organization_id = p_organization_id/,
    );
  });

  it("no train C table, policy or grant is dropped or widened", () => {
    expect(MIGRATION).not.toMatch(/drop\s+table/i);
    expect(MIGRATION).not.toMatch(/drop\s+policy/i);
    expect(MIGRATION).not.toMatch(/create\s+policy/i);
    expect(MIGRATION).not.toMatch(/\bto\s+anon\b/i);
    // The only constraint touched is the event vocabulary, drop + re-add.
    const drops = MIGRATION.match(/drop constraint/gi) ?? [];
    const adds = MIGRATION.match(/add constraint/gi) ?? [];
    expect(drops.length).toBe(1);
    expect(adds.length).toBe(1);
  });

  it("every new function is revoked from public and anon, granted to authenticated", () => {
    for (const fn of [
      "create_org_document_v2",
      "set_org_document_retention_v1",
      "submit_org_document_for_approval_v1",
      "sync_org_document_approval_v1",
    ]) {
      expect(MIGRATION).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public`),
      );
      expect(MIGRATION).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon`),
      );
      expect(MIGRATION).toMatch(
        new RegExp(
          `grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`,
        ),
      );
      // Definer + pinned search_path, the repo-wide rule.
      expect(MIGRATION).toMatch(
        new RegExp(
          `function public\\.${fn}\\([\\s\\S]{0,900}?security definer[\\s\\S]{0,80}?set search_path = public`,
        ),
      );
    }
  });
});

describe("3. the workflow engine is consumed, never widened", () => {
  it("the mirror rides the existing generic_request context", () => {
    expect(ORG_DOCUMENT_WORKFLOW_CONTEXT).toBe("generic_request");
    expect(MIGRATION).toMatch(/context_entity_type = 'generic_request'/);
    expect(READS).toContain("ORG_DOCUMENT_WORKFLOW_CONTEXT");
  });

  it("the engine's context vocabulary is not touched", () => {
    // No attempt to redefine the closed vocabulary, in either direction.
    expect(MIGRATION).not.toMatch(
      /check \(context_entity_type in/i,
    );
    expect(MIGRATION).not.toMatch(/alter table public\.workflow_/i);
    expect(MIGRATION).not.toMatch(/create table[^(]*workflow_/i);
    expect(MIGRATION).not.toMatch(/drop table[^;]*workflow_/i);
    expect(MIGRATION).not.toMatch(/create trigger/i);
    expect(MIGRATION).not.toMatch(
      /create or replace function public\.(start|decide|publish|withdraw|cancel|delegate)_workflow/i,
    );
  });

  it("the mirror flips only against a REAL pending instance", () => {
    expect(MIGRATION).toMatch(
      /if not exists \([\s\S]{0,320}workflow_instances i[\s\S]{0,320}i\.status = 'pending'[\s\S]{0,120}return 'no_pending_workflow'/,
    );
  });

  it("read-repair converges, never decides", () => {
    expect(MIGRATION).toMatch(
      /sync_org_document_approval_v1[\s\S]{0,2400}v_state = 'approved'[\s\S]{0,120}v_target := 'approved'/,
    );
    // Anything that is not 'approved' returns the document, never approves.
    expect(MIGRATION).toMatch(/v_target := 'returned'/);
    // The read layer runs the idempotent repair for submitted rows only.
    expect(READS).toMatch(
      /approvalState === "submitted"[\s\S]{0,400}sync_org_document_approval_v1/,
    );
  });

  it("the app layer starts the instance through the engine's OWN command", () => {
    expect(ORG_ACTIONS).toContain("start_workflow_instance_v1");
    expect(ORG_ACTIONS).toContain("emitWorkflowStepPendingNotifications");
    // …and never writes an engine table directly.
    expect(ORG_ACTIONS).not.toMatch(/from\("workflow_instances"\)/);
  });

  it("with no published definition the approval control does not render", () => {
    expect(READS).toContain("listOrgDocumentApprovalDefinitions");
    expect(REGISTER).toMatch(/approvalDefinitions\.length > 0/);
  });

  it("the approval mirror vocabulary is exactly the migration's CHECK", () => {
    expect([...ORG_DOCUMENT_APPROVAL_STATES]).toEqual([
      "submitted",
      "approved",
      "returned",
    ]);
    expect(MIGRATION).toMatch(
      /approval_state in \('submitted','approved','returned'\)/,
    );
  });
});

describe("4. retention is a record, never a deletion", () => {
  it("no destructive verb anywhere in the migration", () => {
    expect(MIGRATION).not.toMatch(/^\s*delete\s+from/im);
    expect(MIGRATION).not.toMatch(/\btruncate\b/i);
    expect(MIGRATION).not.toMatch(/pg_cron|cron\.schedule/i);
    expect(MIGRATION).not.toMatch(/drop\s+column/i);
  });

  it("the retention writer only stamps the two columns and an event", () => {
    expect(MIGRATION).toMatch(
      /create or replace function public\.set_org_document_retention_v1\(/,
    );
    expect(MIGRATION).toMatch(
      /set retention_until = v_until,[\s\S]{0,120}retention_note {2}= v_note/,
    );
    expect(MIGRATION).toMatch(/'retention_set'/);
  });

  it("the module never deletes a document or a file on a retention date", () => {
    for (const [name, src] of [
      ["reads", READS],
      ["actions", ORG_ACTIONS],
      ["register", REGISTER],
    ] as const) {
      expect(src, `${name} must not delete on retention`).not.toMatch(
        /\.delete\(\)/,
      );
    }
  });

  it("the UI states plainly that nothing is deleted automatically", () => {
    expect(REGISTER).toContain("retention.noDeletionNote");
    const en = JSON.parse(read("messages", "en.json")) as {
      orgDocuments: { retention: { noDeletionNote: string } };
    };
    expect(en.orgDocuments.retention.noDeletionNote.toLowerCase()).toContain(
      "nothing is deleted automatically",
    );
  });

  it("retention state is pure date arithmetic over the recorded value", () => {
    expect(retentionState(null, "2026-08-18")).toBe("none");
    expect(retentionState("2026-12-31", "2026-08-18")).toBe("scheduled");
    expect(retentionState("2026-08-18", "2026-08-18")).toBe("due");
    expect(retentionState("2026-01-01", "2026-08-18")).toBe("due");
  });
});

describe("5. search is bounded metadata only", () => {
  it("the query is sanitized before it reaches the or= grammar", () => {
    expect(sanitizeRegisterSearch("a,b(c).d*e")).toBe("a b c d e");
    expect(sanitizeRegisterSearch("  spaced   out  ")).toBe("spaced out");
    expect(sanitizeRegisterSearch("x".repeat(500)).length).toBe(
      ORG_REGISTER_SEARCH_MAX,
    );
    // Unicode letters survive — this is a European product.
    expect(sanitizeRegisterSearch("Šiaulių raštas")).toBe("Šiaulių raštas");
  });

  it("only register METADATA columns are searched — never file bytes", () => {
    const orBlock = /const cols = delta[\s\S]{0,700}?\];/.exec(READS)?.[0] ?? "";
    expect(orBlock).not.toBe("");
    for (const col of [
      "title",
      "description",
      "external_ref",
      "counterparty_name",
      "counterparty_reference",
    ]) {
      expect(orBlock).toContain(`${col}.ilike.`);
    }
    expect(orBlock).not.toMatch(/storage_path|content_sha256|byte/);
    expect(READS).not.toMatch(/to_tsvector|websearch_to_tsquery/);
  });

  it("the UI says the search does not look inside files", () => {
    expect(REGISTER).toContain("filters.searchScopeNote");
    const en = JSON.parse(read("messages", "en.json")) as {
      orgDocuments: { filters: { searchScopeNote: string } };
    };
    expect(en.orgDocuments.filters.searchScopeNote.toLowerCase()).toContain(
      "does not look inside uploaded files",
    );
  });
});

describe("6. filters are searchParams on the EXISTING surface", () => {
  it("no new route file was added for the register", () => {
    expect(
      existsSync(join(WEB, "app", "[locale]", "dashboard", "documents", "register")),
    ).toBe(false);
    expect(orgRegisterHref({})).toBe("/dashboard/documents#org-register");
  });

  it("every filter axis round-trips through searchParams", () => {
    const parsed = parseOrgRegisterFilters({
      regStatus: "archived",
      regDirection: "incoming",
      regObject: "11111111-2222-4333-8444-555555555555",
      regRetention: "due",
      regQ: "letter, from(x)",
    });
    expect(parsed).toEqual({
      status: "archived",
      direction: "incoming",
      objectId: "11111111-2222-4333-8444-555555555555",
      retention: "due",
      q: "letter from x",
    });
    const href = orgRegisterHref(parsed);
    expect(href).toContain("regStatus=archived");
    expect(href).toContain("regDirection=incoming");
    expect(href).toContain("regRetention=due");
    expect(href).toContain("#org-register");
  });

  it("a junk URL degrades to no filter, never to an error surface", () => {
    expect(
      parseOrgRegisterFilters({
        regStatus: "../etc",
        regDirection: "sideways",
        regObject: "not-a-uuid",
        regRetention: "none",
      }),
    ).toEqual(EMPTY_ORG_REGISTER_FILTERS);
  });

  it("the page passes the parsed filters into the register section", () => {
    expect(PAGE).toContain("parseOrgRegisterFilters");
    expect(PAGE).toMatch(/filters=\{parseOrgRegisterFilters\(sp\)\}/);
  });
});

describe("7. honest degradation while the delta is unapplied", () => {
  it("an unknown COLUMN falls back to the train C read instead of hiding the register", () => {
    expect(READS).toContain('const UNDEFINED_COLUMN_CODE = "42703"');
    expect(READS).toMatch(
      /error\.code === UNDEFINED_COLUMN_CODE[\s\S]{0,260}deltaAvailable = false/,
    );
  });

  it("every delta affordance is gated on deltaAvailable", () => {
    for (const marker of [
      "org-document-correspondence",
      "org-document-object",
      "org-document-retention",
      "org-document-approval",
      "org-documents-create-correspondence",
      "org-documents-create-retention",
    ]) {
      expect(REGISTER, `${marker} must render only with the delta applied`)
        .toContain(marker);
    }
    expect(REGISTER).toMatch(/deltaAvailable && direction/);
    expect(REGISTER).toMatch(/deltaAvailable \? \(/);
  });

  it("the v1 fallback never silently drops a supplied delta field", () => {
    expect(ORG_ACTIONS).toMatch(
      /if \(usesDeltaFields\) finish\(locale, "needs_migration"\)/,
    );
    // …and the fallback is reached only for a genuinely absent function.
    expect(ORG_ACTIONS).toMatch(
      /if \(!isDocumentFileAbsentCode\(v2\.error\.code\)\) \{\s*finish\(locale, noticeForRpcError\(v2\.error\)\);/,
    );
    expect(ORG_ACTIONS).toMatch(
      /isDocumentFileAbsentCode\(v2\.error\.code\)[\s\S]{0,600}create_org_document_v1/,
    );
  });
});

describe("8. gated draft hygiene", () => {
  it("the migration carries the owner-mandate annotation and the gate pointer", () => {
    expect(MIGRATION).toMatch(/^-- DRAFT — needs-human-gate/m);
    expect(MIGRATION).toMatch(/--\s*@human-gate-approved/);
    expect(MIGRATION).toContain("owner mandate\n-- 2026-08-17");
    expect(MIGRATION).toContain(
      "docs/human-gates/org-document-register-delta-gate.md",
    );
    expect(
      existsSync(
        join(REPO, "docs", "human-gates", "org-document-register-delta-gate.md"),
      ),
    ).toBe(true);
  });

  it("hard dependencies are asserted in-file", () => {
    for (const table of [
      "public.org_documents",
      "public.work_objects",
      "public.workflow_instances",
    ]) {
      expect(MIGRATION).toContain(`to_regclass('${table}') is null`);
    }
  });

  it("the paired rollback exists, is 0-row guarded and restores the vocabulary", () => {
    expect(MIGRATION).toMatch(/^-- ROLLBACK/m);
    expect(ROLLBACK).toMatch(/rollback refused/);
    expect(ROLLBACK).toContain("drop function if exists public.create_org_document_v2");
    // Train C's own function is never dropped by this rollback.
    expect(ROLLBACK).not.toMatch(/drop function[^\n]*create_org_document_v1/);
    expect(ROLLBACK).toMatch(
      /add constraint org_document_events_event_type_check[\s\S]{0,200}'downloaded'\)\)/,
    );
  });

  it("the ledger records it as PENDING APPLY BY LEAD", () => {
    expect(LEDGER).toContain(`${NAME}.sql`);
    const line =
      LEDGER.split("\n").find((l) => l.includes(`${NAME}.sql`)) ?? "";
    expect(line).toContain("PENDING APPLY BY LEAD");
    expect(line).toContain("owner mandate 2026-08-17");
  });
});

describe("9. bounds and i18n", () => {
  it("the TS bounds mirror the migration CHECKs exactly", () => {
    expect(ORG_DOCUMENT_COUNTERPARTY_MAX).toBe(200);
    expect(ORG_DOCUMENT_COUNTERPARTY_REF_MAX).toBe(120);
    expect(ORG_DOCUMENT_RETENTION_NOTE_MAX).toBe(500);
    expect(MIGRATION).toMatch(
      /char_length\(counterparty_name\) between 1 and 200/,
    );
    expect(MIGRATION).toMatch(
      /char_length\(counterparty_reference\) between 1 and 120/,
    );
    expect(MIGRATION).toMatch(/char_length\(v_ret_note\) > 500/);
    expect(MODEL).toContain("ORG_DOCUMENT_COUNTERPARTY_MAX = 200");
  });

  it("every new key exists in all 11 catalogues", () => {
    const keys = [
      ["orgDocuments", "filters", "searchScopeNote"],
      ["orgDocuments", "filters", "directionLabel"],
      ["orgDocuments", "filters", "objectLabel"],
      ["orgDocuments", "direction", "incoming"],
      ["orgDocuments", "direction", "outgoing"],
      ["orgDocuments", "fields", "counterparty"],
      ["orgDocuments", "fields", "correspondenceDate"],
      ["orgDocuments", "fields", "counterpartyReference"],
      ["orgDocuments", "fields", "ourRef"],
      ["orgDocuments", "fields", "object"],
      ["orgDocuments", "retention", "noDeletionNote"],
      ["orgDocuments", "retention", "badge", "due"],
      ["orgDocuments", "approval", "approved"],
      ["orgDocuments", "create", "correspondenceHint"],
      ["documentFiles", "notice", "updated"],
      ["documentFiles", "notice", "submitted"],
      ["documentFiles", "notice", "no_pending_workflow"],
      ["documentFiles", "notice", "no_approval_definition"],
    ];
    for (const loc of CATALOGUE) {
      const json = JSON.parse(read("messages", `${loc}.json`)) as Record<
        string,
        unknown
      >;
      for (const path of keys) {
        let cur: unknown = json;
        for (const part of path) {
          cur = (cur as Record<string, unknown> | undefined)?.[part];
        }
        expect(
          typeof cur === "string" && cur.length > 0,
          `${loc}.json is missing ${path.join(".")}`,
        ).toBe(true);
      }
    }
  });

  it("primary locales carry no [EN] marker on the new keys", () => {
    for (const loc of ["en", "lt", "ru", "nl", "de"] as const) {
      const json = JSON.parse(read("messages", `${loc}.json`)) as {
        orgDocuments: { retention: { noDeletionNote: string } };
      };
      expect(json.orgDocuments.retention.noDeletionNote).not.toContain("[EN]");
    }
  });

  it("no approval copy claims legal validity", () => {
    const en = JSON.parse(read("messages", "en.json")) as {
      orgDocuments: { approval: Record<string, string> };
    };
    for (const v of Object.values(en.orgDocuments.approval)) {
      expect(v.toLowerCase()).not.toMatch(/\b(signed|legally|binding|valid)\b/);
    }
  });
});
