import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HELP_REQUEST_TYPES,
  HELP_NOTE_MAX,
} from "@/lib/help/help-request-model";
import { HELP_EXPLANATIONS_LT } from "@/lib/help/help-explanations-lt";

/**
 * WAGON 10 guard (CR train areas 18+19) — typed internal help requests.
 *
 * Pins the owner rules:
 *   - a CTA creates a REAL internal record (customer_requests via the gated
 *     submit_help_request_v1 RPC) — and NOTHING else: no email / SMS /
 *     Telegram / webhook / outbound call anywhere in the help layer;
 *   - no payment, no checkout;
 *   - honesty: the success copy promises only a HUMAN review — never an
 *     assigned specialist, never legal/accounting advice;
 *   - help rows live at status 'in_review' so they can NEVER surface on the
 *     agency/worker demand projections (which read status='submitted');
 *   - LT-first: legal/accounting/document explanations exist in Lithuanian
 *     ONLY (leak probes on en/ru catalogs); other locales see the pending
 *     notice;
 *   - reuse, not duplication: the record type is the EXISTING intake table;
 *     the admin queue is a SECTION of the EXISTING sales-intake panel; the
 *     follow-up action is the EXISTING §8.13 action.
 */
const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Doctrine headers legitimately NAME banned things ("no Telegram", "not
 *  submit_demand_request") — bans scan CODE with comments stripped. */
function stripTsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
function stripSqlComments(src: string): string {
  return src.replace(/^\s*--.*$/gm, "");
}

const migration = readFileSync(
  join(REPO, "supabase", "migrations", "20260705260000_help_request_intake.sql"),
  "utf8",
);
const actions = read("lib/help/help-request-actions.ts");
const panel = read("components/app/help-request-panel.tsx");
const explanations = read("lib/help/help-explanations-lt.ts");
const intakeLib = read("lib/sales/lead-intake.ts");
const intakePanel = read("components/app/sales-intake-panel.tsx");
const companyPage = read("app/[locale]/dashboard/company/page.tsx");

describe("closed help-type set, mirrored app ↔ DB", () => {
  it("exactly the five owner-specified types", () => {
    expect([...HELP_REQUEST_TYPES]).toEqual([
      "recruiter",
      "accounting",
      "legal",
      "documents",
      "demand_filling",
    ]);
  });
  it("the RPC validates every type and rejects others", () => {
    for (const t of HELP_REQUEST_TYPES) {
      expect(migration).toContain(`when '${t}'`);
    }
    expect(migration).toMatch(/invalid_help_type/);
  });
  it("note cap mirrored (500)", () => {
    expect(HELP_NOTE_MAX).toBe(500);
    expect(migration).toMatch(/char_length\(v_note\) > 500/);
  });
});

describe("migration is additive and board-safe", () => {
  it("new-name RPC only — no table, no policy change, no recreate of existing objects", () => {
    const sql = stripSqlComments(migration);
    expect(sql).toMatch(/create or replace function public\.submit_help_request_v1/);
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(sql).not.toMatch(/submit_demand_request|save_demand_draft|create_follow_up_task/);
  });
  it("inserts at status 'in_review' — invisible to the submitted-only demand projections", () => {
    expect(migration).toMatch(/'in_review'/);
    expect(migration).not.toMatch(/'submitted'\s*\)/);
  });
  it("grant to authenticated, never anon; ownership + abuse cap enforced", () => {
    expect(migration).toMatch(/grant execute on function\s+public\.submit_help_request_v1\(text, text, uuid\) to authenticated/);
    expect(migration).not.toMatch(/to anon/i);
    expect(migration).toMatch(/demand_not_owned/);
    expect(migration).toMatch(/too_many_open/);
  });
});

