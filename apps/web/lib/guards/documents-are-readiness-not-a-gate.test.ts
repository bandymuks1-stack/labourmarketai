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
