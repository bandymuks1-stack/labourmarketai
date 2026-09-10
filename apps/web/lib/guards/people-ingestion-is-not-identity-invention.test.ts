import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  INGEST_RELATIONSHIPS,
  MAX_PEOPLE_PER_BATCH,
  MAX_PEOPLE_PER_SESSION,
  peopleToCreate,
  planPeopleIngest,
} from "@/lib/organization-people/ingest-core";
import {
  MAX_ROWS_PER_SESSION,
  MAX_ROWS_PER_SUBMIT,
} from "@/lib/organization-evidence/source-rows";
import { personKey } from "@/lib/organization-evidence/person-matching";
import { personFromCvText } from "@/lib/organization-people/ingest-sources";

/**
 * BRINGING PEOPLE IN IS NOT INVENTING IDENTITIES.
 *
 * `organization_people` is the canonical ORGANIZATION ↔ PERSON relationship —
 * applied in production, and holding 0 rows because the evidence import READS
 * the roster and nothing ever populated it. This is the missing half, and
 * these are the rules it may not break.
 *
 * The worst failure available to the feature is writing one human's record
 * under another human's name. Every assertion below exists for that.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const CORE = read("lib/organization-people/ingest-core.ts");
const SOURCES = read("lib/organization-people/ingest-sources.ts");
const ACTIONS = read("lib/organization-people/ingest-actions.ts");
const WRITER = read("lib/organization-evidence/import-core.ts");

const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("no second people subsystem", () => {
  it("entity resolution is the EXISTING matcher, not a second opinion", () => {
    expect(CORE).toContain("@/lib/organization-evidence/person-matching");
    expect(CORE).toContain("matchPerson");
    expect(CORE).toContain("personKey");
    // No home-grown similarity anywhere.
    for (const invented of ["levenshtein", "similarity", "fuzzy", "soundex", "distance("]) {
      expect(code(CORE).toLowerCase(), `${invented} in the ingestion core`).not.toContain(invented);
    }
  });

  it("the bounds are the evidence import's, not re-chosen", () => {
    expect(MAX_PEOPLE_PER_BATCH).toBe(MAX_ROWS_PER_SUBMIT);
    expect(MAX_PEOPLE_PER_SESSION).toBe(MAX_ROWS_PER_SESSION);
  });

  it("the core is pure — it cannot write, read or call a model", () => {
    for (const forbidden of ["createClient", "supabase", ".insert(", ".rpc(", "runAiAgent", "fetch("]) {
      expect(code(CORE), `${forbidden} in a pure planner`).not.toContain(forbidden);
      expect(code(SOURCES), `${forbidden} in a pure parser adapter`).not.toContain(forbidden);
    }
  });

  it("the batch writer writes EXACTLY the columns the audited one-person writer does", () => {
    // `createRosterPerson` in import-core is the audited single-person path.
    // The batch path must not drift from it.
    const single = WRITER.slice(
      WRITER.indexOf("export async function createRosterPerson"),
      WRITER.indexOf("export async function createRosterPerson") + 2000,
    );
    const columns = [
      "organization_id",
      "display_name",
      "normalized_name",
      "external_ref",
      "relationship_kind",
      "source_note",
      "created_by",
      "link_state",
    ];
    for (const c of columns) {
      expect(single, `${c} missing from the one-person writer`).toContain(c);
      expect(ACTIONS, `${c} missing from the batch writer`).toContain(c);
    }
  });
});

describe("a person is never invented", () => {
  it("an ambiguity holds the ENTIRE batch — never 'commit the easy ones'", () => {
    const plan = planPeopleIngest({
      sources: [{ name: "Brand New" }, { name: "Jonas Petraitis" }],
      roster: [
        { id: "a", displayName: "Jonas Petraitis", normalizedName: personKey("Jonas Petraitis"), externalRef: null },
        { id: "b", displayName: "Jonas Petraitis", normalizedName: personKey("Jonas Petraitis"), externalRef: null },
      ],
      relationship: "employee",
    });
    if (plan.kind !== "plan") throw new Error("unreachable");
    expect(plan.needsReconciliation).toBe(true);
    expect(peopleToCreate(plan)).toHaveLength(0);
  });

  it("an unstated relationship commits nothing", () => {
    const plan = planPeopleIngest({
      sources: [{ name: "Jonas Petraitis" }],
      roster: [],
      relationship: null,
    });
    if (plan.kind !== "plan") throw new Error("unreachable");
    expect(peopleToCreate(plan)).toHaveLength(0);
  });

  it("a blank name never becomes a person", () => {
    const plan = planPeopleIngest({
      sources: [{ name: "  " }, { name: "…" }],
      roster: [],
      relationship: "employee",
    });
    if (plan.kind !== "plan") throw new Error("unreachable");
    expect(peopleToCreate(plan)).toHaveLength(0);
  });

  it("a CV whose name cannot be read yields NOTHING — the caller asks", () => {
    // BEHAVIOUR, not a string match. An earlier draft of this assertion
    // searched the source for a phrase, which proves nothing about what the
    // function does. Scanning past line one is how a heuristic files a person
    // under a job title — the exact bug an earlier draft of the adapter had,
    // returning "Software Engineer" as a human being.
    for (const text of [
      "CURRICULUM VITAE\nSoftware Engineer\nVilnius",
      "Gyvenimo aprašymas\nElektrikas",
      "РЕЗЮМЕ\nИнженер",
      "",
      "   \n\n  ",
    ]) {
      expect(personFromCvText(text, "f.pdf"), JSON.stringify(text)).toBeNull();
    }
    // …and a clear name IS read, or the adapter would be uselessly timid.
    expect(personFromCvText("Jonas Petraitis\nElektrikas", "f.pdf")?.name).toBe(
      "Jonas Petraitis",
    );
  });
});

describe("governance and accounts are untouched", () => {
  it("nothing here writes memberships, profiles or auth users", () => {
    for (const forbidden of ["company_memberships", "auth.users", "from(\"profiles\")", "signUp", "admin.createUser"]) {
      expect(code(ACTIONS), `${forbidden} in the people ingestion path`).not.toContain(forbidden);
      expect(code(CORE), `${forbidden} in the ingestion core`).not.toContain(forbidden);
    }
  });

  it("every row starts UNLINKED — recording a person is not their consent", () => {
    expect(ACTIONS).toMatch(/link_state:\s*"unlinked"/);
    // …and nothing here advances the lifecycle on the person's behalf.
    for (const forbidden of ["link_proposed", "\"linked\"", "linked_profile_id", "linked_worker_id"]) {
      expect(code(ACTIONS), `${forbidden} written by an import`).not.toContain(forbidden);
    }
  });

  it("the roster is not a CV database", () => {
    for (const forbidden of ["skills", "work_history", "education", "languages", "certificate", "experience"]) {
      expect(code(CORE).toLowerCase(), `${forbidden} stored on a roster row`).not.toContain(forbidden);
    }
  });
});

describe("authorization is reused, never re-invented", () => {
  it("the organization comes from the caller's own memberships", () => {
    expect(ACTIONS).toContain("resolveEvidenceOrganization");
    // The client may not name an organization: no id is accepted as input.
    expect(ACTIONS).not.toMatch(/organizationId:\s*string;?\s*\n\s*}\): Promise<IngestPreview/);
  });

  it("the caller is re-derived on every action — server actions are endpoints", () => {
    expect(ACTIONS).toContain("supabase.auth.getUser()");
    expect(ACTIONS).toMatch(/not-authorized/);
  });

  it("a missing migration is NOT reported as a generic failure", () => {
    // `candidate` needs 20260910120000. A CHECK refusal on it means "not
    // provisioned", which is a different sentence from "something broke".
    //
    // SCOPED TO THE BRANCH. An earlier draft asserted the identifier appeared
    // anywhere in the file and stayed GREEN when the actual test was replaced
    // with `false` — the import line alone satisfied it.
    const branch = ACTIONS.slice(
      ACTIONS.indexOf("code === CHECK_VIOLATION"),
      ACTIONS.indexOf("return { kind: \"error\" };", ACTIONS.indexOf("code === CHECK_VIOLATION")),
    );
    expect(branch.length, "the CHECK-violation branch is missing").toBeGreaterThan(20);
    expect(branch, "the branch no longer consults the migration-gated list").toContain(
      "RELATIONSHIPS_NEEDING_MIGRATION",
    );
    expect(branch).toContain("needs-migration");
  });
});

describe("relationships stay truthful", () => {
  it("the vocabulary matches the column's domain, candidate included", () => {
    expect([...INGEST_RELATIONSHIPS]).toContain("candidate");
    expect([...INGEST_RELATIONSHIPS]).toContain("student");
    expect([...INGEST_RELATIONSHIPS]).toContain("agency_worker");
    // 12 pre-existing values + candidate.
    expect(INGEST_RELATIONSHIPS.length).toBe(13);
  });

  it("nothing promotes one relationship into another", () => {
    for (const bad of [
      'relationship = "employee"',
      "relationship ?? \"employee\"",
      "|| \"employee\"",
    ]) {
      expect(code(CORE), `a relationship was defaulted: ${bad}`).not.toContain(bad);
    }
  });
});