describe("no external sending, no payments (by construction)", () => {
  const BANNED = /sendgrid|nodemailer|smtp|twilio|telegram|webhook|fetch\(\s*["']http|stripe|checkout|payment/i;
  it("help action layer", () => {
    expect(stripTsComments(actions)).not.toMatch(BANNED);
    expect(stripTsComments(panel)).not.toMatch(BANNED);
    expect(stripTsComments(explanations)).not.toMatch(BANNED);
  });
  it("migration", () => {
    expect(stripSqlComments(migration)).not.toMatch(
      /http|smtp|telegram|webhook|stripe|payment/i,
    );
  });
  it("the only write is the gated RPC", () => {
    expect(actions).toMatch(/rpc\(\s*\n?\s*"submit_help_request_v1"/);
    expect(actions).not.toMatch(/\.from\("customer_requests"\)\s*\.\s*(insert|update|upsert|delete)/);
  });
});

describe("honesty — human review, no fake assignment", () => {
  it("success copy promises a human review, never an assigned specialist", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const h = JSON.parse(read(`messages/${loc}.json`)).helpRequests;
      expect(typeof h.sentBody).toBe("string");
      const lower = (h.sentBody as string).toLowerCase();
      expect(
        /priskiriamas automatiškai|assigned automatically|назначается автоматически/.test(
          lower,
        ),
        `${loc} sentBody must state no automatic assignment`,
      ).toBe(true);
    }
  });
  it("panel renders the honest internal-record note and not-ready state", () => {
    expect(panel).toMatch(/data-testid="help-request-sent"/);
    expect(panel).toMatch(/internalNote/);
    expect(panel).toMatch(/notReady/);
  });
});

describe("LT-first — explanations are Lithuanian master only", () => {
  it("every help type has an LT explanation with conservative honesty", () => {
    for (const t of HELP_REQUEST_TYPES) {
      const body = HELP_EXPLANATIONS_LT[t];
      expect(typeof body === "string" && body.length > 40, t).toBe(true);
      expect(/peržiūrės žmogus/i.test(body), `${t} human-review wording`).toBe(true);
    }
    // Legal/accounting explicitly disclaim advice.
    expect(HELP_EXPLANATIONS_LT.legal).toMatch(/neteikia teisinių konsultacijų/i);
    expect(HELP_EXPLANATIONS_LT.accounting).toMatch(/nėra buhalterinė konsultacija/i);
  });
  it("no LT explanation text leaked into EN/RU catalogs", () => {
    const fragments = [
      "neteikia teisinių konsultacijų",
      "nėra buhalterinė konsultacija",
      "kokių dokumentų gali reikėti jūsų situacijoje",
    ];
    for (const loc of ["en", "ru"] as const) {
      const base = read(`messages/${loc}.json`);
      for (const f of fragments) {
        expect(base.includes(f), `${loc}.json leaked "${f}"`).toBe(false);
      }
    }
  });
  it("panel splits by locale: LT explanation vs pending notice", () => {
    expect(panel).toMatch(/locale === "lt"/);
    expect(panel).toMatch(/data-testid="help-request-explanation-pending"/);
  });
});

describe("reuse, not duplication", () => {
  it("company workspace renders the panel (room separation honoured)", () => {
    expect(companyPage).toMatch(/<HelpRequestPanel demandOptions=\{\[\]\} \/>/);
    // Buyer-room reads stay out of the company room (room-separation guard).
    expect(companyPage).not.toMatch(/listOwnCustomerRequests/);
  });
  it("admin queue is a section of the EXISTING sales-intake panel reusing the follow-up action", () => {
    expect(intakePanel).toMatch(/data-testid="intake-help-requests"/);
    expect(intakePanel).toMatch(/followUpButton\("help_request"/);
    expect(intakeLib).toMatch(/readHelpRequests/);
    // Demand queue stays demand-only; help rows have their own section.
    expect(intakeLib).toMatch(/\.is\("payload->>help_type", null\)/);
    expect(intakeLib).toMatch(/\.not\("payload->>help_type", "is", null\)/);
  });
  it("i18n keys present with parity (lt/en/ru)", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const h = m.helpRequests;
      for (const k of [
        "title",
        "intro",
        "noteLabel",
        "demandContextLabel",
        "demandContextNone",
        "submit",
        "submitting",
        "sentTitle",
        "sentBody",
        "errorGeneric",
        "notReady",
        "tooManyOpen",
        "noteTooLong",
        "internalNote",
        "explanationPending",
      ]) {
        expect(typeof h?.[k] === "string" && h[k].length > 0, `${loc} ${k}`).toBe(true);
      }
      for (const t of HELP_REQUEST_TYPES) {
        expect(typeof h.types?.[t] === "string", `${loc} types.${t}`).toBe(true);
        expect(
          typeof m.salesIntake?.helpTypes?.[t] === "string",
          `${loc} salesIntake.helpTypes.${t}`,
        ).toBe(true);
      }
      expect(typeof m.salesIntake?.helpRequestsHeading === "string").toBe(true);
      expect(typeof m.salesIntake?.helpDemandRef === "string").toBe(true);
    }
  });
});
