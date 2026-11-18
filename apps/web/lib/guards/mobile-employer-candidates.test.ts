/**
 * GUARD — the native app finds and shortlists candidates through the web
 * scouting page's own capabilities (owner order 2026-11-16: one shared client,
 * no parallel backend), shows only the anonymized preview, and labels the
 * match with the web's own words.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv"] as const;
const STATUSES = ["strong", "possible", "weak", "insufficient_data"] as const;

describe("mobile employer candidates", () => {
  const screen = read("apps/mobile/src/screens/candidates.tsx");

  it("reads and writes through the canonical capabilities only", () => {
    expect(screen).toContain('useCapability<DemandListData>("demand.list", WITH_CLOSED)');
    expect(screen).toContain('useCapability<CandidateSearchData>("candidate.search", args)');
    // add / remove — the web's own shortlist.{add,remove}_{draft,confirm} pairs.
    expect(screen).toContain('type ShortlistOp = "add" | "remove";');
    expect(screen).toContain("name: `shortlist.${op}_draft`");
    expect(screen).toContain("name: `shortlist.${op}_confirm`");
    expect(screen).not.toMatch(/supabase\s*\.\s*from\(/);
  });

  it("proposes a booking through the web's own prepare / confirm pair", () => {
    const booking = read("apps/mobile/src/screens/propose-booking.tsx");
    expect(booking).toContain('name: "company.propose-booking.prepare"');
    expect(booking).toContain('name: "company.propose-booking.confirm"');
    // The prepare's own input, byte for byte, with its token.
    expect(booking).toContain("args: { input: prepared.input, confirmationToken: prepared.confirmationToken }");
    expect(booking).not.toMatch(/supabase\s*\.\s*from\(/);
    // Only for a candidate the scouting search says may be contacted.
    expect(screen).toMatch(/!candidate\.canContact \?/);
  });

  it("closes and reopens a need through demand.close_* / demand.reopen_*", () => {
    const lifecycle = read("apps/mobile/src/screens/need-lifecycle.tsx");
    expect(lifecycle).toContain("name: `demand.${op}_draft`");
    expect(lifecycle).toContain("name: `demand.${op}_confirm`");
    expect(lifecycle).toContain('const op = closed ? "reopen" : "close";');
    expect(lifecycle).toContain("args: { requestId: needId, confirmationToken: token }");
    expect(lifecycle).not.toMatch(/supabase\s*\.\s*from\(/);
  });

  it("confirms with the draft's own fields and token", () => {
    expect(screen).toMatch(/args: \{ \.\.\.fieldsFor\(op\), confirmationToken: token \}/);
  });

  it("takes someone off only with the reason the web requires (min 3 characters)", () => {
    expect(screen).toContain("reason: reason.trim()");
    expect(screen).toContain('op === "remove" && reason.trim().length < 3');
  });

  it("words 'not a fit' exactly as the web scouting page", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const web = JSON.parse(read(`apps/web/messages/${locale}.json`)).scouting;
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const block = messages.slice(start, messages.indexOf(locale === "en" ? "\n} as const;" : "\n};", start));
      const pairs: [string, string][] = [
        ["candidates.notFit", web.shortlist.not_fit],
        ["candidates.notFitReasonTitle", web.shortlistNote.reasonTitle],
        ["candidates.notFitReasonPlaceholder", web.shortlistNote.reasonPlaceholder],
        ["candidates.notFitReasonRequired", web.shortlistNote.reasonRequired],
      ];
      for (const [k, v] of pairs) expect(block, `${locale} ${k}`).toContain(`"${k}": ${JSON.stringify(v)}`);
    }
  });

  it("shows the anonymized label only — never a name or contact", () => {
    expect(screen).toContain("candidate.preview.anonymizedLabel");
    expect(screen).not.toMatch(/\.(fullName|full_name|email|phone|contact)\b/);
  });

  it("labels the match status with the web scouting page's own words", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const web = JSON.parse(read(`apps/web/messages/${locale}.json`)).scouting.status as Record<string, string>;
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const block = messages.slice(start, messages.indexOf("\n};", start));
      for (const s of STATUSES) {
        expect(block, `${locale} ${s}`).toContain(`"candidates.match.${s}": ${JSON.stringify(web[s])}`);
      }
    }
  });
});
