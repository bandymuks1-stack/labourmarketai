import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ATTENTION — "what needs me now" for the workspace's OTHER capabilities
 * (owner contract 2026-09-04 §4D). The employer opening brief carried the
 * operations loop only (reviews · absences · absent today · unread); an
 * agency's daily loop is its clients and offers, an institution's is its
 * learners. These rungs join the SAME brief, from the SAME canonical reads.
 */

const APP = join(__dirname, "..", "..");
const SRC = readFileSync(join(__dirname, "opening-brief.ts"), "utf8");
const FN = SRC.slice(SRC.indexOf("export async function loadEmployerOpeningBrief"));

describe("the employer brief carries agency and institution attention", () => {
  it("reads the capability flags from the ONE starter-context read, then the canonical bridge / learner reads", () => {
    expect(FN).toMatch(/loadCompanyStarterContext\(\)/);
    expect(FN).toMatch(/ws\.signals\.staffingAgency/);
    expect(FN).toMatch(/listAgencyOfferProgress\(\), listSharedRequestsForAgency\(\)/);
    expect(FN).toMatch(/ws\.signals\.capabilities\.includes\("training_provider"\)/);
    expect(FN).toMatch(/readInstitutionLearners\(ws\.organizationId\)/);
  });

  it("names the three agency states and the learner state, each a real count, each with its chat action", () => {
    expect(FN).toMatch(/r\.offerStatus === "offered"/);
    expect(FN).toMatch(/briefAgencyOffersAwaiting/);
    expect(FN).toMatch(/addChip\("agency:progress"/);
    expect(FN).toMatch(/!offeredFor\.has\(s\.requestId\)/);
    expect(FN).toMatch(/briefAgencySharedWithoutOffer/);
    expect(FN).toMatch(/addChip\("agency:demand"/);
    expect(FN).toMatch(/clientConnectionsPending/);
    expect(FN).toMatch(/briefAgencyClientsPending/);
    expect(FN).toMatch(/learners\.counts\.pending > 0/);
    expect(FN).toMatch(/briefEduLearnerInvitesPending/);
  });

  it("the attention rungs sit BEFORE the operations ladder and inside their own try (a failed read invents nothing)", () => {
    expect(FN.indexOf("loadCompanyStarterContext")).toBeLessThan(FN.indexOf("fetchQuickReviewQueue"));
    const rung = FN.slice(FN.indexOf("// 0 ── ATTENTION"), FN.indexOf("// 1 ── work entries"));
    expect(rung).toMatch(/^\s*try \{/m);
    expect(rung).toMatch(/\} catch \{/);
    expect(rung).toMatch(/lines\.length < MAX_LINES/);
  });

  it("the employer brief names the candidates still waiting for an answer, from the ONE pending-interest read, with the in-chat candidates chip", () => {
    expect(FN).toMatch(/listPendingInterestCountsForCompany\(\)/);
    expect(FN).toMatch(/briefEmployerInterestWaiting/);
    expect(FN).toMatch(/addChip\("candidates", t\("chipInterestOnMyNeeds"\)\)/);
    expect(FN.indexOf("listPendingInterestCountsForCompany")).toBeLessThan(FN.indexOf("fetchQuickReviewQueue"));
  });

  it("the worker brief names expiring / missing documents from the SAME documents-gap derivation the chat answers with", () => {
    const worker = SRC.slice(SRC.indexOf("export async function loadOpeningBrief"), SRC.indexOf("export async function loadEmployerOpeningBrief"));
    expect(worker).toMatch(/loadWorkerDocumentGap\(\)/);
    expect(worker).toMatch(/docs\.gap\.expiring\.length > 0/);
    expect(worker).toMatch(/briefDocumentsExpiring/);
    // A missing-document line needs a stated country — the brief never guesses one.
    expect(worker).toMatch(/docs\.gap\.missing\.length > 0 && docs\.countries\.length > 0/);
    expect(worker).toMatch(/addChip\("documents-centre", t\("documentsChip"\)\)/);
    // Inside its own try, and before the learner-identity block the guard slices.
    expect(worker.indexOf("loadWorkerDocumentGap")).toBeLessThan(worker.indexOf("learner identity (M10"));
  });

  it("the brief copy exists in the five routed locales (same parity as the existing brief keys)", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const chat = JSON.parse(readFileSync(join(APP, "messages", `${locale}.json`), "utf8")).conversation.chat as Record<string, string>;
      for (const key of ["briefAgencyOffersAwaiting", "briefAgencySharedWithoutOffer", "briefAgencyClientsPending", "briefEduLearnerInvitesPending", "briefDocumentsExpiring", "briefDocumentsMissing", "briefEmployerInterestWaiting"]) {
        expect(chat[key], `${locale}.${key}`).toMatch(/\{count, plural/);
      }
    }
  });
});
