import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AGREEMENT_EVENT_TYPES,
  AGREEMENT_SIGNATURE_STATUSES,
  AGREEMENT_STATUSES,
  AGREEMENT_TYPES,
} from "@/lib/agreements/agreements-model";

/**
 * AGREEMENT & RIGHTS ENGINE v1 — repo-structural guard.
 *
 * Pins the TS↔SQL contract of the human-gated migration
 * 20260817200000_agreements_v1.sql and — above everything else — the LEGAL
 * DOCTRINE: LEGAL CONTROL BEFORE TECHNICAL REPRESENTATION. A database
 * status must NEVER imply SIGNED / LEGAL / VALID / BINDING; signature
 * evidence is a separate, explicitly-labeled field pair; the platform
 * executes no legal signatures and integrates no signing provider.
 *
 * Strengthen this guard when the contract changes — never weaken or
 * delete it.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20260817200000_agreements_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260817200000_agreements_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const down = readFileSync(ROLLBACK, "utf8");
const model = readFileSync(
  join(WEB, "lib", "agreements", "agreements-model.ts"),
  "utf8",
);
const actions = readFileSync(
  join(WEB, "lib", "agreements", "agreements-actions.ts"),
  "utf8",
);
const reads = readFileSync(join(WEB, "lib", "agreements", "agreements.ts"), "utf8");
const register = readFileSync(
  join(WEB, "components", "app", "agreements-register.tsx"),
  "utf8",
);

describe("agreements v1 — gated migration artefacts", () => {
  it("migration + paired rollback + gate doc + db proof exist", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(existsSync(ROLLBACK)).toBe(true);
    expect(existsSync(join(REPO, "docs", "human-gates", "agreements-gate.md"))).toBe(
      true,
    );
    expect(existsSync(join(REPO, "scripts", "db-proof", "agreements-v1.sh"))).toBe(
      true,
    );
  });

  it("the marker is present, cites the owner mandate, and the rollback carries none", () => {
    // The SAME regex .github/scripts/migration-safety.mjs uses.
    expect(sql).toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
    expect(sql).toContain("owner mandate 2026-08-17");
    expect(sql).toContain("§4 migration authority");
    expect(down).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });

  it("the DRAFT banner and apply-order dependencies are stated", () => {
    expect(sql).toContain("DRAFT — needs-human-gate");
    expect(sql).toContain("20260817130000_workflow_engine_v1");
    expect(sql).toContain("20260817140000_document_file_layer_v1");
    // Hard dependency assertions really exist in the body.
    expect(sql).toContain("to_regclass('public.org_documents')");
    expect(sql).toContain("to_regclass('public.workflow_instances')");
  });

  it("the APPLIED_LEDGER carries the deferred PENDING-APPLY-BY-LEAD entry", () => {
    const ledger = readFileSync(join(REPO, "docs", "APPLIED_LEDGER.md"), "utf8");
    expect(ledger).toContain("20260817200000_agreements_v1.sql");
    const entry = ledger
      .split("20260817200000_agreements_v1.sql")[1]
      ?.slice(0, 400);
    expect(entry).toContain("PENDING APPLY BY LEAD");
  });
});

describe("agreements v1 — LEGAL DOCTRINE (binding)", () => {
  it("the SQL status vocabulary is exactly the honest record-keeping set", () => {
    for (const status of AGREEMENT_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
    // The status CHECK admits nothing that sounds legal.
    const statusCheck = /status\s+text not null default 'draft' check \(status in \(([\s\S]*?)\)\)/.exec(
      sql,
    );
    expect(statusCheck, "the agreements status CHECK was not found").not.toBeNull();
    const admitted = [...(statusCheck?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(admitted.sort()).toEqual([...AGREEMENT_STATUSES].sort());
    for (const forbidden of ["signed", "executed", "legal", "valid", "binding", "notarized"]) {
      expect(admitted, `status vocabulary must never contain '${forbidden}'`).not.toContain(
        forbidden,
      );
    }
  });

  it("signature evidence is a separate explicit pair, never a legal claim", () => {
    const sigCheck = /signature_status\s+text not null default 'none' check \(signature_status in \(([\s\S]*?)\)\)/.exec(
      sql,
    );
    expect(sigCheck).not.toBeNull();
    const admitted = [...(sigCheck?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(admitted.sort()).toEqual([...AGREEMENT_SIGNATURE_STATUSES].sort());
    // The constraint couples evidence status to a real evidence file.
    expect(sql).toContain("agreements_signature_evidence_shape");
    // The doctrine is stated in the artefact itself (comment prose may wrap
    // across `-- ` lines; normalise before asserting).
    const prose = sql.replace(/\r?\n--\s*/g, " ");
    expect(prose).toContain("does not execute legal signatures");
  });

  it("no signing provider anywhere in the module", () => {
    for (const src of [sql, model, actions, reads, register]) {
      expect(src).not.toMatch(/docusign|hellosign|adobe\s*sign|pandadoc|signwell|dokobit/i);
    }
    // No outbound sending from the agreements layer (the comments may SAY
    // "no webhook"; the code must import/call none).
    for (const src of [actions, reads]) {
      expect(src).not.toMatch(/from ["'](nodemailer|@sendgrid|twilio)/i);
      expect(src).not.toMatch(/fetch\(\s*["']https?:/i);
    }
  });

  it("the UI always renders the no-signature doctrine copy", () => {
    expect(register).toContain('t("noSignatureNote")');
    const en = JSON.parse(
      readFileSync(join(WEB, "messages", "en.json"), "utf8"),
    ) as { agreements: { noSignatureNote: string } };
    expect(en.agreements.noSignatureNote).toContain("outside the platform");
    expect(en.agreements.noSignatureNote).toContain(
      "does not execute legal signatures",
    );
  });
});

describe("agreements v1 — TS↔SQL contract", () => {
  it("agreement types match", () => {
    const typeCheck = /agreement_type\s+text not null check \(agreement_type in \(([\s\S]*?)\)\)/.exec(
      sql,
    );
    expect(typeCheck).not.toBeNull();
    const admitted = [...(typeCheck?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(admitted.sort()).toEqual([...AGREEMENT_TYPES].sort());
  });

  it("event vocabulary matches and both ledgers are append-only", () => {
    for (const eventType of AGREEMENT_EVENT_TYPES) {
      expect(sql).toContain(`'${eventType}'`);
    }
    expect(sql).toContain("agreement_events_append_only");
    expect(sql).toContain("agreement_amendments_append_only");
  });

  it("all eight commands exist in SQL and are the only write paths", () => {
    const rpcs = [
      "create_agreement_v1",
      "update_agreement_v1",
      "set_agreement_status_v1",
      "submit_agreement_for_approval_v1",
      "sync_agreement_approval_v1",
      "add_agreement_amendment_v1",
      "attach_agreement_document_v1",
      "attach_agreement_signature_evidence_v1",
    ];
    for (const rpc of rpcs) {
      expect(sql).toContain(`create or replace function public.${rpc}(`);
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${rpc}\\([^)]*\\) from anon;`),
      );
    }
    // The TS layer calls exactly these commands (sync lives in the read
    // service as read-repair; the other seven in the actions).
    for (const rpc of rpcs.filter((r) => r !== "sync_agreement_approval_v1")) {
      expect(actions).toContain(`"${rpc}"`);
    }
    expect(reads).toContain('"sync_agreement_approval_v1"');
    // Direct writes are revoked; no write policy exists.
    expect(sql).toMatch(/revoke all on public\.agreements,\s*\r?\n\s*public\.agreement_amendments,\s*\r?\n\s*public\.agreement_events\s*\r?\n\s*from authenticated;/);
    expect(sql).not.toMatch(/create policy [a-z_]+ on public\.agreement[a-z_]*\s+for (insert|update|delete)/i);
  });

  it("approval rides the workflow engine — no second approval engine", () => {
    // The submit command verifies a REAL pending instance; the sync command
    // reads the engine's terminal truth. Nothing here decides an approval.
    expect(sql).toContain("context_entity_type = 'agreement'");
    expect(sql).toMatch(/from public\.workflow_instances/);
    // The app layer starts instances through the engine's own command.
    expect(actions).toContain('"start_workflow_instance_v1"');
    // No approval decision command is re-implemented in this module.
    expect(sql).not.toMatch(/create or replace function public\.(approve|decide)_agreement/i);
  });

  it("the legacy contracts register is untouched", () => {
    expect(sql).not.toMatch(/(alter|drop)\s+table\s+(if exists\s+)?public\.contracts\b/i);
    expect(sql).not.toMatch(/create or replace function public\.(create|set|delete)_contract_v1/i);
  });

  it("no notification constraint is touched (no 'agreement' entity type exists)", () => {
    // The header may STATE the decision; the body must not touch the table.
    expect(sql).not.toMatch(/alter table (if exists )?public\.notification_events/i);
    expect(sql).not.toMatch(/insert into public\.notification_events/i);
  });

  it("actions redirect to the EXISTING commercial route", () => {
    expect(actions).toContain("/dashboard/commercial?agr=");
    expect(
      existsSync(
        join(WEB, "app", "[locale]", "dashboard", "commercial", "page.tsx"),
      ),
    ).toBe(true);
  });
});

describe("agreements v1 — i18n completeness", () => {
  it("all 11 catalogs carry the agreements namespace with the same key shape", () => {
    const locales = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];
    const flatten = (obj: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === "object" && v !== null
          ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );
    const shapes = new Map<string, string>();
    for (const locale of locales) {
      const catalog = JSON.parse(
        readFileSync(join(WEB, "messages", `${locale}.json`), "utf8"),
      ) as { agreements?: Record<string, unknown> };
      expect(catalog.agreements, `${locale}.json misses agreements`).toBeDefined();
      shapes.set(locale, flatten(catalog.agreements ?? {}).sort().join("|"));
    }
    const enShape = shapes.get("en");
    for (const [locale, shape] of shapes) {
      expect(shape, `${locale} agreements keys differ from en`).toBe(enShape);
    }
  });
});
