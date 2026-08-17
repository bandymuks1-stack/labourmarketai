import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DOCUMENT & EVIDENCE ENGINE v1 guards — the TS↔SQL contract of the
 * human-gated migration pair (20260817120000 + 20260817121000).
 *
 * What these pins keep true:
 *   1. ONE contract: the MIME allowlist, the 5 MB cap, the version bound
 *      and the canonical path prefixes exist IDENTICALLY in the migration
 *      and in the TS model — neither side can drift alone.
 *   2. Ack doctrine: acknowledgements FK the FILE VERSION (never the
 *      register row), are fill-once, self-only (no delegation), and a new
 *      version never inherits them.
 *   3. Storage safety: the bucket is PRIVATE, read delegates to the
 *      document_files RLS truth, insert/delete are prefix-scoped, delete
 *      admits only UNREGISTERED orphans, and nothing is granted to anon.
 *   4. Honest degradation: the worker page renders upload controls ONLY
 *      when the file layer really answered, and keeps the truthful
 *      "not available yet" note otherwise — the note was made conditional,
 *      never deleted.
 *   5. The migrations ship as gated drafts with paired rollbacks, ledger
 *      Deferred entries, and the owner-mandate annotation.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
const readRepo = (...p: string[]) => readFileSync(join(REPO, ...p), "utf8");

const MIGRATION = readRepo(
  "supabase",
  "migrations",
  "20260817120000_document_file_layer_v1.sql",
);
const NOTIF_MIGRATION = readRepo(
  "supabase",
  "migrations",
  "20260817121000_notification_document_types_v3.sql",
);
const MODEL = read("lib", "documents", "document-file-model.ts");
const READS = read("lib", "documents", "document-files.ts");
const FILE_ACTIONS = read("lib", "documents", "document-file-actions.ts");
const ORG_ACTIONS = read("lib", "documents", "org-document-actions.ts");
const ROUTE = read("app", "api", "documents", "file", "[fileId]", "route.ts");
const PAGE = read("app", "[locale]", "dashboard", "documents", "page.tsx");
const EVENTS = read("lib", "notifications", "events.ts");
const EMITTERS = read("lib", "notifications", "event-emitters.ts");

const CATALOGUE = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"] as const;

describe("1. one TS↔SQL contract", () => {
  it("the five MIME types and the 5 MB cap are identical in migration, bucket and model", () => {
    for (const mime of [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]) {
      expect(MIGRATION).toContain(mime);
      expect(MODEL).toContain(mime);
    }
    // Cap appears in the column CHECK, the RPC guard and the bucket limit.
    expect(MIGRATION.match(/5242880/g)!.length).toBeGreaterThanOrEqual(3);
    expect(MODEL).toContain("5 * 1024 * 1024");
  });

  it("version bound 1..50 exists on both sides", () => {
    expect(MIGRATION).toMatch(/version between 1 and 50/);
    expect(MIGRATION).toMatch(/next_version > 50/);
    expect(MODEL).toContain("DOCUMENT_FILE_MAX_VERSIONS = 50");
  });

  it("the canonical path prefixes are pinned in the RPC, the policies and the TS builders", () => {
    expect(MIGRATION).toMatch(/'worker\/' \|\| v_worker_id::text \|\| '\/doc\/'/);
    expect(MIGRATION).toMatch(/'org\/' \|\| od\.organization_id::text \|\| '\/doc\/'/);
    expect(MIGRATION).toMatch(/position\(expected_prefix in cleaned_path\) <> 1/);
    expect(MODEL).toMatch(/worker\/\$\{workerId\}\/doc\/\$\{workerDocumentId\}\/v\$\{version\}/);
    expect(MODEL).toMatch(/org\/\$\{organizationId\}\/doc\/\$\{orgDocumentId\}\/v\$\{version\}/);
  });

  it("exactly-one-parent and one-current-version are DB constraints, not conventions", () => {
    expect(MIGRATION).toMatch(/document_files_exactly_one_parent/);
    expect(MIGRATION).toMatch(/document_files_worker_current_idx/);
    expect(MIGRATION).toMatch(/document_files_org_current_idx/);
    expect(MIGRATION).toMatch(/where worker_document_id is not null and superseded_at is null/);
  });
});

