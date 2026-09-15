import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUILT_NOT_CONNECTED sweep — the client side of the agency bridge could
 * DISCLOSE but never SEE or WITHDRAW.
 *
 * `share_request_with_agency_v1` was wired to a control; the agency read what
 * was shared with it through `list_shared_requests_for_agency_v1`; and
 * `unshare_request_v1` — a function whose own body admits ONLY the client
 * owner, i.e. written for a client control — was reachable from no surface at
 * all. The only withdrawal a client had was revoking the entire relationship.
 *
 * SEP-8 (DATA EXISTS ≠ REACHABLE ≠ VISIBLE): the disclosure existed and was
 * visible to its recipient, and invisible to the person who made it.
 *
 * This guard pins the CONNECTION, not new authority: no migration changed,
 * no policy widened, no RPC added. Static file pinning only — no database.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ");

const SECTION = read("components/app/client-agency-bridge-section.tsx");
const READS = read("lib/agency/bridge-read.ts");
const ACTIONS = read("lib/agency/bridge-actions.ts");
const PAGE = read("app/[locale]/dashboard/company/page.tsx");
const MIG = readRepo(
  "supabase/migrations/20260723180000_agency_real_client_bridge_v1.sql",
);

describe("1. the withdrawal the database already offered is now reachable", () => {
  it("unshare_request_v1 admits the CLIENT owner only — it was written for this control", () => {
    const body = MIG.slice(
      MIG.indexOf("function public.unshare_request_v1"),
      MIG.indexOf("function public.unshare_request_v1") + 1400,
    ).toLowerCase();
    expect(body).toContain("owns_company(c.client_company_id)");
    expect(body).not.toContain("owns_company(c.agency_company_id)");
  });

  it("the client section calls the action, not a new one", () => {
    expect(SECTION).toMatch(/unshareRequestAction/);
    expect(ACTIONS).toMatch(/rpc\("unshare_request_v1"/);
  });

  it("every share row carries its own withdrawal control", () => {
    const code = stripTs(SECTION);
    const row = code.slice(code.indexOf("client-bridge-shared-row"));
    expect(row).toMatch(/name="shareId"/);
    expect(row).toMatch(/action=\{unshareAction\}/);
  });

  it("a failed withdrawal is not silent", () => {
    expect(stripTs(SECTION)).toMatch(
      /\[shareState, acceptState, declineState, revokeState, unshareState\]/,
    );
  });
});

describe("2. the read reuses the authority that exists", () => {
  const code = stripTs(READS);
  // Bound the slice to THIS function: the file continues with other reads,
  // and an unbounded slice would let a neighbour satisfy these assertions.
  const start = code.indexOf("export async function listSharedRequestsByClient");
  const after = code.indexOf("export async function", start + 10);
  const fn = code.slice(start, after === -1 ? undefined : after);

  it("reads the share table directly — no new RPC was invented", () => {
    expect(fn).toMatch(/from\("agency_client_request_shares"\)/);
    expect(fn).not.toMatch(/\.rpc\(/);
  });

  it("the policy that admits the client owner already exists in the applied-schema migration", () => {
    const policy = MIG.slice(
      MIG.indexOf("create policy agency_client_request_shares_select"),
      MIG.indexOf("grant select on public.agency_client_request_shares"),
    ).toLowerCase();
    expect(policy).toContain("owns_company(c.client_company_id)");
  });

  it("only ACTIVE shares are drawn — a revoked share is not a disclosure", () => {
    expect(fn).toMatch(/\.eq\("status", "active"\)/);
  });

  it("connection ids NARROW the read; they never widen it", () => {
    expect(fn).toMatch(/\.in\("connection_id", ids\)/);
    // An empty caller-side list must not become "everything RLS allows".
    expect(fn).toMatch(/if \(ids\.length === 0\) return \{ kind: "ok", rows: \[\] \};/);
  });

  it("an unapplied store degrades honestly instead of reporting nothing shared", () => {
    expect(fn).toMatch(/needs-migration/);
    expect(fn).toMatch(/kind: "error"/);
  });
});

describe("3. UNKNOWN is not ZERO on the surface (SEP-7)", () => {
  const code = stripTs(SECTION);

  it("only an ok read produces rows", () => {
    expect(code).toMatch(/shared\.kind === "ok" \? shared\.rows : \[\]/);
  });

  it("the empty-state copy is shown only when the read succeeded", () => {
    const block = code.slice(code.indexOf("client-bridge-shared"));
    expect(block).toMatch(/shared\.kind !== "ok" \? null :/);
  });
});

describe("4. the page composes it without widening the surface", () => {
  const code = stripTs(PAGE);

  it("the read is skipped entirely when the section will not render", () => {
    expect(code).toMatch(/clientBridgeLabels && clientInvites\?\.kind === "ok"/);
  });

  it("only ACTIVE connections are passed", () => {
    expect(code).toMatch(/filter\(\(r\) => r\.status === "active"\)\.map\(\(r\) => r\.id\)/);
  });

  it("the section receives the state, not a bare array", () => {
    expect(code).toMatch(/shared=\{clientBridgeShares\}/);
  });
});

describe("5. no schema or authority change rode along", () => {
  it("the bridge migration is untouched by this change", () => {
    // The three RPC/grant facts this connection depends on must all be
    // pre-existing text in the already-written migration.
    expect(MIG).toMatch(/grant select on public\.agency_client_request_shares to authenticated;/);
    expect(MIG).toMatch(/create or replace function public\.unshare_request_v1/);
    expect(MIG).toMatch(/create policy agency_client_request_shares_select/);
  });
});
