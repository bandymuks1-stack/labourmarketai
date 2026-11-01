/**
 * Decision 0021 - documents are READINESS requirements, not a vault and not a
 * gate. Registration, matching, discovery, shortlist, planning, team formation
 * and offers must not read document presence as a precondition, and readiness
 * must never feed fit.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\./.test(e)) out.push(f);
  }
  return out;
}

// Modules on the pre-contract path: fit, discovery, shortlist, planning, offers.
const PRE_CONTRACT_DIRS = [
  "lib/market",
  "lib/scouting",
  "lib/planning",
  "lib/opportunities",
  "lib/supply",
  "lib/candidates",
  "lib/invitations",
];

// A precondition = a document table/column/count read, or a documents-count compare.
const DOC_PRECONDITION =
  /worker_documents|document_files|org_documents|documentsCount\s*(===|==|>|<|!==)|hasDocuments?\b|isReadyToStart|workerReadinessFromChecklist|computeWorkerCountryReadiness/;

describe("no pre-contract module treats document presence as a precondition", () => {
  for (const d of PRE_CONTRACT_DIRS) {
    it(`${d} reads no document presence`, () => {
      let files: string[] = [];
      try {
        files = walk(join(WEB, d));
      } catch {
        return;
      }
      const offenders = files.filter((f) => DOC_PRECONDITION.test(readFileSync(f, "utf8")));
      expect(offenders.map((f) => f.slice(WEB.length))).toEqual([]);
    });
  }

  it("the worker opportunity fit has no documents veto and no documents status", () => {
    const src = read("lib/opportunities/opportunity-fit.ts");
    expect(src).not.toMatch(/"needs_documents"|"no_documents"/);
    expect(src).not.toMatch(/documentsCount\s*(===|==|>|<)/);
  });
});

describe("readiness is a sibling of fit, never an input", () => {
  it("match-v1 never reads the readiness block", () => {
    const src = read("lib/market/match-v1.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/\.readiness\b/);
    expect(src).not.toMatch(/from "@\/lib\/readiness\/(?!readiness-model)/);
  });
  it("ranking / eligibility / actionability never read readiness", () => {
    for (const f of ["lib/scouting/candidate-actionability.ts", "lib/scouting/auto-match.ts", "lib/scouting/scout-filters.ts"]) {
      expect(read(f), f).not.toMatch(/\.readiness\b|lib\/readiness\//);
    }
    const scouting = read("lib/scouting/scouting.ts");
    expect(scouting).not.toMatch(/readiness\.(status|outstanding)/);
  });
  it("the readiness model reads no file/storage fields", () => {
    for (const f of ["readiness-model.ts", "context-requirements.ts", "with-readiness.ts"]) {
      expect(read("lib/readiness", f), f).not.toMatch(/file_path|storage_path|document_files|byte_size|uploaded/i);
    }
  });
});

describe("'checked' wording never claims a stored copy or independent verification", () => {
  it("readinessChecks copy (all locales) has no upload / copy-stored claim", () => {
    for (const loc of ["en", "lt", "de", "nl", "pl", "ru"]) {
      const block = JSON.parse(read("messages", `${loc}.json`)).scouting.readinessChecks;
      expect(block, loc).toBeTruthy();
      for (const k of ["outstanding", "clear", "unknown"]) expect(block[k], `${loc}.${k}`).toBeTruthy();
      for (const st of ["contract", "assignment", "mobilisation", "work_start"]) expect(block.stage[st], `${loc}.${st}`).toBeTruthy();
      expect(JSON.stringify(block)).not.toMatch(/uploaded|įkelt|hochgeladen|geüpload|przes[łl]an|загруж|stored copy|verified by LabourMarket/i);
    }
  });
});

/**
 * Decision 0021 EXTENSION (owner correction 2026-10-24, P0): not uploading a
 * document never means "not ready"; missing-document counts are never an
 * automatic negative readiness signal; there is no universal mandatory list;
 * a mutual, neutral recommendation is shown where two parties consider a
 * concrete collaboration. Each block pins one root.
 */
