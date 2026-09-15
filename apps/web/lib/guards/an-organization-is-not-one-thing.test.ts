import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  companyTracks,
  UNKNOWN_FACTS,
  type CapabilityTrack,
  type StarterSignals,
} from "@/lib/conversation/starters";
import { capabilityContextOf, resolveCapabilityAnswer } from "@/lib/conversation/capability-answer";
import { classifyIntent } from "@/lib/conversation/intent-router";
import { CAPABILITY_CHOICES } from "@/lib/organizations/capability-choices";
import { ORGANIZATION_ROLES } from "@/lib/product-gate/organization-roles";
import { COMPANY_TYPES } from "@/lib/company/company-profile-shared";

/**
 * AN ORGANIZATION IS NOT EXACTLY ONE THING (owner walkthrough E + F + G).
 *
 * ── WHAT PRODUCTION ACTUALLY HELD, 2026-09-10 ──────────────────────────────
 * `organization_roles` is applied and IN USE: 15 rows over 14 organizations —
 * `employer` (10), `workforce_provider` (3), `training_provider` (2), with at
 * least one organization holding two at once. Multi-capability is not a
 * proposal; it is live data.
 *
 * Meanwhile `companies.company_type` held `construction` (6),
 * `staffing_agency` (4) and `other` (4): ONE exclusive field mixing a SECTOR
 * with a RELATIONSHIP. And `companyTracks` read exactly ONE of the ten
 * capabilities (`training_provider`), took "is this an agency?" from the
 * legacy column instead, and assumed `employer` for everyone.
 *
 * So a construction firm that also supplies people had to pick one value,
 * picked `construction`, and was then framed as a plain employer with its
 * agency work invisible — E — while nine of its ten possible declared roles
 * changed nothing at all — F.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const org = (over: Partial<StarterSignals> = {}): StarterSignals => ({
  identity: "company",
  capabilities: [],
  staffingAgency: false,
  educationFirst: false,
  facts: UNKNOWN_FACTS,
  learnerLinked: false,
  ...over,
});

const outcomesOf = (s: StarterSignals): string[] => {
  const a = resolveCapabilityAnswer(s, "Acme");
  if (a.kind !== "outcomes") throw new Error("expected outcomes");
  return a.outcomes.map((o) => o.key);
};

describe("E — an agency is recognised as an agency", () => {
  it("THE PRODUCTION DEFECT: a construction firm that also supplies people", () => {
    // company_type = construction (so the legacy agency flag is FALSE), but
    // the capability rows say it supplies workforce. Before this it was a
    // plain employer with its agency work invisible.
    const both = org({ capabilities: ["employer", "workforce_provider"], staffingAgency: false });
    expect(capabilityContextOf(both), "framed as a generic employer").toBe("agency");
    expect(companyTracks(both)[0]).toBe("agency");
    expect(outcomesOf(both).some((k) => k.startsWith("agency"))).toBe(true);
  });

  it("all three people-supplying roles mean agency, not just one column", () => {
    for (const role of ["workforce_provider", "talent_provider", "recruitment_partner"]) {
      const s = org({ capabilities: [role] });
      expect(capabilityContextOf(s), `${role} was not read as an agency`).toBe("agency");
    }
  });

  it("the LEGACY column still means agency — neither source is dropped", () => {
    // Production carries four `staffing_agency` companies and three
    // `workforce_provider` organizations. Reading either alone erases a real
    // agency, so the rule is a UNION.
    expect(capabilityContextOf(org({ staffingAgency: true }))).toBe("agency");
    expect(capabilityContextOf(org({ capabilities: ["workforce_provider"] }))).toBe("agency");
  });

  it("agency framing does NOT erase the other tracks", () => {
    const s = org({ capabilities: ["employer", "workforce_provider"] });
    const tracks = companyTracks(s);
    expect(tracks[0]).toBe("agency");
    expect(tracks, "the employer track was erased by agency framing").toContain("employer");
    expect(tracks).toContain("operations");
    // …and the outcomes actually MIX rather than being three agency lines.
    const families = new Set(
      outcomesOf(s).map((k) =>
        k.startsWith("agency") ? "agency" : k.startsWith("ops") ? "ops" : k.startsWith("edu") ? "edu" : "employer",
      ),
    );
    expect(families.size).toBeGreaterThan(1);
  });

  it('"Ką gali mūsų agentūra?" reaches the capability answer, in five locales', () => {
    for (const s of [
      "Ką gali mūsų agentūra?",
      "What can our agency do?",
      "Что может наше агентство?",
      "Wat kan ons bureau doen?",
      "Was kann unsere Agentur?",
    ]) {
      expect(classifyIntent(s).intent, `"${s}"`).toBe("capabilities");
    }
  });
});

describe("F — relationships are not exclusive", () => {
  it("an organization may hold several capabilities at once and each is read", () => {
    const many = org({
      capabilities: ["employer", "recruitment_partner", "training_provider", "project_operator"],
    });
    const tracks = companyTracks(many);
    expect(new Set(tracks).size).toBe(tracks.length);
    for (const expected of ["agency", "employer", "operations", "education"] as CapabilityTrack[]) {
      expect(tracks, `${expected} missing from a four-capability organization`).toContain(expected);
    }
  });

  it("EVERY self-declarable capability is one the model really has", () => {
    // No capability may be offered to a human that the role registry does not
    // contain — that would be a promise the product cannot keep.
    for (const choice of CAPABILITY_CHOICES) {
      expect(
        (ORGANIZATION_ROLES as readonly string[]).includes(choice.slug as string),
        `${choice.slug} is offered but is not an owner-named role`,
      ).toBe(true);
    }
    expect(CAPABILITY_CHOICES.length).toBeGreaterThan(1);
  });

  it("the capability screen is many-valued, and never a single choice", () => {
    const CARD = read("components/app/organization-capabilities-card.tsx");
    expect(CARD).toContain("partitionCapabilities");
    // A radio group here would rebuild the single-value trap.
    expect(CARD, "the capability screen uses a single-choice control").not.toMatch(
      /type="radio"/,
    );
  });
});

describe("B — nothing was made harder to reach (architecture review question B)", () => {
  it("employer and operations stay UNIVERSAL", () => {
    // A first draft gated `employer` on the declared role. A school or an
    // agency may perfectly well hire, and the previous behaviour let them;
    // removing that is an architecture regression, not extra honesty.
    for (const s of [
      org({ capabilities: ["workforce_provider"] }),
      org({ capabilities: ["training_provider"], educationFirst: true }),
      org({ capabilities: ["client"] }),
      org({ capabilities: [] }),
    ]) {
      const tracks = companyTracks(s);
      expect(tracks, "an organization lost the employer track").toContain("employer");
      expect(tracks, "an organization lost the operations track").toContain("operations");
    }
  });

  it("an UNKNOWN capability read keeps the previous shape", () => {
    expect(companyTracks(org({ capabilities: [] }))).toEqual(["employer", "operations"]);
  });
});

describe("G — activity and relationship are different axes", () => {
  it("the industry list and the capability list are separate vocabularies", () => {
    const industries = new Set(COMPANY_TYPES as readonly string[]);
    const capabilities = new Set(CAPABILITY_CHOICES.map((c) => c.slug as string));
    // They may overlap in MEANING (a staffing agency is an industry value and
    // a capability) but they must not be the same list, or the single-value
    // trap comes back.
    expect([...capabilities].some((c) => industries.has(c))).toBe(false);
  });

  it("the setup help says the industry does not decide what the organization DOES", () => {
    // Choosing "construction" used to read as "you are not an agency": the
    // help named only the per-need role and never the capability question.
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const help = (
        JSON.parse(read(join("messages", `${locale}.json`))) as {
          roleDashboards: { company: { setup: Record<string, string> } };
        }
      ).roleDashboards.company.setup.companyTypeHelp;
      expect(help, `${locale} help missing`).toBeTruthy();
      expect(help.length, `${locale} help is too short to explain the axes`).toBeGreaterThan(80);
      // It must not promise a control that is not on that page.
      expect(help, `${locale} points at the wrong page`).not.toMatch(
        /this page|šiame puslapyje|этой странице|deze pagina|dieser Seite/i,
      );
    }
  });

  it("existing industry values stay valid — nothing was removed", () => {
    // 6 construction + 4 staffing_agency + 4 other are live rows. Removing an
    // option would orphan them.
    for (const t of ["construction", "staffing_agency", "other", "subcontractor", "client_customer"]) {
      expect(COMPANY_TYPES as readonly string[]).toContain(t);
    }
  });
});

describe("capability is not authorization", () => {
  it("nothing in the track derivation grants anything", () => {
    const STARTERS = read("lib/conversation/starters.ts");
    for (const forbidden of ["grant", "authorize", "canAct", ".rpc(", ".insert(", "supabase"]) {
      expect(STARTERS, `${forbidden} in a pure derivation`).not.toContain(forbidden);
    }
  });

  it("C still holds — an agency capability does not make a candidate CV the uploader's", () => {
    // Reading an organization as an agency must not open a door C closed.
    const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
    const file = CHAT.indexOf("const fileIntent = readFileIntent(sent);");
    const reading = CHAT.indexOf("const reading = understand(sent);");
    expect(file).toBeGreaterThan(-1);
    expect(file).toBeLessThan(reading);
  });
});
