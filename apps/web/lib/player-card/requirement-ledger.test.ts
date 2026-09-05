import { describe, expect, it } from "vitest";

import type { RequirementRow, WorkerDocumentRow } from "@/lib/documents/readiness";
import {
  deriveLedgerRatio,
  deriveRequirementLedger,
  openLedgerRows,
  REQUIREMENT_LEDGER_RESOLUTIONS_PER_ROW,
  REQUIREMENT_LEDGER_ROW_LIMIT,
  type RequirementLedgerInput,
} from "./requirement-ledger";

/**
 * REQUIREMENT LEDGER — pure truth table (frozen design contract §5 P3
 * acceptance): the same person in three contexts gets three different
 * ledgers; every row that is not satisfied carries at least one resolution or
 * the honest "nothing recorded yet" ask; the ratio recomputes after a state
 * change; states are the existing derivers' states, never re-derived.
 */

const NOW = new Date("2026-09-05T08:00:00Z");

const doc = (over: Partial<WorkerDocumentRow>): WorkerDocumentRow => ({
  id: "d",
  documentTypeSlug: "id_document",
  country: null,
  storedStatus: "ready",
  validFrom: null,
  validUntil: null,
  note: null,
  ...over,
});

const req = (over: Partial<RequirementRow>): RequirementRow => ({
  country: "LT",
  documentTypeSlug: "a1_certificate",
  requirementLevel: "required",
  conditionNote: null,
  sourceStatus: "sourced",
  sourceUrl: "https://example.invalid/a1",
  sourceTitle: "Sodra (A1)",
  confidence: "official",
  ...over,
});

const HREFS = { journal: "/dashboard/journal", profile: "/dashboard/profile", ask: "/dashboard/communication/c1" };

/** The SAME person: documents, skills, languages, availability. */
const PERSON = {
  documents: [doc({ id: "d1", documentTypeSlug: "id_document" }), doc({ id: "d2", documentTypeSlug: "employment_contract", validUntil: "2026-09-20" })],
  ownSkills: [
    { slug: "scaffolding", verified: true },
    { slug: "hand-tools", verified: false },
  ],
  ownLanguages: [{ lang: "lt", level: "native" }],
  availabilitySet: true,
};

const COUNTRY_REQS: RequirementRow[] = [
  req({ documentTypeSlug: "a1_certificate" }),
  req({ documentTypeSlug: "id_document", sourceTitle: "Migracijos departamentas", sourceUrl: "https://example.invalid/id" }),
  req({ documentTypeSlug: "health_safety_card", requirementLevel: "recommended", sourceTitle: null, sourceUrl: null }),
  req({ country: "DE", documentTypeSlug: "posted_worker_package" }),
];

const TRAINING = [
  { id: "t1", title: "Darbų saugos kortelės kursas", description: null, assignedToMe: false },
  { id: "t2", title: "Pastolių montavimas (scaffolding)", description: "praktinis kursas", assignedToMe: true },
  { id: "t3", title: "Pirmoji pagalba", description: null, assignedToMe: false },
];

const SERVICES = [
  { id: "s1", title: "A1 pažymėjimo tvarkymas", description: null, categorySlug: "documents", rateText: "nuo 40 EUR", remote: true, country: null },
  { id: "s2", title: "Interjero dažymas", description: null, categorySlug: "finishing", rateText: null, remote: false, country: "LT" },
];

function base(over: Partial<RequirementLedgerInput>): RequirementLedgerInput {
  return {
    context: { kind: "project", projectId: "p1", conversationId: "c1" },
    contextLabel: "E2E Vilniaus objektas",
    country: "LT",
    now: NOW,
    checklistItems: [],
    countryRequirements: COUNTRY_REQS,
    requiredSkillSlugs: [],
    requiredLanguages: [],
    availabilityRequired: false,
    ...PERSON,
    trainingPrograms: TRAINING,
    serviceOfferings: SERVICES,
    hrefs: HREFS,
    ...over,
  };
}

const PROJECT = base({
  checklistItems: [
    { itemKey: "identity_document", label: "Asmens dokumentas", status: "needed" },
    { itemKey: "employment_contract_or_assignment_basis", label: "Darbo sutartis / priskyrimo pagrindas", status: "needed" },
    { itemKey: "a1_or_posting_document", label: "A1 arba komandiravimo dokumentas", status: "missing" },
    { itemKey: "qualification_or_skill_evidence", label: "Kvalifikacijos įrodymas", status: "rejected" },
    { itemKey: "safety_instruction_acknowledgement", label: "Saugos instruktažas", status: "checked" },
    { itemKey: "client_specific_requirement", label: "Kliento specifinis reikalavimas", status: "needed" },
  ],
});

