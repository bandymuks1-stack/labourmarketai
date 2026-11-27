/**
 * GUARD — a staffing agency proposes its people from the phone through the web
 * chat's own capabilities (owner order 2026-11-16: one shared client, no
 * parallel backend), confirms with the prepare's own input, and every line is
 * the web chat's own wording.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv"] as const;

describe("mobile agency proposals", () => {
  const screen = read("apps/mobile/src/screens/agency.tsx");

  it("reads and writes through the canonical capabilities only", () => {
    expect(screen).toContain('useCapability<AgencyClientsData>("agency.clients.get", NO_ARGS)');
    expect(screen).toContain('name: "agency.propose-candidate.prepare"');
    expect(screen).toContain('name: "agency.propose-candidate.confirm"');
    expect(screen).toContain("args: { shareId: need.shareId, workerId: worker.workerId, note:");
    expect(screen).not.toMatch(/supabase\s*\.\s*from\(/);
  });

  it("confirms with the prepare's own input and token", () => {
    expect(screen).toMatch(/args: \{ input: prepared\.input, confirmationToken: prepared\.confirmationToken \}/);
  });

  it("is an organization station on Today", () => {
    const today = read("apps/mobile/app/(shell)/today.tsx");
    const gated = today.slice(today.indexOf("{personal ? null : ("), today.indexOf("</>", today.indexOf("{personal ? null : (")));
    expect(gated).toContain('testID="today-open-agency"');
  });

  it("uses the web chat's own words in every locale", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const w = JSON.parse(read(`apps/web/messages/${locale}.json`)).conversation;
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const block = messages.slice(start, messages.indexOf(locale === "en" ? "\n} as const;" : "\n};", start));
      const pairs: [string, string][] = [
        ["agency.title", w.actions.agency.proposeCandidate.label],
        ["agency.notAgency", w.chat.agencyNotAgencyWorkspace],
        ["agency.sharedIntro", w.chat.agencyClientDemandIntro],
        ["agency.sharedNone", w.chat.agencyClientDemandNone],
        ["agency.proposalsIntro", w.chat.agencyProposalsIntro],
        ["agency.proposalsNone", w.chat.agencyProposalsNone],
        ["agency.rosterEmpty", w.chat.agencyRosterEmpty],
        ["agency.proposeDone", w.chat.agencyProposeDone],
        ["agency.proposeFor", w.chat.chipProposeFor],
        ["agency.rosterWorker", w.forms.fields.rosterWorker],
        ["agency.noteLabel", w.forms.fields.inviteNote],
        ["agency.notePlaceholder", w.forms.fields.proposalNotePlaceholder],
      ];
      for (const [k, v] of pairs) expect(block, `${locale} ${k}`).toContain(`"${k}": ${JSON.stringify(v)}`);
    }
  });
});
