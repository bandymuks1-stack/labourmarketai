import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Account space clarity + public copy cleanup guard (v1).
 *
 * Public client-facing account/buyer surfaces must NOT expose internal
 * DB/RPC/schema language, must not present a private buyer as an organization
 * setup, must use specialist/team (not "darbuotojas") in generic buyer copy,
 * and must never use abstract "kas esu operacijoje" identity framing. The
 * mobile profile-explanation card must stack (not collapse into narrow columns).
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));

// Internal implementation terms that must never reach buyer/account UI.
const TECH = [
  /public\.\w/,
  /save_customer_setup/,
  /save_customer_request/,
  /\bRPC\b/,
  /idempotent/i,
  /contact_name/,
  /apply_migration/,
  /Supabase SQL/,
  /production DB/,
  /\bRLS\b/,
];

describe("buyer surface exposes no internal DB/RPC/schema text", () => {
  for (const [name, json] of [["lt", lt], ["en", en]] as const) {
    const buyer = JSON.stringify(json.roleDashboards.buyer);
    for (const re of TECH) {
      it(`${name} roleDashboards.buyer has no ${re}`, () => {
        expect(buyer).not.toMatch(re);
      });
    }
  }
});

describe("buyer copy does not look like an organization setup", () => {
  const ORG = ["Jūsų organizacija", "Įmonės duomenys", "Registracijos kodas"];
  for (const [name, json] of [["lt", lt], ["en", en]] as const) {
    const buyer = JSON.stringify(json.roleDashboards.buyer);
    for (const phrase of ORG) {
      it(`${name} buyer copy has no "${phrase}"`, () => {
        expect(buyer).not.toContain(phrase);
      });
    }
  }
});

describe("generic buyer marketplace copy uses specialist/team, not 'darbuotojas'", () => {
  it("LT roleDashboards.buyer has no 'darbuotoj' (no employer-style worker request)", () => {
    expect(JSON.stringify(lt.roleDashboards.buyer)).not.toMatch(/darbuotoj/i);
  });
});

describe("no abstract 'kas esu operacijoje' identity framing anywhere", () => {
  for (const [name, json] of [["lt", lt], ["en", en]] as const) {
    it(`${name} messages contain no "kas esu operacijoje"`, () => {
      expect(JSON.stringify(json).toLowerCase()).not.toContain("kas esu operacijoje");
    });
  }
});

describe("mobile profile-explanation card stacks (no collapsing columns)", () => {
  const card = read("components/app/profile-cv-clarity-card.tsx");
  it("rows are flex-col on mobile, flex-row only at sm+", () => {
    expect(card).toMatch(/flex flex-col[^"]*sm:flex-row/);
  });
  it("clarity bodies are short product copy (≤ ~140 chars), not long explanations", () => {
    for (const json of [lt, en]) {
      for (const k of Object.keys(json.profileCvClarity.step)) {
        const body = json.profileCvClarity.step[k].body as string;
        expect(body.length, `profileCvClarity.step.${k}.body too long`).toBeLessThanOrEqual(140);
      }
    }
  });
});

describe("buyer setup replacement copy is human, saved-to-account language", () => {
  it("LT formSubtitle / newRequestSubtitle are account-friendly", () => {
    const setup = lt.roleDashboards.buyer.setup;
    expect(setup.formSubtitle).toMatch(/saugomi jūsų paskyroje/);
  });
  it("EN equivalents are account-friendly", () => {
    expect(en.roleDashboards.buyer.setup.formSubtitle).toMatch(/saved to your account/);
  });
});