const OPPORTUNITY = base({
  context: { kind: "opportunity", requestId: "r1" },
  contextLabel: "scaffolder",
  country: "DE",
  requiredSkillSlugs: ["scaffolding", "work-at-height", "hand-tools"],
  requiredLanguages: [
    { code: "de", level: "B1" },
    { code: "lt", level: null },
  ],
  availabilityRequired: true,
  hrefs: { ...HREFS, ask: "/dashboard/communication" },
});

const ROLE = base({
  context: { kind: "role", professionSlug: "scaffolder", country: "LT" },
  contextLabel: "scaffolder",
  requiredSkillSlugs: ["scaffolding", "work-at-height"],
  availabilityRequired: true,
  hrefs: { ...HREFS, ask: "/dashboard/communication" },
});

describe("same person → three contexts → three different ledgers", () => {
  const project = deriveRequirementLedger(PROJECT);
  const opportunity = deriveRequirementLedger(OPPORTUNITY);
  const role = deriveRequirementLedger(ROLE);

  it("the three row sets differ and each names its context", () => {
    const ids = (l: typeof project) => l.rows.map((r) => r.id).sort().join("|");
    expect(new Set([ids(project), ids(opportunity), ids(role)]).size).toBe(3);
    expect(project.context.kind).toBe("project");
    expect(opportunity.context.kind).toBe("opportunity");
    expect(role.context.kind).toBe("role");
    expect(project.contextLabel).toBe("E2E Vilniaus objektas");
  });

  it("project: the manager's rows come verbatim, own document state from the SAME document deriver; country rows only where no checklist row covers the type", () => {
    const byId = new Map(project.rows.map((r) => [r.id, r]));
    // id_document: own ready → valid, from own documents.
    expect(byId.get("checklist:identity_document")?.state).toBe("valid");
    expect(byId.get("checklist:identity_document")?.provenance).toEqual({ source: "own_document", validUntil: null });
    expect(byId.get("checklist:identity_document")?.subject).toEqual({ kind: "text", text: "Asmens dokumentas" });
    // employment_contract valid until 2026-09-20 → within the 30-day window → expiring.
    expect(byId.get("checklist:employment_contract_or_assignment_basis")?.state).toBe("expiring");
    // a1: no own record → missing; nothing recorded.
    expect(byId.get("checklist:a1_or_posting_document")?.state).toBe("missing");
    expect(byId.get("checklist:a1_or_posting_document")?.provenance).toEqual({ source: "none" });
    // rejected by the manager → missing, and the manager's word is the provenance.
    expect(byId.get("checklist:qualification_or_skill_evidence")?.state).toBe("missing");
    expect(byId.get("checklist:qualification_or_skill_evidence")?.provenance).toEqual({ source: "manager_checklist", status: "rejected" });
    // checked by the manager → valid even though it is not a document.
    expect(byId.get("checklist:safety_instruction_acknowledgement")?.state).toBe("valid");
    // a client's own rule: only the manager can say → unknown.
    expect(byId.get("checklist:client_specific_requirement")?.state).toBe("unknown");
    // country rows: id_document and a1 are covered by checklist rows → not duplicated;
    // health_safety_card is covered by the qualification row; DE rows never appear for LT.
    expect(byId.has("document:id_document")).toBe(false);
    expect(byId.has("document:a1_certificate")).toBe(false);
    expect(byId.has("document:health_safety_card")).toBe(false);
    expect(byId.has("document:posted_worker_package")).toBe(false);
    expect(project.rows).toHaveLength(6);
  });

  it("opportunity: the engine's required skills vs own worker_skills, the demand's languages vs own languages, availability, and the demand country's documents", () => {
    const byId = new Map(opportunity.rows.map((r) => [r.id, r]));
    expect(byId.get("skill:scaffolding")).toMatchObject({ state: "valid", provenance: { source: "own_skill", verified: true }, reason: "employer_demand" });
    expect(byId.get("skill:hand-tools")).toMatchObject({ state: "valid", provenance: { source: "own_skill", verified: false } });
    expect(byId.get("skill:work-at-height")).toMatchObject({ state: "missing", provenance: { source: "none" } });
    expect(byId.get("language:de")).toMatchObject({ state: "missing", provenance: { source: "none" } });
    expect(byId.get("language:lt")).toMatchObject({ state: "valid", provenance: { source: "own_language", level: "native" } });
    expect(byId.get("availability")).toMatchObject({ state: "valid", provenance: { source: "own_profile" } });
    expect(byId.get("document:posted_worker_package")).toMatchObject({ state: "missing", reason: "country_requirement" });
    expect(byId.has("document:a1_certificate")).toBe(false); // LT row, DE context
  });

  it("role: the profession's skills and the country's documents, reasons say so", () => {
    const byId = new Map(role.rows.map((r) => [r.id, r]));
    expect(byId.get("skill:work-at-height")?.reason).toBe("profession");
    expect(byId.get("availability")?.reason).toBe("profession");
    expect(byId.get("document:a1_certificate")).toMatchObject({ state: "missing", level: "required" });
    expect(byId.get("document:health_safety_card")).toMatchObject({ state: "missing", level: "recommended" });
  });

  it("rows are ordered action-first: missing → expiring → unknown → valid, required before recommended", () => {
    const order = role.rows.map((r) => r.state);
    const idx = (s: string) => ["missing", "expiring", "unknown", "valid"].indexOf(s);
    for (let i = 1; i < order.length; i += 1) expect(idx(order[i])).toBeGreaterThanOrEqual(idx(order[i - 1]));
    const missing = role.rows.filter((r) => r.state === "missing").map((r) => r.level);
    expect(missing.indexOf("recommended")).toBeGreaterThan(missing.lastIndexOf("required"));
  });
});

