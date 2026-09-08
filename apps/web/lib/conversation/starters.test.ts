import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  STARTER_CAP,
  UNKNOWN_FACTS,
  capabilityPhraseKeys,
  companyTracks,
  deriveStarters,
  type CompanyStarterFacts,
  type StarterSignals,
} from "./starters";

/**
 * STARTERS ARE SUGGESTIONS, NOT A ROLE MENU (owner contract 2026-09-04 §5–§6).
 *
 * The named production drift: the real recruiter's workspace — a staffing
 * agency that ALSO holds open needs, a roster and projects — opened with three
 * agency chips only. These tests pin the repair: a company with several
 * capabilities sees a MIX, one next real step per track, capped at three,
 * and a degraded read never invents a step.
 */

const facts = (over: Partial<CompanyStarterFacts> = {}): CompanyStarterFacts => ({
  ...UNKNOWN_FACTS,
  ...over,
});

const company = (over: Partial<StarterSignals> = {}): StarterSignals => ({
  identity: "company",
  capabilities: ["employer"],
  staffingAgency: false,
  educationFirst: false,
  facts: facts(),
  learnerLinked: false,
  ...over,
});

const ids = (s: StarterSignals) => deriveStarters(s).map((c) => c.id);

describe("the real recruiter's workspace (agency + needs + roster + projects)", () => {
  // Production facts of "Labour market ai Sp. z o.o" on 2026-09-04: staffing
  // agency, 8 demands, 1 roster worker, 0 client connections, projects.
  const real = company({
    capabilities: ["workforce_provider"],
    staffingAgency: true,
    facts: facts({
      openDemands: 8,
      roster: 1,
      projects: 2,
      clientConnectionsActive: 0,
      clientConnectionsPending: 0,
      sharedRequests: 0,
      proposals: 0,
    }),
  });

  it("opens with a MIX — the agency's first step, the employer's candidates, the running work", () => {
    expect(ids(real)).toEqual(["f:agency.invite-client", "candidates", "projects"]);
  });

  it("is never three agency chips", () => {
    const agencyIds = new Set(["f:agency.invite-client", "agency:demand", "agency:progress"]);
    const onlyAgency = ids(real).every((id) => agencyIds.has(id));
    expect(onlyAgency).toBe(false);
  });

  it("describes ALL its capabilities in the not-understood answer", () => {
    expect(capabilityPhraseKeys(real)).toEqual([
      "capPhraseClients",
      "capPhraseNeedWorkers",
      "capPhraseCandidates",
      "capPhraseProjects",
    ]);
  });
});

describe("the agency chain advances with its state", () => {
  const agency = (over: Partial<CompanyStarterFacts>) =>
    company({ staffingAgency: true, facts: facts({ openDemands: 0, roster: 0, ...over }) });

  it("no client yet → invite a client first", () => {
    expect(ids(agency({ clientConnectionsActive: 0, clientConnectionsPending: 0 }))[0]).toBe(
      "f:agency.invite-client",
    );
  });
  it("a client shared a need and nobody was proposed → the client's needs first", () => {
    expect(ids(agency({ clientConnectionsActive: 1, sharedRequests: 2, proposals: 0 }))[0]).toBe(
      "agency:demand",
    );
  });
  it("proposals exist → their status first", () => {
    expect(ids(agency({ clientConnectionsActive: 1, sharedRequests: 2, proposals: 1 }))[0]).toBe(
      "agency:progress",
    );
  });
  it("an empty pool surfaces the candidate invitation as the operations step", () => {
    expect(ids(agency({ clientConnectionsActive: 0, clientConnectionsPending: 0 }))).toContain(
      "f:company.invite-worker",
    );
  });
});

describe("a plain employer", () => {
  it("with no open need is asked to describe one; with needs, sees the people who answered", () => {
    expect(ids(company({ facts: facts({ openDemands: 0 }) }))[0]).toBe("f:company.create-demand");
    expect(ids(company({ facts: facts({ openDemands: 3 }) }))[0]).toBe("candidates");
  });
  it("keeps the canonical employer starts (question B — no narrowing)", () => {
    const got = ids(company({ facts: facts({ openDemands: 0, projects: 1 }) }));
    expect(got).toEqual(["f:company.create-demand", "projects", "candidates"]);
  });
});

