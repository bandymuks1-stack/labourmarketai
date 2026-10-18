import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONVERSATION_ACTIONS } from "./action-registry";
import { guessDocumentType } from "./document-type-guess";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";
import { workerAddDocumentForm } from "./worker-forms";
import { WORKER_ACTION_SCHEMAS } from "./worker-schemas";
import { pinRefForSentence } from "@/lib/workspace/pin-usage-from-intent";

/**
 * Documents first-class (owner contract 2026-09-04 §12/§14): a document is
 * RECORDED by sentence — "turiu naują A1 iki 2027-03-31" — through the one
 * inline form over the canonical upsert the documents page uses; the
 * readiness answer re-runs right after, so the person sees the gap close.
 */
describe("record a document by sentence", () => {
  it.each([
    "Turiu naują A1 pažymą iki 2027-03-31",
    "gavau leidimą dirbti Nyderlanduose",
    "pratęsiau pažymėjimą",
    "I have a new VCA certificate",
    "renewed my certificate",
    "Получил новое разрешение на работу",
    "Ik heb een nieuwe vergunning",
    "Ich habe einen neuen Ausweis",
  ])("%s → add-document", (text) => {
    expect(classifyIntent(text).intent).toBe("add-document");
  });

  it("opening the folder and asking what is missing keep their intents", () => {
    expect(classifyIntent("parodyk mano dokumentus").intent).toBe("documents");
    expect(classifyIntent("kas baigia galioti?").intent).toBe("documents");
    expect(classifyIntent("kokių dokumentų man reikia?").intent).toBe("documents");
  });

  it("the sentence pre-fills the TYPE from the closed catalogue — most specific reading first", () => {
    expect(guessDocumentType("turiu naują A1 pažymą")).toBe("a1_certificate");
    expect(guessDocumentType("gavau leidimą gyventi")).toBe("residence_permit");
    expect(guessDocumentType("gavau leidimą dirbti")).toBe("work_permit");
    expect(guessDocumentType("I have a new VCA")).toBe("health_safety_card");
    expect(guessDocumentType("pratęsiau pažymėjimą")).toBe("professional_certificate");
    expect(guessDocumentType("naujas pasas")).toBe("id_document");
    expect(guessDocumentType("kažkas naujo")).toBeNull();
  });

  it("is a write intent over the ONE dispatcher; the row is anchored to the documents centre", () => {
    expect(INTENT_REGISTRY["add-document"]).toMatchObject({ domain: "documents", access: "write", handler: "addDocument" });
    const row = CONVERSATION_ACTIONS.find((a) => a.id === "worker.add-document");
    expect(row).toMatchObject({ subject: "worker", allowedRoles: ["worker"], confirmation: "reversible_write", precondition: "has_worker_row", advancedRoute: "/dashboard/documents" });
    expect(row?.handler).toEqual({ kind: "server_action", ref: "upsertWorkerDocumentAction" });
    const schema = WORKER_ACTION_SCHEMAS["worker.add-document"];
    expect(schema.safeParse({ typeSlug: "a1_certificate", validUntil: "2027-03-31" }).success).toBe(true);
    expect(schema.safeParse({ typeSlug: "a1_certificate", validUntil: "31.03.2027" }).success).toBe(false);
    expect(schema.safeParse({ typeSlug: "" }).success).toBe(false);
    expect(pinRefForSentence("add-document", "person")).toBe("f:worker.add-document");
  });

  it("the form is BUILT from the catalogues the server read returns — never a list of its own", () => {
    const form = workerAddDocumentForm([{ value: "a1_certificate", label: "A1" }], [{ value: "NL", label: "Nyderlandai" }]);
    expect(form.actionId).toBe("worker.add-document");
    expect(form.fields.map((f) => f.name)).toEqual(["typeSlug", "country", "validUntil", "note"]);
    const type = form.fields[0];
    expect(type.kind === "select" && type.options.map((o) => o.value)).toEqual(["a1_certificate"]);
    expect(form.build({ typeSlug: "a1_certificate", country: "", validUntil: "2027-03-31", note: "" })).toEqual({ typeSlug: "a1_certificate", country: null, status: "ready", validUntil: "2027-03-31", note: null });
    const FORMS = readFileSync(join(__dirname, "worker-forms.ts"), "utf8");
    expect(FORMS).not.toMatch(/a1_certificate|health_safety_card/);
    const READ = readFileSync(join(__dirname, "documents-form.ts"), "utf8");
    expect(READ).toContain('.from("document_types")');
    expect(READ).toContain('.neq("category", "organization")');
    expect(READ).toContain('getTranslations("documents.types")');
  });

  it("the executor delegates to the canonical upsert; the chat re-runs readiness after the save", () => {
    const EXEC = readFileSync(join(__dirname, "worker-executors.ts"), "utf8");
    expect(EXEC).toContain("upsertWorkerDocumentAction(");
    expect(EXEC).toContain("document_type_slug: input.typeSlug");
    // The comment may NAME the RPC; the code may not call it.
    expect(EXEC).not.toMatch(/\.rpc\(|\.from\(/);
    const CHAT = readFileSync(join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");
    expect(CHAT).toContain("addDocument: () => startAddDocument(text)");
    expect(CHAT).toContain("const typeSlug = guessDocumentType(sentence);");
    expect(CHAT).toContain('from "@/lib/conversation/document-type-guess"');
    expect(CHAT).toContain("const validUntil = parseEndDate(sentence, todayIso(), null);");
    expect(CHAT).toContain("runWorkflow(() => runDocumentsReadiness());");
  });

  it("copy exists in all 11 catalogs", () => {
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const cat = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${locale}.json`), "utf8"));
      expect(cat.conversation.actions.worker.addDocument.label).toBeTypeOf("string");
      for (const key of ["documentType", "documentCountry", "validUntil", "validUntilPlaceholder", "documentNote"]) {
        expect(cat.conversation.forms.fields[key], `${locale}.${key}`).toBeTypeOf("string");
      }
      for (const key of ["documentAddIntro", "documentAddDone", "documentAddUnavailable"]) {
        expect(cat.conversation.chat[key], `${locale}.${key}`).toBeTypeOf("string");
        expect(cat.conversation.chat[key]).not.toMatch(/^\[EN\]/);
      }
    }
  });
});
