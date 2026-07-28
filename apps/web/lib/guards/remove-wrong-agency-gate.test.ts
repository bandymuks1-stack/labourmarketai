import { describe, expect, it } from "vitest";
import { isCanonicallyRedirected } from "./canonical-redirects";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Remove-wrong-agency-gate guard.
 *
 * labourmarket.ai is demand-first: agency setup gates ONLY the agency flow. A
 * user without a completed agency must not be dead-ended into the agency invite
 * form (whose only outcome is the "finish agency setup" error). They get a
 * neutral, honest role choice instead — and the candidate/provider draft path is
 * shown without creating any fake account / consent / verification.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");


const roleChoice = read("components/app/setup-role-choice.tsx");
const companyNext = read("components/app/company-next-actions.tsx");
const en = JSON.parse(read("messages/en.json")) as Record<string, unknown>;
const lt = JSON.parse(read("messages/lt.json")) as Record<string, unknown>;

describe("agency dashboard does not dead-end a user without an agency", () => {
  // Direction A (2026-07-05): the anti-dead-end concern is now solved one
  // level earlier — /dashboard/agency is a redirect stub into the canonical
  // company workspace, whose own no-profile path renders CompanyNoProfileGuide
  // (asserted below). No agency-only gate can dead-end anyone anymore.
  it("is a redirect stub to the canonical company workspace (no gate at all)", () => {
    // W1: the agency page no longer exists at all — the strongest possible
    // form of "it carries no agency-only gate". The URL still resolves.
    expect(isCanonicallyRedirected("/dashboard/agency", "/dashboard/company")).toBe(true);
  });
});

describe("neutral role choice offers the SIMPLE start paths", () => {
  // company-role-simplicity-v1: the start is two simple choices — work
  // yourself (worker) or represent a company. Agency / client are COMPANY
  // TYPES picked inside the canonical company profile, never start paths.
  it("links to worker + company routes and NEVER to an agency start path", () => {
    expect(roleChoice).toMatch(/\/dashboard\/start\/company/);
    expect(roleChoice).toMatch(/\/dashboard\/profile/); // offer own work
    expect(roleChoice).not.toMatch(/\/dashboard\/start\/agency/);
    expect(roleChoice).not.toMatch(/\/dashboard\/start\/buyer/);
    expect(roleChoice).toMatch(/setup-role-choice/);
  });
  it("shows the candidate/provider draft path honestly (no fake account)", () => {
    expect(roleChoice).toMatch(/candidate-draft-note/);
    expect(roleChoice).toMatch(/notRegistered/);
    expect(roleChoice).toMatch(/canLinkLater/);
  });
});

describe("copy is honest and context-aware (en + lt)", () => {
  const choice = (m: Record<string, unknown>) =>
    (m as { setupRoleChoice?: Record<string, unknown> }).setupRoleChoice ?? {};
  const agencyWorkers = (m: Record<string, unknown>) => {
    const rd = (m as { roleDashboards?: { agency?: { workers?: Record<string, string> } } })
      .roleDashboards;
    return rd?.agency?.workers ?? {};
  };

  it("the two simple start options exist in both locales (agency is a company type, not an option)", () => {
    for (const m of [en, lt]) {
      const opts = JSON.stringify((choice(m) as { options?: unknown }).options ?? {});
      expect(opts).toMatch(/representCompany/);
      expect(opts).toMatch(/offerWork/);
      expect(opts).not.toMatch(/representAgency/);
      expect(opts).not.toMatch(/findHuman/);
    }
  });

  it("draft copy never claims a real account/consent/verification was created", () => {
    const enDraft = JSON.stringify((choice(en) as { draft?: unknown }).draft ?? {}).toLowerCase();
    expect(enDraft).toMatch(/never a real account|no account, consent, or verification/);
    const ltDraft = JSON.stringify((choice(lt) as { draft?: unknown }).draft ?? {}).toLowerCase();
    expect(ltDraft).toMatch(/niekada nėra reali paskyra/);
  });

  it("statusNoAgency is now agency-context-specific, not a universal gate", () => {
    // Must mention agency explicitly (it only applies to the agency flow) ...
    expect((agencyWorkers(en) as { statusNoAgency?: string }).statusNoAgency).toMatch(/agency/i);
    expect((agencyWorkers(lt) as { statusNoAgency?: string }).statusNoAgency).toMatch(/agentūr/i);
    // ... and must NOT be the old universal "finish agency setup first" wording
    // that pointed every invite at /dashboard/start/agency.
    expect((agencyWorkers(en) as { statusNoAgency?: string }).statusNoAgency).not.toMatch(
      /\/dashboard\/start\/agency/,
    );
  });
});

describe("company / requester flows never require agency setup", () => {
  it("the company no-profile guide routes to company setup, not agency", () => {
    expect(companyNext).toMatch(/\/dashboard\/start\/company/);
    expect(companyNext).not.toMatch(/\/dashboard\/start\/agency/);
  });
});