describe("2. acknowledgement doctrine — version-bound, fill-once, self-only", () => {
  it("the ack FK points at document_files (the VERSION), never at the register row", () => {
    expect(MIGRATION).toMatch(
      /document_file_id\s+uuid not null references public\.document_files\(id\)/,
    );
  });

  it("fill-once + no delegation are constraints AND RPC guards", () => {
    expect(MIGRATION).toMatch(/document_acknowledgements_self_only/);
    expect(MIGRATION).toMatch(/acknowledged_by = assignee_profile_id/);
    expect(MIGRATION).toMatch(/document_acknowledgements_once/);
    expect(MIGRATION).toMatch(/unique \(document_file_id, assignee_profile_id\)/);
    expect(MIGRATION).toMatch(/return 'already_acknowledged'/);
  });

  it("a superseded version gathers no NEW assignments, and acks never carry over", () => {
    expect(MIGRATION).toMatch(/return 'not_current'/);
    // Registering a new version supersedes the previous current row and
    // touches NO acknowledgement row — there is no ack write anywhere in
    // register_document_file_v1.
    const register = MIGRATION.slice(
      MIGRATION.indexOf("create or replace function public.register_document_file_v1"),
      MIGRATION.indexOf("9.5 Assign"),
    );
    expect(register).toMatch(/set superseded_at = now\(\)/);
    expect(register).not.toMatch(/document_acknowledgements/);
  });

  it("acknowledge stamps server time and the assignee, only for the assignee", () => {
    const ack = MIGRATION.slice(
      MIGRATION.indexOf("create or replace function public.acknowledge_document_v1"),
      MIGRATION.indexOf("9.7 Record"),
    );
    expect(ack).toMatch(/ack\.assignee_profile_id <> uid/);
    expect(ack).toMatch(/set acknowledged_at = now\(\), acknowledged_by = uid/);
  });
});