describe("every unsatisfied row has ≥ 1 resolution that exists, or the honest ask", () => {
  it("no non-valid row is left without a resolution; valid rows carry none", () => {
    for (const input of [PROJECT, OPPORTUNITY, ROLE]) {
      const ledger = deriveRequirementLedger(input);
      for (const row of ledger.rows) {
        if (row.state === "valid") expect(row.resolutions, row.id).toHaveLength(0);
        else expect(row.resolutions.length, row.id).toBeGreaterThanOrEqual(1);
        expect(row.resolutions.length).toBeLessThanOrEqual(REQUIREMENT_LEDGER_RESOLUTIONS_PER_ROW);
      }
    }
  });

  it("a document row: the add-document action first (the ONE existing write path), then the rows that exist and fit, and the issuing authority the matrix names", () => {
    const ledger = deriveRequirementLedger(PROJECT);
    const a1 = ledger.rows.find((r) => r.id === "checklist:a1_or_posting_document");
    expect(a1?.resolutions[0]).toEqual({
      kind: "add_document",
      documentTypeSlug: "a1_certificate",
      href: "/dashboard/documents?country=LT&type=a1_certificate#doc-centre-inventory",
      why: "records_it",
    });
    const kinds = a1?.resolutions.map((r) => r.kind);
    // The A1 service offering fits by name; the issuing authority comes from the LT requirement row.
    expect(kinds).toContain("service_offering");
    expect(a1?.resolutions.find((r) => r.kind === "service_offering")).toMatchObject({ id: "s1", why: "name_matches", rateText: "nuo 40 EUR" });
    expect(a1?.resolutions.find((r) => r.kind === "issuing_authority")).toEqual({ kind: "issuing_authority", title: "Sodra (A1)", url: "https://example.invalid/a1", why: "names_the_issuer" });
    // A course is never offered for a posting paper; the 3 programmes + 1 non-fitting service were read and rejected.
    expect(kinds).not.toContain("training_program");
    expect(a1?.rejectedCandidates).toBe(4);
  });

  it("a qualification row: the course that names it fits, the assigned one comes first; identity papers never get a course", () => {
    const ledger = deriveRequirementLedger(
      base({
        checklistItems: [{ itemKey: "qualification_or_skill_evidence", label: "Darbų saugos kortelė", status: "needed" }],
        documents: [],
        serviceOfferings: [],
      }),
    );
    const row = ledger.rows.find((r) => r.id === "checklist:qualification_or_skill_evidence");
    expect(row?.state).toBe("missing");
    expect(row?.resolutions.map((r) => r.kind)).toEqual(["add_document", "training_program"]);
    expect(row?.resolutions[1]).toMatchObject({ id: "t1", why: "name_matches" });
    expect(row?.rejectedCandidates).toBe(2);

    const idRow = deriveRequirementLedger(base({ documents: [], serviceOfferings: [] })).rows.find((r) => r.id === "document:id_document");
    expect(idRow?.resolutions.map((r) => r.kind)).toEqual(["add_document", "issuing_authority"]);
  });

  it("a skill row: the assigned course that names it comes first, then the work journal (evidence makes a skill real)", () => {
    const ledger = deriveRequirementLedger(base({ context: { kind: "role", professionSlug: "scaffolder", country: "LT" }, requiredSkillSlugs: ["scaffolding", "work-at-height"], ownSkills: [] }));
    const scaffolding = ledger.rows.find((r) => r.id === "skill:scaffolding");
    expect(scaffolding?.resolutions[0]).toEqual({ kind: "training_program", id: "t2", title: "Pastolių montavimas (scaffolding)", why: "assigned_to_you" });
    expect(scaffolding?.resolutions[1]).toEqual({ kind: "add_evidence", href: "/dashboard/journal", why: "evidence_makes_it_real" });
    const height = ledger.rows.find((r) => r.id === "skill:work-at-height");
    expect(height?.resolutions.map((r) => r.kind)).toEqual(["add_evidence"]);
    expect(height?.rejectedCandidates).toBe(3 + 2);
  });

  it("the honest empty state: nothing fits and no action applies → exactly one ask resolution pointing at the existing thread", () => {
    const ledger = deriveRequirementLedger(base({ checklistItems: [{ itemKey: "client_specific_requirement", label: "Kliento reikalavimas", status: "needed" }], trainingPrograms: [], serviceOfferings: [] }));
    const row = ledger.rows.find((r) => r.id === "checklist:client_specific_requirement");
    expect(row?.state).toBe("unknown");
    expect(row?.resolutions).toEqual([{ kind: "ask", href: "/dashboard/communication/c1", why: "nothing_recorded" }]);
    expect(row?.rejectedCandidates).toBe(0);
  });

  it("a language row without a matching course → ask; a course naming the language fits", () => {
    const none = deriveRequirementLedger(base({ ...OPPORTUNITY, trainingPrograms: [] })).rows.find((r) => r.id === "language:de");
    expect(none?.resolutions).toEqual([{ kind: "ask", href: "/dashboard/communication", why: "nothing_recorded" }]);
    const course = deriveRequirementLedger(base({ ...OPPORTUNITY, trainingPrograms: [{ id: "t9", title: "Vokiečių kalba B1 (de)", description: null, assignedToMe: false }] })).rows.find((r) => r.id === "language:de");
    expect(course?.resolutions[0]).toMatchObject({ kind: "training_program", id: "t9" });
  });

  it("unavailable sources are UNAVAILABLE, not empty: no rejection is counted for a source that did not answer", () => {
    const ledger = deriveRequirementLedger(base({ documents: [], trainingPrograms: null, serviceOfferings: null }));
    expect(ledger.reads.training).toBe("unavailable");
    expect(ledger.reads.services).toBe("unavailable");
    for (const row of ledger.rows) expect(row.rejectedCandidates).toBe(0);
  });
});