describe("education", () => {
  it("an education-first institution starts with its learners, then programmes, and still sees its needs", () => {
    const school = company({
      capabilities: ["training_provider"],
      educationFirst: true,
      facts: facts({ learnersActive: 0, programmes: 0, openDemands: 0 }),
    });
    const got = ids(school);
    expect(got[0]).toBe("link:/dashboard/network?relationship=student");
    expect(got).toContain("f:company.create-demand");
    expect(got.length).toBe(STARTER_CAP);
  });
  it("a school that ALSO employs keeps the employer first and the education track present", () => {
    const dual = company({
      capabilities: ["employer", "training_provider"],
      educationFirst: false,
      facts: facts({ learnersActive: 4, programmes: 0, openDemands: 1 }),
    });
    expect(companyTracks(dual)).toEqual(["employer", "operations", "education"]);
    expect(ids(dual)).toContain("link:/dashboard/company#institution-programs-title");
    expect(capabilityPhraseKeys(dual)).toContain("capPhraseLearners");
  });
});

describe("honesty and the cap", () => {
  it("degraded reads (null) never invent a step — the capability's plain entry stands", () => {
    const got = ids(company({ staffingAgency: true }));
    expect(got).toEqual(["f:agency.invite-client", "f:company.create-demand", "projects"]);
  });
  it("never more than three, never a duplicate id", () => {
    const combos: StarterSignals[] = [
      company(),
      company({ staffingAgency: true, capabilities: ["employer", "training_provider"], educationFirst: false }),
      company({ facts: facts({ openDemands: 5, projects: 5, roster: 5 }) }),
      { ...company(), identity: "person" },
      { ...company(), identity: "person", learnerLinked: true },
    ];
    for (const s of combos) {
      const got = ids(s);
      expect(got.length).toBeLessThanOrEqual(STARTER_CAP);
      expect(new Set(got).size).toBe(got.length);
    }
  });
  it("a person keeps the worker starts; a linked learner's first suggestion is the compass", () => {
    expect(ids({ ...company(), identity: "person" })).toEqual(["logwork", "cv", "jobs"]);
    expect(ids({ ...company(), identity: "person", learnerLinked: true })[0]).toBe(
      "link:/dashboard/profile#learning-compass",
    );
    expect(capabilityPhraseKeys({ ...company(), identity: "person" })).toEqual([]);
  });
});

describe("every starter id is an existing chat action, and the phrases exist in every catalog", () => {
  const APP = join(__dirname, "..", "..");
  const CHAT = readFileSync(
    join(APP, "components", "app", "conversation", "chat", "conversation-chat.tsx"),
    "utf8",
  );
  const SRC = readFileSync(join(__dirname, "starters.ts"), "utf8");

  it("chip ids resolve inside `handleChip` (no dead suggestion)", () => {
    const literal = [...SRC.matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);
    expect(literal.length).toBeGreaterThan(8);
    for (const id of literal) {
      if (id.startsWith("link:")) continue; // routes are handled by the generic `link:` case
      if (id.startsWith("f:")) {
        expect(CHAT, id).toMatch(/chip\.id\.startsWith\("f:"\)/);
        continue;
      }
      expect(CHAT, id).toMatch(new RegExp(`case "${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    }
  });

  it("the composed fallback and every capability phrase exist in all 11 catalogs (no [EN] debt)", () => {
    const locales = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"];
    const keys = [
      "fallbackComposed",
      "workspaceIntro",
      "capPhraseNeedWorkers",
      "capPhraseCandidates",
      "capPhraseProjects",
      "capPhraseClients",
      "capPhraseLearners",
    ];
    for (const locale of locales) {
      const chat = JSON.parse(readFileSync(join(APP, "messages", `${locale}.json`), "utf8"))
        .conversation.chat as Record<string, string>;
      for (const key of keys) {
        expect(chat[key], `${locale}.${key}`).toBeTypeOf("string");
        expect(chat[key], `${locale}.${key}`).not.toMatch(/^\[EN\]/);
      }
      expect(chat.fallbackComposed).toContain("{list}");
      expect(chat.workspaceIntro).toContain("{company}");
    }
  });
});