describe("3. storage safety — private bucket, truth-delegating policies", () => {
  it("the bucket is PRIVATE and never granted to anon", () => {
    expect(MIGRATION).toMatch(
      /values \('document-files', 'document-files', false\)/,
    );
    expect(MIGRATION).not.toMatch(/to anon/);
    expect(MIGRATION).not.toMatch(/grant .* to public;/);
  });

  it("storage READ delegates to the document_files row truth (no path-only trust)", () => {
    const readPolicy = MIGRATION.slice(
      MIGRATION.indexOf(`"document-files entity read"`),
      MIGRATION.indexOf(`"document-files admin read"`),
    );
    expect(readPolicy).toMatch(/df\.storage_path = storage\.objects\.name/);
    expect(readPolicy).toMatch(/owns_worker_document_v1/);
    expect(readPolicy).toMatch(/can_read_org_document_v1/);
  });

  it("storage DELETE admits only UNREGISTERED orphans", () => {
    const delPolicy = MIGRATION.slice(
      MIGRATION.indexOf(`"document-files orphan delete"`),
    );
    expect(delPolicy).toMatch(/not exists \(\s*select 1 from public\.document_files df/);
  });

  it("every new table is SELECT-only for authenticated; writes are RPC-only", () => {
    for (const table of [
      "org_documents",
      "org_document_events",
      "document_files",
      "document_acknowledgements",
    ]) {
      expect(MIGRATION).toContain(`grant select on public.${table} to authenticated;`);
      expect(MIGRATION).toContain(
        `revoke insert, update, delete on public.${table} from authenticated;`,
      );
    }
  });

  it("every function revokes public AND anon, then grants authenticated only", () => {
    const fnNames = [...MIGRATION.matchAll(/create or replace function public\.([a-z0-9_]+)\(/g)].map(
      (m) => m[1],
    );
    expect(fnNames.length).toBeGreaterThanOrEqual(11);
    for (const fn of fnNames) {
      expect(MIGRATION, fn).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public;`),
      );
      expect(MIGRATION, fn).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon;`),
      );
      expect(MIGRATION, fn).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`),
      );
    }
  });

  it("all SECURITY DEFINER functions pin search_path", () => {
    const defs = MIGRATION.match(/security definer/g) ?? [];
    const pins = MIGRATION.match(/set search_path = public/g) ?? [];
    expect(pins.length).toBeGreaterThanOrEqual(defs.length);
  });
});

describe("4. honest degradation — the note became CONDITIONAL, not deleted", () => {
  it("upload controls render ONLY when the file layer really answered", () => {
    expect(PAGE).toMatch(/fileState\.available \? \(\s*<WorkerDocumentFileSlot/);
  });

  it("the truthful no-upload note renders ONLY while the layer is absent", () => {
    expect(PAGE).toMatch(/\{!fileState\.available \? \(/);
    expect(PAGE).toMatch(/doc-centre-upload-note/);
    expect(PAGE).toMatch(/tc\("uploadNote"\)/);
  });

  it("the read layer answers available:false on the absent-store codes", () => {
    expect(READS).toMatch(/return \{ available: false \}/);
    expect(READS).toMatch(/isDocumentFileAbsentCode/);
    expect(MODEL).toMatch(/"42P01",\s*\n\s*"42703",\s*\n\s*"42883",\s*\n\s*"PGRST202",\s*\n\s*"PGRST205",/);
  });

  it("the actions redirect with honest notices and never fake a save", () => {
    for (const src of [FILE_ACTIONS, ORG_ACTIONS]) {
      expect(src).toMatch(/needs_migration/);
      expect(src).toMatch(/docNotice=\$\{notice\}/);
    }
  });
});

describe("5. upload path — user-scoped client, orphan cleanup, no admin writes", () => {
  it("uploads use the caller's own client; the admin client appears nowhere in the document layer", () => {
    for (const src of [READS, FILE_ACTIONS, ORG_ACTIONS, ROUTE]) {
      expect(src).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    }
  });

  it("a failed registration removes the orphan blob", () => {
    expect(FILE_ACTIONS).toMatch(
      /supabase\.storage\.from\(DOCUMENT_FILES_BUCKET\)\.remove\(\[path\]\)/,
    );
  });

  it("size is measured on the REAL bytes and the sha256 is computed server-side", () => {
    expect(FILE_ACTIONS).toMatch(/bytes\.byteLength > DOCUMENT_FILE_MAX_BYTES/);
    expect(FILE_ACTIONS).toMatch(/createHash\("sha256"\)\.update\(bytes\)/);
  });

  it("the org action resolves the organization SERVER-SIDE (never from the form)", () => {
    expect(FILE_ACTIONS).toMatch(/requireEmployerCompany/);
    expect(ORG_ACTIONS).toMatch(/requireEmployerCompany/);
    expect(ORG_ACTIONS).not.toMatch(/formData\.get\("organizationId"\)/);
    expect(FILE_ACTIONS).not.toMatch(/formData\.get\("organizationId"\)/);
  });

  it("no external transport anywhere in the engine", () => {
    for (const src of [READS, FILE_ACTIONS, ORG_ACTIONS, ROUTE]) {
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid|telegram)/i,
      );
    }
  });
});

describe("6. download route — RLS truth, short TTL, classified logging", () => {
  it("the row is read under the caller's RLS with one 404 for missing and foreign", () => {
    expect(ROUTE).toMatch(/from\("document_files"\)/);
    expect(ROUTE).toMatch(/status: 404/);
  });

  it("classified org downloads are RECORDED before the URL exists, and denial denies", () => {
    const recIdx = ROUTE.indexOf("record_org_document_download_v1");
    const signIdx = ROUTE.indexOf("createSignedUrl");
    expect(recIdx).toBeGreaterThan(-1);
    expect(signIdx).toBeGreaterThan(recIdx);
    expect(ROUTE).toMatch(/status: 403/);
  });

  it("signed URLs are short-lived (≤ 300 s)", () => {
    expect(MODEL).toMatch(/DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS = 60/);
    expect(ROUTE).toMatch(/DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS/);
  });
});

describe("7. notifications v3 — admitted types, emitters, labels everywhere", () => {
  it("the TS unions and the migration admit the SAME three new types", () => {
    for (const t of [
      "document_ack_assigned",
      "document_ack_completed",
      "document_expiring",
    ]) {
      expect(EVENTS).toContain(`"${t}"`);
      expect(NOTIF_MIGRATION).toContain(`'${t}'`);
    }
    for (const e of ["worker_document", "org_document", "document_acknowledgement"]) {
      expect(EVENTS).toContain(`"${e}"`);
      expect(NOTIF_MIGRATION).toContain(`'${e}'`);
    }
  });

  it("assign emits to the ASSIGNEE, acknowledge emits to the ASSIGNER (not self)", () => {
    expect(ORG_ACTIONS).toMatch(/emitDocumentAckNotification\(ackId, "document_ack_assigned"\)/);
    expect(FILE_ACTIONS).toMatch(/emitDocumentAckNotification\(ackId, "document_ack_completed"\)/);
    const emitter = EMITTERS.slice(
      EMITTERS.indexOf("export async function emitDocumentAckNotification"),
    );
    expect(emitter).toMatch(/row\.assigned_by !== row\.assignee_profile_id/);
  });

  it("expiry emitters derive the SAME 30-day window the page shows and are fire-and-forget", () => {
    expect(EMITTERS).toMatch(/DOCUMENT_EXPIRING_WINDOW_DAYS/);
    expect(READS).toMatch(/emitWorkerDocumentExpiringNotifications\(workerId\)/);
    expect(READS).toMatch(/emitOrgDocumentExpiringNotifications\(organizationId\)/);
  });

  for (const l of CATALOGUE) {
    it(`${l} carries labels for all three new event types`, () => {
      const m = JSON.parse(read("messages", `${l}.json`));
      const types = m.auth.notifications.types;
      for (const key of [
        "event_document_ack_assigned",
        "event_document_ack_completed",
        "event_document_expiring",
      ]) {
        expect(typeof types[key], `${l}: ${key}`).toBe("string");
        expect(types[key].length, `${l}: ${key}`).toBeGreaterThan(10);
      }
    });
  }
});

describe("8. gated-draft discipline", () => {
  it("both migrations carry the DRAFT banner, the mandate annotation and a gate doc pointer", () => {
    for (const src of [MIGRATION, NOTIF_MIGRATION]) {
      expect(src).toMatch(/DRAFT — needs-human-gate/);
      expect(src).toMatch(/@human-gate-approved/);
      expect(src).toMatch(/owner mandate\s*\n?.*2026-08-17/);
      expect(src).toMatch(/docs\/human-gates\//);
    }
  });

  it("paired rollbacks and gate docs exist on disk", () => {
    for (const rel of [
      ["supabase", "rollbacks", "20260817120000_document_file_layer_v1.down.sql"],
      ["supabase", "rollbacks", "20260817121000_notification_document_types_v3.down.sql"],
      ["docs", "human-gates", "document-file-layer-gate.md"],
      ["docs", "human-gates", "notification-document-types-v3-gate.md"],
    ]) {
      expect(existsSync(join(REPO, ...rel)), rel.join("/")).toBe(true);
    }
  });

  it("the APPLIED_LEDGER carries both PENDING APPLY BY LEAD entries", () => {
    const ledger = readRepo("docs", "APPLIED_LEDGER.md");
    expect(ledger).toContain("20260817120000_document_file_layer_v1.sql");
    expect(ledger).toContain("20260817121000_notification_document_types_v3.sql");
    expect(ledger.match(/PENDING APPLY BY LEAD/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("worker_documents stays canonical — no data migration, file_path stays dead", () => {
    expect(MIGRATION).not.toMatch(/update public\.worker_documents/);
    expect(MIGRATION).not.toMatch(/insert into public\.worker_documents/);
    for (const src of [READS, FILE_ACTIONS, ORG_ACTIONS]) {
      expect(src).not.toMatch(/file_path/);
    }
  });

  it("out-of-scope stays out: no AI calls, no file deletion path in SQL", () => {
    // (The design's out-of-scope list — OCR, e-signature, retention
    // auto-deletion — is NAMED in the migration header as excluded, so a
    // word-match would trip on the very sentence that excludes it. Pin the
    // mechanics instead.)
    const all = [MIGRATION, READS, FILE_ACTIONS, ORG_ACTIONS, ROUTE, MODEL].join("\n");
    expect(all).not.toMatch(/openai|anthropic|generative|tesseract/i);
    // Revoke KEEPS every version: no SQL path deletes document_files rows.
    expect(MIGRATION).not.toMatch(/delete from public\.document_files/);
    expect(MIGRATION).not.toMatch(/drop table public\.document_files/);
  });
});

describe("9. i18n — full catalogue in every locale (11), placeholders intact", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, k) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[k]
          : undefined,
      msgs,
    );

  const KEYS = [
    "documentFiles.currentVersion",
    "documentFiles.download",
    "documentFiles.noFileYet",
    "documentFiles.upload.submit",
    "documentFiles.upload.newVersion",
    "documentFiles.upload.limits",
    "documentFiles.upload.versionNote",
    "documentFiles.ackInbox.title",
    "documentFiles.ackInbox.confirm",
    "documentFiles.ackInbox.versionRule",
    "documentFiles.notice.uploaded",
    "documentFiles.notice.needs_migration",
    "documentFiles.notice.file_too_large",
    "documentFiles.notice.unsupported_type",
    "orgDocuments.title",
    "orgDocuments.preparing",
    "orgDocuments.empty",
    "orgDocuments.scopeNote",
    "orgDocuments.types.org_policy",
    "orgDocuments.types.org_agreement_attachment",
    "orgDocuments.status.active",
    "orgDocuments.status.revoked",
    "orgDocuments.classification.classified",
    "orgDocuments.ackProgress",
    "orgDocuments.create.title",
    "orgDocuments.create.submit",
  ];

  for (const loc of CATALOGUE) {
    it(`${loc}: full document-engine catalogue`, () => {
      const msgs = JSON.parse(read("messages", `${loc}.json`)) as unknown;
      for (const key of KEYS) {
        const v = resolve(msgs, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: ${key}`,
        ).toBe(true);
      }
    });
  }

  it("count placeholders survive in every ACTIVE locale", () => {
    for (const loc of ["en", "lt", "ru", "nl", "de"]) {
      const msgs = JSON.parse(read("messages", `${loc}.json`)) as {
        documentFiles: { currentVersion: string };
        orgDocuments: { ackProgress: string };
      };
      expect(msgs.documentFiles.currentVersion, loc).toContain("{n}");
      expect(msgs.orgDocuments.ackProgress, loc).toContain("{done}");
      expect(msgs.orgDocuments.ackProgress, loc).toContain("{total}");
    }
  });

  it("the copy never claims verification/legal force it does not have", () => {
    for (const loc of ["en", "lt", "ru", "nl", "de"]) {
      const blob = JSON.stringify(
        JSON.parse(read("messages", `${loc}.json`)).documentFiles,
      ).toLowerCase();
      expect(blob, loc).not.toMatch(/ai[- ]verified|guarantee|garantij|garantie|гарант|legally binding|e-?sign/);
    }
  });
});
