import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Candidate / provider draft v1 guard.
 *
 * A draft is the creator's private, owner-scoped working note about an
 * UNREGISTERED person/provider. It must never become a fake account, acceptance,
 * consent, verification, document, or AI match — and it cannot be assigned until
 * it is linked to a real account. Additive, owner-RLS, no anon/PUBLIC grant.
 */

const APP = join(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const readApp = (rel: string) => readFileSync(join(APP, rel), "utf8");

const migDir = resolve(REPO, "supabase", "migrations");
const migFile = readdirSync(migDir).find((f) => f.endsWith("_candidate_provider_drafts.sql"));
const migration = migFile ? readFileSync(join(migDir, migFile), "utf8") : "";
const sqlNoComments = migration.replace(/^\s*--.*$/gm, "");

const service = readApp("lib/candidates/candidate-drafts.ts");
const actions = readApp("lib/candidates/actions.ts");
const manager = readApp("components/app/candidate-drafts-manager.tsx");
const roleChoice = readApp("components/app/setup-role-choice.tsx");
const board = readApp("components/app/project-operations-board.tsx");
const en = JSON.parse(readApp("messages/en.json")) as Record<string, unknown>;
const lt = JSON.parse(readApp("messages/lt.json")) as Record<string, unknown>;

describe("candidate_drafts migration is additive, owner-scoped, safe", () => {
  it("exists and creates the table with RLS enabled", () => {
    expect(migFile).toBeTruthy();
    expect(migration).toMatch(/create table if not exists public\.candidate_drafts/);
    expect(migration).toMatch(/enable row level security/);
  });
  it("is owner-scoped (owner_id = auth.uid()) for read and write", () => {
    expect(migration).toMatch(/owner_id = auth\.uid\(\)/);
    expect(migration).toMatch(/with check \(owner_id = auth\.uid\(\)\)/);
  });
  it("grants to authenticated only — never anon/PUBLIC", () => {
    expect(migration).toMatch(/grant select, insert, update, delete on public\.candidate_drafts to authenticated/);
    expect(sqlNoComments).not.toMatch(/grant[\s\S]*?\bto\s+anon\b/i);
    expect(sqlNoComments).not.toMatch(/grant[\s\S]*?\bto\s+public\b/i);
  });
  it("has no destructive op outside the reversible-rollback comment", () => {
    expect(sqlNoComments).not.toMatch(/drop\s+table/i);
    expect(sqlNoComments).not.toMatch(/delete\s+from/i);
    expect(sqlNoComments).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
  it("bounds status with a CHECK and has no worker_id (not directly assignable)", () => {
    expect(migration).toMatch(/status in \([\s\S]*?'draft'[\s\S]*?'archived'\)/);
    expect(migration).not.toMatch(/\bworker_id\b/);
    expect(migration).toMatch(/linked_profile_id/);
  });
});

describe("read service is owner-scoped and read-only", () => {
  it("never writes", () => {
    expect(service).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
  it("reads candidate_drafts and degrades gracefully", () => {
    expect(service).toMatch(/candidate_drafts/);
    expect(service).toMatch(/needs-migration/);
  });
});

describe("write actions create no fake account/acceptance/consent/verification", () => {
  // Strip comments so the honest doc-comment (which *names* what it must NOT do)
  // doesn't trip the negative code checks below.
  const code = actions
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  it("only touch candidate_drafts and set owner_id from auth.uid()", () => {
    expect(code).toMatch(/from\("candidate_drafts"\)/);
    expect(code).toMatch(/owner_id: user\.id/);
    // never create a real account / profile / invite / acceptance (in CODE)
    expect(code).not.toMatch(/auth\.admin|signUp|createUser/);
    expect(code).not.toMatch(/\.from\(["']profiles["']\)/);
    expect(code).not.toMatch(/accept_worker_invitation|\.rpc\(\s*["'][^"']*(invite|accept|verif|consent)/i);
  });
  it("never assigns a draft to a project (assignment needs a real worker)", () => {
    expect(code).not.toMatch(/assign_worker_to_project|project_worker_assignments/);
  });
});

describe("UI is honest about draft state", () => {
  it("the manager shows not-registered / not-verified / draft / can-link-later", () => {
    for (const k of ["labelNotRegistered", "labelNotVerified", "labelDraft", "labelCanLinkLater"]) {
      expect(manager).toMatch(new RegExp(k));
    }
    expect(manager).toMatch(/notAssignableNote/);
    expect(manager).toMatch(/candidate-drafts-honesty/);
  });
});

describe("reachability — create-draft entry points exist", () => {
  it("the neutral role choice links to the drafts page", () => {
    expect(roleChoice).toMatch(/\/dashboard\/candidates/);
    expect(roleChoice).toMatch(/role-choice-candidates-link/);
  });
  it("the project operations board links to the drafts page", () => {
    expect(board).toMatch(/\/dashboard\/candidates/);
    expect(board).toMatch(/ops-candidates-link/);
  });
});

describe("honesty copy (en + lt)", () => {
  const c = (m: Record<string, unknown>) =>
    JSON.stringify((m as { candidates?: unknown }).candidates ?? {}).toLowerCase();
  it("states a draft is not an account and nothing is verified/consented/AI-matched", () => {
    expect(c(en)).toMatch(/not a user account/);
    expect(c(en)).toMatch(/no account, invite acceptance, consent, verification/);
    expect(c(en)).toMatch(/can only be assigned to a project after it is linked/);
    expect(c(lt)).toMatch(/nėra naudotojo paskyra/);
  });
});
