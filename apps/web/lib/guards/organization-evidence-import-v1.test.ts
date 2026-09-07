import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  listCapabilities,
  exposedCapabilities,
} from "@/lib/capabilities/registry";
import { EVIDENCE_IMPORT_CAPABILITIES } from "@/lib/capabilities/evidence-import-capabilities";
import {
  ATTESTED_EVIDENCE_STATES,
  INDEPENDENTLY_VERIFIED,
  REPORTED_EVIDENCE_STATES,
} from "@/lib/organization-evidence/evidence-state";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";

/**
 * ONE IMPORT ENGINE, TWO TRANSPORTS — pinned structurally.
 *
 * The owner command is explicit: "Do not build two separate implementations."
 * A human in the company workspace and an authorized assistant
 * on `/api/mcp` must reach the SAME domain core, the same authority checks and
 * the same commit gate. That property is invisible to typecheck and to every
 * behavioural test — the two surfaces stay green while quietly diverging — so
 * it is asserted here, on the source itself.
 *
 * The second thing pinned here is what an import may CLAIM. An import produces
 * REPORTED evidence and nothing stronger; attestation is a separate act; and
 * independent verification is a third act belonging to a party that is neither
 * the supplier nor the subject. Those are three different words in three
 * different places, and this guard is why they cannot quietly become one.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const CORE = "lib/organization-evidence/import-core.ts";
// The import is a SECTION of the company workspace, not a route: the Product
// Gate is right that a new screen must answer the five World-State questions,
// and four honest answers were "no". Folding it in kept every guarantee below
// and cost the engine nothing.
const PAGE = "components/app/evidence-import-section.tsx";
const ACTIONS = "lib/organization-evidence/import-actions.ts";
const CAPABILITIES = "lib/capabilities/evidence-import-capabilities.ts";
const MIGRATION =
  "supabase/migrations/20260907114500_organization_evidence_import_v1.sql";

const migration = () =>
  readFileSync(
    join(
      APP,
      "..",
      "..",
      "supabase",
      "migrations",
      "20260907114500_organization_evidence_import_v1.sql",
    ),
    "utf8",
  );

/**
 * The migration with its `--` comments removed.
 *
 * Every "must not contain" assertion below runs on THIS, not on the raw file:
 * the header explains at length why the file carries no `@human-gate-approved`
 * marker and what the rollback would drop, and a naive text search reads those
 * explanations as the very things they promise are absent. Asserting on the
 * executable SQL is the honest version of the question.
 */
