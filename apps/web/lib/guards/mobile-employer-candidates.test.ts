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
    expect(screen).toContain('useCapability<DemandListData>("demand.list")');
    expect(screen).toContain('useCapability<CandidateSearchData>("candidate.search", args)');
    expect(screen).toContain('name: "shortlist.add_draft"');
    expect(screen).toContain('name: "shortlist.add_confirm"');
    expect(screen).not.toMatch(/supabase\s*\.\s*from\(/);
  });

  it("confirms with the draft's own fields and token", () => {
    expect(screen).toMatch(/args: \{ \.\.\.fields, confirmationToken: token \}/);
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
