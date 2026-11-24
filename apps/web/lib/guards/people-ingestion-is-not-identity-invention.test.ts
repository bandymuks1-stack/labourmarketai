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
/** The SHARED domain service both transports call. The preview/commit
 *  implementation lives here, so the invariants about writing live here too. */
const SERVICE = read("lib/organization-people/ingest-service.ts");
/** The assistant/MCP transport over that same service. */
const CAPS = read("lib/capabilities/people-ingest-capabilities.ts");
const FILE_READER = read("lib/organization-people/ingest-file.ts");
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
      expect(SERVICE, `${c} missing from the batch writer`).toContain(c);
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
      for (const [label, src] of [["actions", ACTIONS], ["service", SERVICE], ["capabilities", CAPS]] as const) {
        expect(code(src), `${forbidden} in the people ingestion path (${label})`).not.toContain(forbidden);
      }
      expect(code(CORE), `${forbidden} in the ingestion core`).not.toContain(forbidden);
    }
  });

  it("every row starts UNLINKED — recording a person is not their consent", () => {
    expect(SERVICE).toMatch(/link_state:\s*"unlinked"/);
    // …and nothing here advances the lifecycle on the person's behalf.
    for (const forbidden of ["link_proposed", "\"linked\"", "linked_profile_id", "linked_worker_id"]) {
      expect(code(SERVICE), `${forbidden} written by an import`).not.toContain(forbidden);
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
    expect(SERVICE).toContain("resolveEvidenceOrganization");
    expect(ACTIONS).toContain("resolveEvidenceOrganization");

    // An organization id a client supplies is a SELECTOR among the caller's
    // OWN memberships, never a grant: it may only ever reach the resolver,
    // which validates it against those memberships. The write must therefore
    // use the RESOLVED id — a client that names a target it does not belong
    // to gets that target's options back, not that target's roster.
    expect(SERVICE, "the requested id must go through the resolver").toMatch(
      /resolveEvidenceOrganization\(\s*caller,\s*organizationId/,
    );
    expect(SERVICE, "the insert must use the RESOLVED organization id").toMatch(
      /organization_id:\s*org\.id/,
    );
    expect(
      SERVICE,
      "a client-supplied organization id must never be written directly",
    ).not.toMatch(/organization_id:\s*input\.organizationId/);
  });

  it("the caller is re-derived on every action — server actions are endpoints", () => {
    expect(ACTIONS).toContain("supabase.auth.getUser()");
    expect(ACTIONS).toMatch(/not-authorized/);
    // The service authenticates NOBODY: it takes an already-authenticated
    // caller. A transport that forgot to establish one cannot slip through.
    expect(code(SERVICE), "the shared service must not derive identity").not.toContain(
      "auth.getUser",
    );
  });

  it("a missing migration is NOT reported as a generic failure", () => {
    // `candidate` needs 20260910120000. A CHECK refusal on it means "not
    // provisioned", which is a different sentence from "something broke".
    //
    // SCOPED TO THE BRANCH. An earlier draft asserted the identifier appeared
    // anywhere in the file and stayed GREEN when the actual test was replaced
    // with `false` — the import line alone satisfied it.
    const branch = SERVICE.slice(
      SERVICE.indexOf("code === CHECK_VIOLATION"),
      SERVICE.indexOf("return { kind: \"error\" };", SERVICE.indexOf("code === CHECK_VIOLATION")),
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

/**
 * THE ASSISTANT TRANSPORT (ChatGPT / any MCP client) IS AN ADAPTER, NOT A
 * SECOND PRODUCT.
 *
 * Everything an assistant can do to a roster, a person in the building can do
 * through the web panel, through the same service, under the same
 * authorization. These assertions exist so that stays true the next time
 * somebody is in a hurry.
 */
describe("people ingestion through an assistant", () => {
  it("the capability layer calls the SHARED service, never the database", () => {
    expect(CAPS).toContain("@/lib/organization-people/ingest-service");
    expect(CAPS).toContain("previewPeopleIngest");
    expect(CAPS).toContain("commitPeopleIngest");

    // No table reaches the MCP surface. An assistant gets domain actions, not
    // CRUD: there is no shape of argument that makes it a database client.
    for (const forbidden of [
      "from(\"organization_people\")",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      ".rpc(",
      "service_role",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      expect(code(CAPS), `${forbidden} on the assistant surface`).not.toContain(forbidden);
    }
  });

  it("a file arriving is NOT a commit", () => {
    // The preview is the only tool that accepts a file, and it is declared a
    // read: it may not write.
    const preview = CAPS.slice(
      CAPS.indexOf('id: "people.ingest.preview"'),
      CAPS.indexOf('id: "people.ingest.commit"'),
    );
    expect(preview.length, "the preview capability is missing").toBeGreaterThan(200);
    expect(preview).toContain("readOnly");
    expect(preview).toContain("previewPeopleIngest");
    expect(preview, "the preview must not commit").not.toContain("commitPeopleIngest");

    // …and the commit tool does not accept a file at all, so "attach" and
    // "commit" cannot collapse into one call.
    const commit = CAPS.slice(CAPS.indexOf('id: "people.ingest.commit"'));
    expect(commit, "the commit tool must not take a file").not.toContain("fileSchema");
  });

  it("a commit REQUIRES a token bound to what the preview showed", () => {
    expect(CAPS).toContain("verifyPeopleCommitToken");
    expect(CAPS).toContain("confirmationToken");

    // The verification must come BEFORE the write, or it is decoration.
    const commit = CAPS.slice(CAPS.indexOf('id: "people.ingest.commit"'));
    const verifyAt = commit.indexOf("verifyPeopleCommitToken");
    const writeAt = commit.indexOf("commitPeopleIngest(");
    expect(verifyAt, "the commit never verifies a token").toBeGreaterThan(-1);
    expect(writeAt, "the commit never writes").toBeGreaterThan(-1);
    expect(verifyAt, "the token is verified AFTER the write").toBeLessThan(writeAt);

    // A rejected token must refuse, not warn and continue.
    expect(commit).toContain("confirmation_rejected");
  });

  it("a token is minted only when nothing is left to ask", () => {
    const preview = CAPS.slice(
      CAPS.indexOf('id: "people.ingest.preview"'),
      CAPS.indexOf('id: "people.ingest.commit"'),
    );
    expect(preview).toContain("needsReconciliation");
    expect(preview).toContain("needsRelationship");
    // The mint is guarded by that readiness, not unconditional.
    expect(preview).toMatch(/ready\s*&&[\s\S]{0,80}mintPeopleCommitToken/);
  });

  it("a multi-person workforce file never becomes a personal CV import", () => {
    // The roster reader and the CV/self-profile paths are different products.
    for (const forbidden of ["cv/extract", "personFromCvText", "worker_documents", "living_cv"]) {
      expect(code(CAPS), `${forbidden} reached from a workforce list`).not.toContain(forbidden);
    }
    // PDF/DOCX are refused BY NAME rather than half-imported.
    expect(FILE_READER).not.toMatch(/\.(pdf|docx)\$?\/i\.test/);
    expect(CAPS).toContain("not_supported");
  });

  it("deterministic people work calls NO AI provider", () => {
    // ChatGPT already supplies the conversational layer. Sending roster names
    // to our own model would cost money and decide identity probabilistically.
    for (const forbidden of [
      "runAiAgent",
      "lib/ai/",
      "gemini",
      "generateText",
      "openai",
      "anthropic",
    ]) {
      for (const [label, src] of [
        ["capabilities", CAPS],
        ["service", SERVICE],
        ["core", CORE],
        ["file reader", FILE_READER],
      ] as const) {
        expect(
          code(src).toLowerCase(),
          `${forbidden} on the deterministic people path (${label})`,
        ).not.toContain(forbidden);
      }
    }
  });

  it("a failed read is never reported as an empty roster", () => {
    // Each failure class keeps its own name all the way to the client.
    for (const named of [
      "not_authorized",
      "needs_migration",
      "unavailable",
      "too_many_rows",
      "unresolved",
      "organization_choice_required",
    ]) {
      expect(CAPS, `${named} is not distinguishable to a client`).toContain(named);
    }
    // The honesty is stated where a model will read it.
    expect(CAPS).toMatch(/NOT an empty roster/);
  });
});