function executableSql(): string {
  return migration()
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

// ── one engine ─────────────────────────────────────────────────────────────

describe("the human transport and the agent transport share one core", () => {
  const CORE_WRITES = [
    "createImportSession",
    "submitRows",
    "resolveRow",
    "createRosterPerson",
    "commitImport",
    "withdrawImport",
    "attestRecord",
  ] as const;

  it("both transports import every write from the SAME module", () => {
    for (const source of [ACTIONS, CAPABILITIES]) {
      const text = read(source);
      expect(text).toContain('from "@/lib/organization-evidence/import-core"');
      for (const fn of CORE_WRITES) {
        expect(
          text,
          `${source} must call ${fn} rather than re-implement it`,
        ).toContain(fn);
      }
    }
  });

  it("neither transport queries the evidence tables itself", () => {
    // A `.from("organization_evidence_...")` outside the core is a second
    // implementation being born — which is exactly how the read and the write
    // sides of an invariant drift apart.
    for (const source of [ACTIONS, CAPABILITIES, PAGE]) {
      const text = read(source);
      expect(
        text,
        `${source} must not query evidence tables directly`,
      ).not.toMatch(
        /\.from\(\s*["'](organization_evidence_\w+|evidence_import_\w+|organization_people)["']/,
      );
    }
  });

  it("the page reads through the core too — no bespoke select for the screen", () => {
    const page = read(PAGE);
    for (const fn of [
      "buildPreview",
      "listRosterPeople",
      "listEvidenceRecords",
    ]) {
      expect(page).toContain(fn);
    }
  });

  it("the commit gate itself is ONE module both transports import", () => {
    for (const source of [ACTIONS, CAPABILITIES, PAGE]) {
      expect(read(source)).toContain(
        "@/lib/organization-evidence/commit-confirmation",
      );
    }
    // Preview mints, commit verifies — and the two live on opposite sides.
    expect(read(PAGE)).toContain("mintCommitToken");
    expect(read(ACTIONS)).toContain("verifyCommitToken");
    expect(read(CAPABILITIES)).toContain("mintCommitToken");
    expect(read(CAPABILITIES)).toContain("verifyCommitToken");
  });
});

// ── authority ──────────────────────────────────────────────────────────────

describe("authority is organization-scoped and never re-implemented", () => {
  it("every entry point resolves the organization through the ONE resolver", () => {
    expect(read(CORE)).toContain("resolveEvidenceOrganization");
    expect(read(PAGE)).toContain("resolveEvidenceOrganization");
  });

  it("no transport uses a service-role client", () => {
    for (const source of [CORE, ACTIONS, CAPABILITIES, PAGE]) {
      const text = read(source);
      expect(text, `${source} must run as the caller`).not.toMatch(
        /service[_-]?role|createServiceClient|SUPABASE_SERVICE_ROLE_KEY/i,
      );
    }
  });

  it("a plain member cannot import; the governance roles can", () => {
    expect(hasOrganizationCapability("member", "import-evidence")).toBe(false);
    for (const role of ["owner", "admin", "manager"] as const) {
      expect(hasOrganizationCapability(role, "import-evidence")).toBe(true);
    }
  });

  it("the caller's own RLS is what actually decides — the DB carries the check", () => {
    const sql = executableSql();
    // Not a comment claiming authorization: the real policy predicate.
    expect(sql).toMatch(/manages_organization\(/);
    // Nothing is opened to anonymous callers by this migration.
    expect(sql).not.toMatch(/to\s+anon\b/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
});

// ── what an import may claim ───────────────────────────────────────────────

describe("an import can never mint trust it did not earn", () => {
  it("the record table's state CHECK contains no attested or verified value", () => {
    const sql = executableSql();
    // The whole executable schema is searched rather than one regex slice: an
    // attested value must not be an allowed record state ANYWHERE.
    for (const state of ATTESTED_EVIDENCE_STATES) {
      expect(
        sql,
        `${state} must not be writable onto a record row`,
      ).not.toContain(`'${state}'`);
    }
    expect(sql).not.toContain(`'${INDEPENDENTLY_VERIFIED}'`);
    // And every reported state IS present, so the vocabulary in code and the
    // vocabulary in the database are the same list.
    for (const state of REPORTED_EVIDENCE_STATES) {
      expect(sql, `${state} missing from the schema's CHECK`).toContain(
        `'${state}'`,
      );
    }
  });

  it("the commit capability offers only reported states", () => {
    const source = read(CAPABILITIES);
    expect(source).toContain("REPORTED_EVIDENCE_STATES");
    for (const state of ATTESTED_EVIDENCE_STATES) {
      expect(source).not.toContain(`"${state}"`);
    }
  });

  it("the UI offers attestation but NEVER an independent-verification control", () => {
    const page = read(PAGE);
    expect(page).toContain("EvidenceAttestForm");
    // Independent verification is a different party's act — there is no
    // control for it here, and a self-attestation is labelled as one.
    expect(page).not.toContain("independently_verified");
    expect(page).toContain("records.selfAttested");
    expect(page).toContain("records.notIndependentlyVerified");
  });

  it("the verification policy requires a party that is neither supplier nor subject", () => {
    const sql = migration();
    const policy = sql.slice(
      sql.indexOf("organization_evidence_events_verify"),
    );
    expect(policy).toContain(
      "not public.manages_organization(organization_id)",
    );
    // The subject may never verify their own record.
    expect(policy).toMatch(/op\.linked_profile_id\s*=\s*auth\.uid\(\)/);
    // And the verifier's organization must be a RECORDED party on the record.
    expect(policy).toContain("organization_evidence_parties");
  });

  it("the attestation policy allows a sole trader, and still refuses verification", () => {
    const sql = migration();
    const policy = sql.slice(
      sql.indexOf("organization_evidence_events_attest"),
      sql.indexOf("organization_evidence_events_verify"),
    );
    // Owner decision 3: attesting your own work is legitimate, so the policy
    // must NOT compare the actor to the subject...
    expect(policy).not.toMatch(/linked_profile_id/);
    // ...but it must still be unable to write the verified event type.
    expect(policy).toContain("event_type <> 'independently_verified'");
  });
});

// ── provenance is never collapsed ──────────────────────────────────────────

describe("who said this, and as what, survives the import", () => {
  it("the supplier's capacity is a required, stored field — not an assumption", () => {
    expect(read(CORE)).toContain("supplierRole");
    expect(migration()).toContain("supplier_role");
    // An agency is offered as its own capacity, distinct from employer and
    // client, so the screen can never present it as the end employer.
    for (const role of [
      "agency",
      "client",
      "end_client",
      "education_provider",
    ]) {
      expect(read(CORE)).toContain(`"${role}"`);
    }
  });

  it("the subject, the reporter, the importer and the party are separate columns", () => {
    const sql = migration();
    for (const column of [
      // the SUBJECT the evidence is about
      "organization_person_id",
      // WHO supplied it, and in what capacity
      "supplied_by_organization_id",
      "supplier_role",
      // WHO in that organization stated it, and WHO ran the import
      "supplied_by_profile_id",
      "imported_by_profile_id",
      // a third party recorded on the record (client, assessor, public body)
      "party_organization_id",
      // and WHO performed a lifecycle act on it
      "actor_profile_id",
    ]) {
      expect(
        sql,
        `${column} must exist so provenance is not collapsed`,
      ).toContain(column);
    }
  });

  it("a person needs no account — the roster row is created unlinked", () => {
    const core = read(CORE);
    expect(core).toContain('link_state: "unlinked"');
    // And the database enforces the same thing rather than trusting the app.
    expect(migration()).toMatch(/link_state\s*=\s*'unlinked'/);
  });
});

// ── the registry ───────────────────────────────────────────────────────────

describe("the capabilities are registered, honest and complete", () => {
  const ids = EVIDENCE_IMPORT_CAPABILITIES.map((c) => c.id);

  it("every evidence capability is in THE registry, not a private list", () => {
    const registered = new Set(listCapabilities().map((c) => c.id));
    for (const id of ids) expect(registered.has(id)).toBe(true);
  });

  it("the whole flow is reachable — no step is missing for an agent", () => {
    expect(ids).toEqual([
      "evidence.organization.resolve",
      "evidence.people.list",
      "evidence.person.create",
      "evidence.import.create_session",
      "evidence.import.submit_rows",
      "evidence.import.preview",
      "evidence.import.resolve_row",
      "evidence.import.commit",
      "evidence.records.list",
      "evidence.record.attest",
      "evidence.import.withdraw",
    ]);
  });

  it("the preview is a draft and the commit is a confirm — the boundary is typed", () => {
    const byId = new Map(EVIDENCE_IMPORT_CAPABILITIES.map((c) => [c.id, c]));
    expect(byId.get("evidence.import.preview")?.kind).toBe("draft");
    expect(byId.get("evidence.import.commit")?.kind).toBe("confirm");
    // A draft writes nothing, and says so in its annotations.
    expect(byId.get("evidence.import.preview")?.annotations.readOnlyHint).toBe(
      true,
    );
  });

  it("nothing claims to be destructive-free by omission or to reach outside", () => {
    for (const c of EVIDENCE_IMPORT_CAPABILITIES) {
      // The withdraw path deletes nothing — it appends a withdrawal event —
      // so no capability here is destructive, and none reaches the open world.
      expect(c.annotations.destructiveHint, c.id).toBe(false);
      expect(c.annotations.openWorldHint, c.id).toBe(false);
      expect(
        c.description.length,
        `${c.id} needs a real description`,
      ).toBeGreaterThan(60);
    }
  });

  it("every one of them is exposed, so the flow is not half-reachable", () => {
    const exposed = new Set(exposedCapabilities().map((c) => c.id));
    for (const id of ids) expect(exposed.has(id)).toBe(true);
  });
});

// ── the migration stays honestly gated ─────────────────────────────────────

describe("the schema change is additive and honestly gated", () => {
  it("it drops nothing and rewrites no existing policy", () => {
    const sql = executableSql();
    expect(sql).not.toMatch(/\bdrop\s+(table|column|policy)\b/i);
    expect(sql).not.toMatch(/\balter\s+policy\b/i);
  });

  it("it carries the human-gate marker EXACTLY once, and names the decision behind it", () => {
    // INVERTED 2026-09-07, and the inversion is the guard's point rather
    // than a weakening of it. This used to assert the marker was ABSENT,
    // because no owner decision existed. The owner has since approved this
    // migration by name (EVID-1, HG-2026-09-07) and it was applied.
    // The old assertion encoded a TRANSIENT fact that has changed, so keeping
    // it would have made the guard enforce something untrue.
    //
    // The replacement is STRICTER, not looser: the marker must appear exactly
    // once, on a line of its own the way migration-safety.mjs reads it, AND
    // the file must name the recorded decision it rests on. A marker written
    // in without a decision behind it still fails here. The marker also never
    // reclassifies the file to GREEN, so RED CLASS must still be stated.
    const marked = migration()
      .split("\n")
      .filter((l) => /^\s*--\s*@human-gate-approved\s*$/.test(l));
    expect(marked).toHaveLength(1);
    expect(migration()).toContain("EVID-1");
    expect(migration()).toContain("HG-2026-09-07");
    expect(migration()).toMatch(/RED CLASS/i);
  });

  it("a rollback exists and refuses to run while evidence is stored", () => {
    const down = readFileSync(
      join(
        APP,
        "..",
        "..",
        "supabase",
        "rollbacks",
        "20260907114500_organization_evidence_import_v1.down.sql",
      ),
      "utf8",
    );
    expect(down).toMatch(/organization_evidence_records/);
    expect(down.toLowerCase()).toMatch(/raise|exception|refus/);
  });

  it("the file name follows the timestamp convention (doctrine §16)", () => {
    expect(MIGRATION).toMatch(/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/);
  });
});

// ── the subject's side ─────────────────────────────────────────────────────

describe("the person the evidence is about can see it, and consented to it", () => {
  const PROFILE = "app/[locale]/dashboard/profile/page.tsx";
  const SUBJECT_CARD = "components/app/organization-evidence-section.tsx";
  const LINK_ACTIONS = "lib/organization-evidence/roster-link-actions.ts";

  it("the profile page reads the subject side through the core", () => {
    const page = read(PROFILE);
    expect(page).toContain("listMyOrganizationEvidence");
    expect(page).toContain("OrganizationEvidenceSection");
  });

  it("the subject-side read costs no extra serial stage", () => {
    // The waterfall ratchet (w7-s3) counts awaits; this states the intent
    // directly, so a later refactor that pulls the call out of the batch fails
    // with the REASON rather than only with a number.
    const page = read(PROFILE)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(page).not.toMatch(/=\s*await\s+listMyOrganizationEvidence\(/);
  });

  it("only a CONFIRMED link makes the history theirs", () => {
    const core = read(CORE);
    const fn = core.slice(
      core.indexOf("export async function listMyOrganizationEvidence"),
    );
    expect(fn).toMatch(/linkState === "linked"/);
  });

  it("refusing is a real, offered answer — not a hidden one", () => {
    const card = read(SUBJECT_CARD);
    expect(card).toContain('value="refuse"');
    expect(card).toContain('value="accept"');
    // And the action accepts exactly those two, with no default.
    const actions = read(LINK_ACTIONS);
    expect(actions).toContain('raw !== "accept" && raw !== "refuse"');
  });

  it("the subject card never claims independent verification", () => {
    const card = read(SUBJECT_CARD);
    expect(card).toContain("notIndependentlyVerified");
    expect(card).toContain("selfAttested");
    expect(card).not.toMatch(/verified["\s]*[:=]\s*true/);
  });

  it("the dead worker-claim policy is gone, replaced by the two-sided one", () => {
    const sql = executableSql();
    // It could never fire: it targeted `unlinked` rows, which the select
    // policy hides from everyone but a manager.
    expect(sql).not.toContain("organization_people_self_claim");
    expect(sql).not.toContain("worker_claim");
    expect(sql).toContain("organization_people_subject_decides");
  });

  it("the subject's policy can only ever touch a row already naming them", () => {
    const sql = executableSql();
    const policy = sql.slice(
      sql.indexOf("create policy organization_people_subject_decides"),
      sql.indexOf("-- evidence_import_sessions"),
    );
    expect(policy).toMatch(/using \(linked_profile_id = auth\.uid\(\)\)/);
    // Accept and refuse are the only two shapes the check permits.
    expect(policy).toContain("link_state = 'linked'");
    expect(policy).toContain("link_state = 'unlinked'");
  });
});