describe("the ratio recomputes after a state change — the person's side of the same N of M", () => {
  it("recording the missing document moves the ratio; the manager's checked row moves it too", () => {
    const before = deriveRequirementLedger(PROJECT);
    expect(before.ratio).toEqual({ have: 3, total: 6 });
    expect(deriveLedgerRatio(before.rows)).toEqual(before.ratio);

    const after = deriveRequirementLedger({
      ...PROJECT,
      documents: [...PERSON.documents, doc({ id: "d3", documentTypeSlug: "a1_certificate", country: "LT" })],
    });
    expect(after.ratio).toEqual({ have: 4, total: 6 });
    expect(after.rows.find((r) => r.id === "checklist:a1_or_posting_document")).toMatchObject({ state: "valid", provenance: { source: "own_document", validUntil: null }, resolutions: [] });

    const managerChecked = deriveRequirementLedger({
      ...PROJECT,
      checklistItems: PROJECT.checklistItems.map((i) => (i.itemKey === "client_specific_requirement" ? { ...i, status: "checked" as const } : i)),
    });
    expect(managerChecked.ratio).toEqual({ have: 4, total: 6 });
    // Open = still needs something: the expiring contract, the missing A1, the rejected qualification.
    expect(openLedgerRows(managerChecked).map((r) => r.id)).toEqual([
      "checklist:a1_or_posting_document",
      "checklist:qualification_or_skill_evidence",
      "checklist:employment_contract_or_assignment_basis",
    ]);
  });

  it("an unanswered documents read is UNKNOWN, never missing — and never counted as have", () => {
    const ledger = deriveRequirementLedger({ ...PROJECT, documents: null });
    expect(ledger.reads.documents).toBe("unknown");
    for (const row of ledger.rows.filter((r) => r.kind === "document" && r.managerStatus === "needed" || r.managerStatus === "missing")) {
      expect(row.state, row.id).toBe("unknown");
      expect(row.provenance).toEqual({ source: "not_readable" });
    }
    expect(ledger.ratio.have).toBe(1); // only the manager-checked row
  });

  it("bounded: never more than the row limit, whatever the inputs", () => {
    const many = Array.from({ length: 60 }, (_, i) => `skill-${i}`);
    const ledger = deriveRequirementLedger(base({ requiredSkillSlugs: many, ownSkills: [] }));
    expect(ledger.rows.length).toBeLessThanOrEqual(REQUIREMENT_LEDGER_ROW_LIMIT);
    expect(ledger.ratio.total).toBe(ledger.rows.length);
  });
});
