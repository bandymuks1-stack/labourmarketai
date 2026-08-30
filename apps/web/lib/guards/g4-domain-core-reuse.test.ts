import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * G4 BRIDGE GUARD (chat-first audit, gap G4) — cross-client reads go through
 * ONE domain core per table, and the bridge never grants authority.
 *
 * The defect class this pins: a transport adapter (the MCP capability
 * registry today, mobile tomorrow) quietly re-implementing a read the web
 * already owns. Two copies of "the caller's profiles row" or "the caller's
 * workers row" WILL drift — column sets, error semantics, feature-detected
 * fallbacks — and the copy serving external clients is the one nobody
 * watches. Source-contract assertions, same style as the repo's other
 * delegation guards.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]): string => readFileSync(join(WEB, ...p), "utf8");

const REGISTRY = read("lib", "capabilities", "registry.ts");
const SESSION = read("lib", "auth", "session-profile.ts");
const WORKER_CORE = read("lib", "data", "worker-core.ts");
const CALLER = read("lib", "domain", "caller.ts");

describe("one domain core per table — no transport-side re-implementation", () => {
  it("the capability registry does not query profiles/workers/worker_skills directly", () => {
    expect(REGISTRY).not.toMatch(/from\("profiles"\)/);
    expect(REGISTRY).not.toMatch(/from\("workers"\)/);
    expect(REGISTRY).not.toMatch(/from\("worker_skills"\)/);
    // It consumes the SAME cores the web session shell and navigations read.
    // (The journal chain-head read stays: it is the write-confirmation
    // fingerprint, a journal-write concern — not a list re-implementation.)
    expect(REGISTRY).toMatch(/readProfileRow\(caller\)/);
    expect(REGISTRY).toMatch(/readWorkerCoreRow\(caller\)/);
    expect(REGISTRY).toMatch(/readWorkerSkillRows\(caller/);
    expect(REGISTRY).toMatch(/listJournalEntries\(caller/);
  });

  it("the workspace switch runs through ONE core from every transport", () => {
    // The web server actions and the context.switch capability both execute
    // the same membership-validated pointer write — neither keeps a private
    // copy of the membership check or the UPDATE.
    const actions = read("lib", "company", "organization-actions.ts");
    expect(actions).toMatch(/switchActiveWorkspaceCore\(/);
    expect(actions).not.toMatch(/from\("profiles"\)/);
    expect(REGISTRY).toMatch(/switchActiveWorkspaceCore\(caller/);
    expect(REGISTRY).toMatch(/listWorkspaceMemberships\(caller\)/);
    // The membership list itself is built in exactly one place.
    const activeOrg = read("lib", "company", "active-organization.ts");
    expect(activeOrg).toMatch(/listWorkspaceMemberships\(\{ supabase, userId: user\.id \}\)/);
  });

  it("the journal LIST select lives in exactly one place (the core)", () => {
    const core = read("lib", "journal", "journal-list-core.ts");
    expect(core).toMatch(/deleted_at, superseded_by/);
    // The page consumes the core rather than keeping its own copy.
    const page = read(
      "app",
      "[locale]",
      "dashboard",
      "journal",
      "page.tsx",
    );
    expect(page).toMatch(/listJournalEntries\(/);
    expect(page).not.toMatch(/from\("journal_entries"\)/);
  });

  it("the cookie-side readers DELEGATE to the caller-scoped cores", () => {
    // getSessionProfile and getWorkerCoreRow are wrappers over the shared
    // cores — the cookie transport constructs a caller, it does not keep a
    // private copy of the query.
    expect(SESSION).toMatch(/readProfileRow\(\{ supabase, userId: user\.id \}\)/);
    expect(WORKER_CORE).toMatch(/readWorkerCoreRow\(\{ supabase, userId: user\.id \}\)/);
  });

  it("the profiles select lives in exactly one place (the core)", () => {
    const selects = SESSION.match(/from\("profiles"\)/g) ?? [];
    expect(selects.length).toBe(1);
  });
});

describe("the bridge coordinates execution, never authority", () => {
  it("the caller contract module cannot mint clients or reach service role", () => {
    expect(CALLER).not.toMatch(/service_role|SERVICE_ROLE|createClient/);
    // Type-only surface: no runtime supabase import at all.
    expect(CALLER).toMatch(/import type \{ SupabaseClient \}/);
  });

  it("the capability registry resolves no client of its own", () => {
    // Handlers run on caller.supabase from the identity boundary — the
    // registry importing a client factory would be a second authority path.
    // (`SUPABASE_SERVICE_ROLE_KEY` appears there ONLY as HMAC key material
    // for confirmation tokens — key derivation, not a client.)
    expect(REGISTRY).not.toMatch(/@\/lib\/supabase\/server/);
    expect(REGISTRY).not.toMatch(/createClient\(|auth\.admin/);
  });
});
