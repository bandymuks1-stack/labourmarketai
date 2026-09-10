import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the roster is READ BACK, and the chat door to it tells the truth.
 *
 * `organization_people` could be written and never read. The import panel's
 * only evidence was an in-memory receipt that died on the next page load, and
 * the single consumer of `listRosterPeople` anywhere in the app built
 * `<select>` options inside the EVIDENCE importer — and only once a staged
 * evidence session existed. A manager could bring forty people in and, one
 * refresh later, have no way to see that anything had happened.
 *
 * The chat door had the opposite shape: the ROUTE was already correct and the
 * WORDS were wrong. Both branches shared one sentence (which named the
 * work-evidence import) and one chip label, `documentsChip` ("My documents").
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(APP_ROOT, ...p), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msgs = (loc: string): any => JSON.parse(read("messages", `${loc}.json`));

describe("the roster has a reader", () => {
  const section = read("components", "app", "organization-roster-section.tsx");

  it("composes the SAME core read the MCP capability uses", () => {
    expect(section).toMatch(/from "@\/lib\/organization-evidence\/import-core"/);
    expect(section).toMatch(/listRosterPeople\(/);
    // Never a second query against the table behind the core's back.
    expect(section).not.toMatch(/\.from\("organization_people"\)/);
  });

  it("settles the acting organization BEFORE reading a single row", () => {
    const resolveAt = section.indexOf("resolveEvidenceOrganization(");
    const readAt = section.indexOf("listRosterPeople(");
    expect(resolveAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(resolveAt);
  });

  it("is mounted on the company workspace, not reachable by URL alone", () => {
    const page = read("app", "[locale]", "dashboard", "company", "page.tsx");
    expect(page).toMatch(/import \{ OrganizationRosterSection \}/);
    expect(page).toMatch(/<OrganizationRosterSection locale=\{locale\} \/>/);
  });

  it("keeps a failed read distinct from an empty roster (SEP-7)", () => {
    // Each refusal class keeps its own message; none of them may be rendered
    // as "this organization has nobody".
    for (const reason of [
      "needsMigration",
      "chooseOrganization",
      "notAuthorized",
      "unavailable",
      "personalWorkspace",
    ]) {
      expect(section).toContain(reason);
    }
    // The empty state is only reachable after `kind === "ok"`.
    const okAt = section.indexOf('res.kind !== "ok"');
    const emptyAt = section.indexOf("res.people.length === 0");
    expect(okAt).toBeGreaterThan(-1);
    expect(emptyAt).toBeGreaterThan(okAt);
  });

  it("shows no profile, journal, skill or contact data", () => {
    // Comments stripped: the doc block names these fields precisely because
    // it is explaining what the section refuses to read.
    const code = section.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const forbidden of [
      "worker_skills",
      "journal",
      "profile_text",
      "invited_email",
      "full_name",
    ]) {
      expect(code, `${forbidden} reached the roster section`).not.toContain(forbidden);
    }
  });

  it("falls back to the most conservative link state, never a stronger claim", () => {
    expect(section).toMatch(/LINK_STATES = new Set\(\["unlinked", "link_proposed", "linked"\]\)/);
    expect(section).toMatch(/LINK_STATES\.has\(raw\) \? raw : "unlinked"/);
  });
});

describe("the roster copy exists in every routed locale", () => {
  for (const loc of LOCALES) {
    it(`${loc}: the namespace, its link states and all eight refusal reasons`, () => {
      const ns = msgs(loc).organizationRoster;
      expect(ns, `organizationRoster missing in ${loc}.json`).toBeTruthy();
      for (const k of [
        "title",
        "intro",
        "actingFor",
        "count",
        "truncated",
        "empty",
        "emptyAction",
        "meaning",
      ]) {
        expect(typeof ns[k] === "string" && ns[k].trim().length > 0, `${k} in ${loc}`).toBe(true);
      }
      expect(Object.keys(ns.linkState).sort()).toEqual(["link_proposed", "linked", "unlinked"]);
      expect(Object.keys(ns.context).sort()).toEqual([
        "chooseOrganization",
        "needsMigration",
        "noOrganization",
        "notAMember",
        "notAuthorized",
        "personalWorkspace",
        "unauthenticated",
        "unavailable",
      ]);
    });

    it(`${loc}: says a roster name is not an account and not consent`, () => {
      // The one sentence that keeps `organization_people` from reading as a
      // list of platform users. Its absence is the defect this pins.
      expect(msgs(loc).organizationRoster.meaning.length).toBeGreaterThan(40);
    });

    it(`${loc}: the canonical relationship vocabulary carries candidate`, () => {
      // `candidate` reached the database CHECK on 2026-09-10 and never
      // reached the label map, so a roster row carrying it had no word.
      const rel = msgs(loc).evidenceImport.relationship;
      expect(typeof rel.candidate === "string" && rel.candidate.trim().length > 0).toBe(true);
      expect(rel.employee, "the canonical map, not another namespace").toBeTruthy();
      // Negative control: it must NOT have landed in the worklog vocabulary,
      // which a loose anchor hit on the first attempt.
      expect(msgs(loc).conversation.chat).toBeTruthy();
      expect(msgs(loc).conversation.worklog.relationship.candidate).toBeUndefined();
    });
  }
});

describe("the chat door names the place it actually opens", () => {
  const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");

  it("sends a workforce table to the people importer with its OWN sentence and chip", () => {
    const branch = chat.slice(chat.indexOf('intent.kind === "workforce_table"'));
    expect(branch).toMatch(/t\("fileOrgPeople"\)/);
    expect(branch).toMatch(/link:\/dashboard\/company#people-import-section/);
    expect(branch).toMatch(/labels\.chipPeopleImport/);
  });

  it("no longer labels the people importer as the documents centre", () => {
    // The exact regression: one chip label served both destinations.
    const peopleAt = chat.indexOf("link:/dashboard/company#people-import-section");
    expect(peopleAt).toBeGreaterThan(-1);
    const window = chat.slice(peopleAt, peopleAt + 200);
    expect(window).not.toContain("documentsChip");
  });

  it("keeps the evidence branch pointing at the evidence import", () => {
    const evidenceAt = chat.indexOf("link:/dashboard/company#evidence-import");
    expect(evidenceAt).toBeGreaterThan(-1);
    expect(chat.slice(evidenceAt - 400, evidenceAt)).toMatch(/t\("fileOrgEvidence"\)/);
  });

  it("registers the new chip so the label is really resolved", () => {
    expect(read("components", "app", "conversation", "chat", "labels.ts")).toMatch(
      /"chipPeopleImport"/,
    );
  });

  for (const loc of LOCALES) {
    it(`${loc}: the people sentence is its own, and does not name work evidence`, () => {
      const c = msgs(loc).conversation.chat;
      expect(typeof c.fileOrgPeople === "string" && c.fileOrgPeople.length > 40).toBe(true);
      expect(c.fileOrgPeople).not.toBe(c.fileOrgEvidence);
      expect(typeof c.chipPeopleImport === "string" && c.chipPeopleImport.trim().length > 0).toBe(
        true,
      );
      expect(c.chipPeopleImport).not.toBe(c.documentsChip);
    });
  }
});
