import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_READINESS_ITEM_KEYS, READINESS_ITEM_DOCUMENT_TYPES, documentTypesForReadinessItem } from "@/lib/projects/readiness-items";

import { deriveWorkerProjectAsks, firstRecordableAsk, WORKER_PROJECT_ASK_LIMIT } from "./worker-project-asks";

/**
 * The checklist ↔ document bridge, on the PERSON's side (owner contract §11
 * / §12 / §16). The manager's checklist row and the person's own document
 * stay two truths in two tables; the map lets the person read them together
 * and act over the SAME add-document flow. A manager never reads the
 * person's documents through it (worker documents are default-closed, §4).
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const NOW = new Date("2026-09-05T08:00:00Z");

describe("the readiness-item → document-type map names only SEEDED document types", () => {
  const seeded = new Set<string>();
  for (const mig of [
    "20260610170000_worker_documents_readiness.sql",
    "20260613100200_worker_document_verification.sql",
    "20260817140000_document_file_layer_v1.sql",
  ]) {
    const sql = readFileSync(join(WEB, "..", "..", "supabase", "migrations", mig), "utf8");
    for (const m of sql.matchAll(/\('([a-z0-9_]+)', '(identity|qualification|posting|organization)'\)/g)) seeded.add(m[1]);
  }

  it("every default key is mapped; every mapped slug exists in the registry seeds; org-scope types never answer a worker row", () => {
    for (const key of DEFAULT_READINESS_ITEM_KEYS) {
      expect(READINESS_ITEM_DOCUMENT_TYPES[key], key).toBeDefined();
      for (const slug of READINESS_ITEM_DOCUMENT_TYPES[key]) {
        expect(seeded.has(slug), `${key} → ${slug}`).toBe(true);
        expect(slug.startsWith("org_"), slug).toBe(false);
      }
    }
    expect(seeded.size).toBeGreaterThanOrEqual(12);
  });

  it("non-document rows (a briefing, availability, a client rule) map to nothing; an unknown custom key maps to nothing", () => {
    expect(READINESS_ITEM_DOCUMENT_TYPES.safety_instruction_acknowledgement).toEqual([]);
    expect(READINESS_ITEM_DOCUMENT_TYPES.travel_or_start_availability).toEqual([]);
    expect(READINESS_ITEM_DOCUMENT_TYPES.client_specific_requirement).toEqual([]);
    expect(documentTypesForReadinessItem("custom_row_the_manager_typed")).toEqual([]);
    expect(documentTypesForReadinessItem("a1_or_posting_document")[0]).toBe("a1_certificate");
  });
});

describe("deriveWorkerProjectAsks — pure truth table", () => {
  const item = (projectId: string, itemKey: string, status: "needed" | "missing" | "rejected" | "expired" = "needed") => ({
    projectId,
    itemKey,
    label: `L:${itemKey}`,
    status,
  });

  it("the manager's label is verbatim; a document row carries the person's own state; a non-document row carries none", () => {
    const asks = deriveWorkerProjectAsks(
      [item("p1", "a1_or_posting_document"), item("p1", "identity_document"), item("p1", "client_specific_requirement")],
      [{ documentTypeSlug: "a1_certificate", storedStatus: "ready", validUntil: "2027-03-01" }],
      NOW,
    );
    const p1 = asks.get("p1")!;
    expect(p1.map((a) => a.label)).toEqual(["L:a1_or_posting_document", "L:identity_document", "L:client_specific_requirement"]);
    expect(p1[0]).toMatchObject({ documentTypeSlug: "a1_certificate", own: "ready" });
    expect(p1[1]).toMatchObject({ documentTypeSlug: "id_document", own: "none" });
    expect(p1[2]).toMatchObject({ documentTypeSlug: null, own: null });
  });

  it("the best OWN record wins per row (ready > expiring > none); an expired or blocked record is 'none', never 'ready'", () => {
    const asks = deriveWorkerProjectAsks(
      [item("p1", "identity_document"), item("p1", "employment_contract_or_assignment_basis"), item("p1", "qualification_or_skill_evidence")],
      [
        { documentTypeSlug: "id_document", storedStatus: "ready", validUntil: "2026-09-10" }, // expiring (inside the window)
        { documentTypeSlug: "residence_permit", storedStatus: "ready", validUntil: null }, // ready → identity row is ready
        { documentTypeSlug: "employment_contract", storedStatus: "ready", validUntil: "2026-01-01" }, // expired → none
        { documentTypeSlug: "professional_certificate", storedStatus: "blocked", validUntil: null }, // blocked → none
      ],
      NOW,
    );
    const p1 = asks.get("p1")!;
    expect(p1[0].own).toBe("ready");
    expect(p1[1].own).toBe("none");
    expect(p1[2].own).toBe("none");
    const only = deriveWorkerProjectAsks([item("p1", "identity_document")], [{ documentTypeSlug: "id_document", storedStatus: "ready", validUntil: "2026-09-10" }], NOW);
    expect(only.get("p1")![0].own).toBe("expiring");
  });

  it("rows are grouped per project, bounded per project; nothing tracked → no entry (never an invented ask)", () => {
    const many = Array.from({ length: WORKER_PROJECT_ASK_LIMIT + 3 }, (_, i) => item("p1", `custom_${i}`));
    const asks = deriveWorkerProjectAsks([...many, item("p2", "identity_document")], [], NOW);
    expect(asks.get("p1")!.length).toBe(WORKER_PROJECT_ASK_LIMIT);
    expect(asks.get("p2")!.length).toBe(1);
    expect(asks.has("p3")).toBe(false);
    expect(deriveWorkerProjectAsks([], [], NOW).size).toBe(0);
  });

  it("the chip is the FIRST row the person can close by recording a document — never a row they already have, never a non-document row", () => {
    const asks = deriveWorkerProjectAsks(
      [item("p1", "client_specific_requirement"), item("p1", "a1_or_posting_document"), item("p2", "identity_document")],
      [{ documentTypeSlug: "a1_certificate", storedStatus: "ready", validUntil: null }],
      NOW,
    );
    expect(firstRecordableAsk(asks.values())).toMatchObject({ itemKey: "identity_document", documentTypeSlug: "id_document" });
    expect(firstRecordableAsk([])).toBeNull();
  });
});

describe("the read and the chat — existing canonical paths only (source pins)", () => {
  const ACCESS = read("lib/projects/worker-project-access.ts");
  const READ = read("lib/conversation/worker-projects.ts");
  const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");

  it("the person's asks are their OWN rows of the checklist table, open statuses only, indexed and bounded, no write", () => {
    const fn = ACCESS.slice(ACCESS.indexOf("export async function listOwnReadinessItems"));
    expect(fn).toMatch(/\.from\("project_worker_readiness_items"\)/);
    expect(fn).toMatch(/\.eq\("worker_id", workerId\)/);
    expect(fn).toMatch(/\.in\("project_id", projectIds\.slice\(0, 10\)\)/);
    expect(fn).toMatch(/\.limit\(OWN_READINESS_ITEMS_LIMIT\)/);
    expect(ACCESS).toMatch(/OPEN_READINESS_STATUSES = \["needed", "missing", "rejected", "expired"\] as const/);
    expect(fn).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.rpc\(/);
  });

  it("the chat read composes the worker project page's read + the documents page's read + the map; a failed read leaves the asks empty", () => {
    expect(READ).toContain('import { listMyDocuments } from "@/lib/documents/readiness";');
    expect(READ).toContain("listOwnReadinessItems(workerId, activeIds)");
    expect(READ).toMatch(/deriveWorkerProjectAsks\(items, docs\.kind === "ok" \? docs\.documents : \[\], new Date\(\)\)/);
    expect(READ).toMatch(/catch \{\s*\/\* asks stay empty/);
    expect(READ).toMatch(/recordable: first && first\.documentTypeSlug \? \{ documentTypeSlug: first\.documentTypeSlug, label: first\.label \} : null/);
  });

  it("the chat shows the asks under the project line and routes the record chip to the SAME add-document flow with the type prefilled", () => {
    expect(CHAT).toContain('import type { WorkerProjectAsk } from "@/lib/conversation/worker-project-asks";');
    expect(CHAT).toMatch(/labels\.workerProjectAsks\.replace\("\{items\}", pr\.asks\.map\(askWord\)\.join\(" · "\)\)/);
    expect(CHAT).toMatch(/id: `add-document:\$\{recordable\.documentTypeSlug\}`/);
    expect(CHAT).toMatch(/chip\.id\.startsWith\("add-document:"\)/);
    expect(CHAT).toMatch(/startAddDocument\("", \{ typeSlug: chip\.id\.slice\(13\) \}\)/);
    expect(CHAT).toMatch(/const chosenSlug = explicit\?\.typeSlug \?\? typeSlug;/);
    expect(CHAT).toMatch(/if \(chosenSlug && opts\.types\.some\(\(o\) => o\.value === chosenSlug\)\) prefill\.typeSlug = chosenSlug;/);
    // The client never imports the server-only deriver at runtime — type import only.
    expect(CHAT).not.toMatch(/^import \{[^}]*\} from "@\/lib\/conversation\/worker-project-asks"/m);
  });

  it("copy exists in all 11 catalogs and the label keys resolve", () => {
    const LABELS = read("components/app/conversation/chat/labels.ts");
    const KEYS = ["workerProjectAsks", "askOwnReady", "askOwnExpiring", "askOwnNone", "chipRecordDocument"];
    for (const k of KEYS) expect(LABELS, k).toContain(`"${k}"`);
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const chat = JSON.parse(read(`messages/${locale}.json`)).conversation.chat as Record<string, string>;
      for (const k of KEYS) expect(chat[k], `${locale}.${k}`).toBeTypeOf("string");
      expect(chat.workerProjectAsks).toContain("{items}");
      expect(chat.chipRecordDocument).toContain("{label}");
    }
  });
});