describe("decision 0021 extension — documents never lower readiness, and both parties get the same recommendation", () => {
  it("operations: only a row a manager EXPLICITLY marked missing counts as missing; a suggested row is 'to agree'", async () => {
    const { deriveWorkerOps } = await import("@/lib/projects/operations-derive");
    const w = deriveWorkerOps({
      workerId: "w",
      workerProfileId: "p",
      name: "N",
      hasRealName: true,
      assignedAt: "2026-10-01",
      readiness: {
        journalEntries: 1,
        declaredSkills: 1,
        confirmedSkills: 0,
        openReviewItems: 0,
        lastActivity: "2026-10-01",
      } as never,
      readinessItems: [
        { itemKey: "identity_document", label: "ID", status: "needed", note: null },
        { itemKey: "client_specific_requirement", label: "C", status: "needed", note: null },
      ],
    });
    expect(w.ready).toBe(true);
    expect(w.docsMissing).toBe(0);
    expect(w.docsToAgree).toBe(2);
  });

  it("the chat readiness verdict and the project risk order never read documents", () => {
    const readiness = read("lib/conversation/project-readiness.ts");
    expect(readiness).toMatch(/ready: w\.ready,/);
    expect(readiness).not.toMatch(/ready: w\.ready && w\.docsMissing/);
    const risk = read("lib/conversation/project-risk.ts");
    expect(risk).not.toMatch(/tasksOverdue \+ pulse\.workersWithMissingDocs/);
  });

  it("no universal list: A1 / posting is suggested only when the work is KNOWN to cross a border", async () => {
    const { suggestedReadinessItemKeys } = await import("@/lib/projects/readiness-items");
    expect(suggestedReadinessItemKeys({ crossBorder: false })).not.toContain("a1_or_posting_document");
    expect(suggestedReadinessItemKeys({ crossBorder: true })).toContain("a1_or_posting_document");
    for (const f of [
      "app/[locale]/dashboard/projects/[id]/operations/page.tsx",
      "lib/conversation/company-executors.ts",
      "lib/conversation/project-move.ts",
    ]) {
      expect(read(f), f).not.toMatch(/DEFAULT_READINESS_ITEM_KEYS\.(map|length)/);
      expect(read(f), f).toMatch(/suggestedReadinessItemKeys\(/);
    }
  });

  it("a country's document rules never enter the person's 'N of M'", () => {
    expect(read("lib/player-card/requirement-ledger.ts")).toContain(
      'if (r.reason === "country_requirement") continue;',
    );
  });

  it("the mutual recommendation is on every surface where a concrete collaboration is considered", () => {
    for (const f of [
      "app/[locale]/dashboard/projects/[id]/operations/page.tsx",
      "app/[locale]/dashboard/company/scouting/page.tsx",
      "app/[locale]/dashboard/bookings/page.tsx",
      "app/[locale]/dashboard/commercial/page.tsx",
      "app/[locale]/dashboard/service-requests/page.tsx",
    ]) {
      expect(read(f), f).toMatch(/<CollaborationChecksNote/);
    }
    // advice, never a gate: the note renders no control that could block
    const note = read("components/app/collaboration-checks-note.tsx");
    expect(note).not.toMatch(/<button|disabled=|onClick|<form/);
  });

  it("no active locale tells a person they are not ready without documents, or offers a 'standard' list", () => {
    for (const loc of ["en", "lt", "de", "nl", "pl", "ru"]) {
      const m = JSON.parse(read("messages", `${loc}.json`));
      const countryFit = String(m.playerCard.readinessPanel.countryFit);
      expect(countryFit, loc).not.toMatch(
        /not shown as ready|nerodoma kaip pasiruošusi|не показ|nicht als bereit|niet als klaar|nie jest pokazywan/i,
      );
      expect(String(m.projectOps.checklist.seed), loc).not.toMatch(/standard|standartin|стандарт/i);
      expect(String(m.projectOps.readinessStatuses.needed), loc).not.toMatch(
        /^(Needed|Reikalingas|Нужен|Erforderlich|Nodig|Wymagany)$/,
      );
    }
  });
});
