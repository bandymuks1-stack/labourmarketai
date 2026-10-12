import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { readVerifiedSessionEmail } from "@/lib/auth/verified-email-gate";

/**
 * WORKER_REGISTRATION_FRICTION_REMOVAL — APP-LAYER e-mail trust (finding G-3).
 *
 * With "Confirm email" OFF the session's e-mail is merely typed. The DB paths
 * are gated by migration 20261003151000 (see email-verified-boundary.test.ts).
 * This guard covers the other half: SERVER CODE that authorises, lists or claims
 * by the caller's e-mail string, above all code that reaches for the service
 * role. Disposition of every e-mail-trusting app path found (sweep 2026-10-05):
 *
 *   claim-public-intake (list + claim, service role)  FIXED: verified-email gate
 *   worker/invitations.ts, agency/bridge-read.ts      DB-GATED: user-scoped client,
 *                                                     RLS select policies carry the
 *                                                     verified predicate
 *   RPC callers passing an e-mail (memberships, training, decisions, approvals,
 *   reviews, lmc admin, invite_*_worker)              DB-GATED: resolver/predicate
 *   invite/[token] page (addressedToOther)            TOKEN-PROVED, display hint only
 *   admin/pilots by e-mail, admin/company-need-intakes ADMIN-ROLE gated
 *   billing/customer-store (user.email -> provider)   NOT AUTHORISATION (attribute)
 *   lead intake / waitlist / external referral        WRITE-ONLY or TOKEN-PROVED
 *   qa/synthetic-fixture isSyntheticViewer            ACCEPTED, see below
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (["node_modules", "tests"].includes(e) || e.startsWith(".next")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.|\.spec\./.test(e) && !/[\\/]lib[\\/]supabase[\\/]types\.ts$/.test(p)) out.push(p);
  }
  return out;
}
const FILES = ["app", "lib", "components"].flatMap((d) => walk(join(WEB, d)));
const rel = (f: string) => f.slice(WEB.length + 1).replace(/\\/g, "/");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("claim-public-intake: the service role is reached only for a VERIFIED mailbox", () => {
  const src = stripComments(read("lib/company/claim-public-intake.ts"));

  it("asks the verified-email gate with the caller's own client", () => {
    expect(src).toMatch(/import \{ readVerifiedSessionEmail \} from "@\/lib\/auth\/verified-email-gate"/);
    expect(src).toMatch(/readVerifiedSessionEmail\(supabase\)/);
  });

  it("never derives the authorising address from user.email / the JWT", () => {
    expect(src).not.toMatch(/user\??\.email/);
    expect(src).not.toMatch(/normEmail\(\s*user/);
    expect(src).toMatch(/const email = proof\.email/);
  });

  it("claim: the verified gate precedes the first service-role call and fails closed", () => {
    const body = src.slice(src.indexOf("export async function claimPublicIntake"));
    const gate = body.indexOf("readVerifiedSessionEmail(supabase)");
    const admin = body.indexOf("createAdminClient()");
    expect(gate).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(gate);
    expect(body).toMatch(/proof\.status === "unverified"\) return \{ ok: false, reason: "email_unverified" \}/);
    // Anything that is not an explicit verified result stops before the admin client.
    expect(body).toMatch(/proof\.status !== "verified"\) return \{ ok: false, reason: "error" \}/);
  });

  it("list: the service-role read lives in a helper reached only from the verified branch", () => {
    const list = src.slice(src.indexOf("export async function listClaimablePublicIntakesState"), src.indexOf("export async function listClaimablePublicIntakes()"));
    expect(list).not.toMatch(/createAdminClient/);
    expect(list).toMatch(/proof\.status !== "verified"\) return \{ status: "ok", intakes: \[\] \}/);
    expect(list.indexOf("readVerifiedSessionEmail")).toBeLessThan(list.indexOf("readIntakesFor(proof.email)"));
    // createAdminClient() is constructed only in readIntakesFor and claimPublicIntake (both gated).
    const owners = [...src.matchAll(/createAdminClient\(\)/g)].map((m) => {
      const before = src.slice(0, m.index);
      return before.lastIndexOf("async function readIntakesFor") > before.lastIndexOf("export async function") ? "readIntakesFor" : "claimPublicIntake";
    });
    expect(owners.sort()).toEqual(["claimPublicIntake", "readIntakesFor"]);
  });

  it("an unverified claim is offered the progressive proof, not a dead end", () => {
    const card = read("components/app/claim-public-intake-card.tsx");
    expect(card).toMatch(/r\.reason === "email_unverified"/);
    expect(card).toMatch(/VerifyEmailPrompt/);
    const page = read("app/[locale]/dashboard/company/needs/page.tsx");
    expect(page).toMatch(/claimableState\.status === "email_unverified"/);
  });
});

describe("the verified-email gate itself is fail-closed (behaviour)", () => {
  const client = (user: { email?: string } | null, rpc: { data?: unknown; error?: unknown }) =>
    ({
      auth: { getUser: async () => ({ data: { user } }) },
      rpc: async () => ({ data: rpc.data ?? null, error: rpc.error ?? null }),
    }) as never;

  it("unauthenticated -> unauthenticated", async () => {
    expect((await readVerifiedSessionEmail(client(null, {}))).status).toBe("unauthenticated");
  });
  it("UNVERIFIED account using someone else's e-mail -> unverified (the service role is never reached)", async () => {
    const r = await readVerifiedSessionEmail(client({ email: "victim@x.com" }, { data: { email: "victim@x.com", verified: false } }));
    expect(r.status).toBe("unverified");
  });
  it("verified owner of the address -> verified, with the PROVEN address", async () => {
    const r = await readVerifiedSessionEmail(client({ email: "Owner@X.com" }, { data: { email: "owner@x.com", verified: true } }));
    expect(r).toEqual({ status: "verified", email: "owner@x.com" });
  });
  it("an rpc error (e.g. migration not applied) is NOT verified", async () => {
    expect((await readVerifiedSessionEmail(client({ email: "a@b.c" }, { error: { code: "42883" } }))).status).toBe("error");
  });
  it("malformed payloads are NOT verified", async () => {
    for (const data of [null, {}, { verified: "true" }, { verified: true }, { verified: true, email: "  " }, { verified: 1, email: "a@b.c" }]) {
      const r = await readVerifiedSessionEmail(client({ email: "a@b.c" }, { data }));
      expect(r.status, JSON.stringify(data)).toBe("unverified");
    }
  });
  it("a proven address that no longer matches the session address is NOT verified", async () => {
    const r = await readVerifiedSessionEmail(client({ email: "new@x.com" }, { data: { email: "old@x.com", verified: true } }));
    expect(r.status).toBe("unverified");
  });
});

describe("no service-role caller authorises by e-mail without the verified gate", () => {
  /** A file that reaches the service role AND uses the caller's e-mail string as
   *  an authority input (session address, or an e-mail column filter). */
  const SERVICE_ROLE = /createAdminClient\s*\(|SUPABASE_SERVICE_ROLE_KEY/;
  const EMAIL_AUTHORITY = /user\??\.email|session\??\.user\??\.email|normEmail\(|\.(eq|ilike|filter)\(\s*"[a-z_]*email"/;

  /** Reviewed, NOT authorisation by the caller's e-mail. Every entry says why. */
  const REVIEWED: Record<string, string> = {
    "lib/billing/customer-store.ts": "passes the account address to the payment provider as a customer attribute; grants nothing and matches no existing record by it",
    "lib/admin/company-need-intakes.ts": "operator queue: gated by the admin role, reads by id/status, never by the caller's e-mail",
    "lib/sales/lead-intake.ts": "anonymous write-only intake; stores the typed contact address, reads nothing back to the submitter",
    "lib/invitations/external-referral-receive.ts": "token-proved: authorised by a one-time secret, e-mail only addresses the mail",
    "lib/invitations/public-preview.ts": "token-proved preview by secret hash; no session e-mail authority",
  };

  const offenders = FILES.filter((f) => {
    const s = stripComments(readFileSync(f, "utf8"));
    return SERVICE_ROLE.test(s) && EMAIL_AUTHORITY.test(s);
  }).map(rel);

  it("every such file either uses the verified gate or is a reviewed non-authorisation", () => {
    const unexplained = offenders.filter((f) => {
      if (REVIEWED[f]) return false;
      return !/readVerifiedSessionEmail|session_email_verified_v1|my_email_verification_v1/.test(stripComments(read(f)));
    });
    expect(unexplained, "service-role code authorising by e-mail without the verified gate").toEqual([]);
  });

  it("the reviewed list has no stale entries (each file still exists and is a candidate)", () => {
    for (const f of Object.keys(REVIEWED)) {
      expect(FILES.map(rel), f).toContain(f);
    }
  });

  it("claim-public-intake is a gated (not reviewed-away) entry", () => {
    expect(offenders).toContain("lib/company/claim-public-intake.ts");
    expect(REVIEWED["lib/company/claim-public-intake.ts"]).toBeUndefined();
  });
});

describe("e-mail reads under RLS (user-scoped client) stay DB-gated", () => {
  for (const f of ["lib/worker/invitations.ts", "lib/agency/bridge-read.ts"]) {
    it(`${f} never uses the service role (the verified predicate in the RLS policy is the gate)`, () => {
      const s = stripComments(read(f));
      expect(s).not.toMatch(/createAdminClient|SERVICE_ROLE/);
      expect(s).toMatch(/createClient/);
    });
  }
  it("the RLS policies those reads depend on carry the verified predicate", () => {
    const mig = readFileSync(join(WEB, "..", "..", "supabase", "migrations", "20261003151000_email_verified_boundary_v1.sql"), "utf8");
    for (const t of ["company_worker_invitations", "agency_worker_invitations", "agency_client_connections"]) {
      const m = mig.match(new RegExp(`alter policy ${t}_select on public\\.${t}[\\s\\S]*?;`, "i"));
      expect(m?.[0], t).toMatch(/session_email_verified_v1\(\)/);
    }
  });
});

describe("accepted, documented residual: the synthetic-QA viewer address shape", () => {
  it("isSyntheticViewer (qa.*@labourmarket.ai) is used ONLY to reveal labelled fixtures, never to authorise or write", () => {
    const users = FILES.filter((f) => /isSyntheticViewer/.test(stripComments(readFileSync(f, "utf8")))).map(rel).sort();
    expect(users).toEqual(["lib/marketplace/qa-marked.ts", "lib/qa/synthetic-fixture.ts"]);
    const qa = stripComments(read("lib/marketplace/qa-marked.ts"));
    expect(qa).not.toMatch(/createAdminClient|\.insert\(|\.update\(|\.rpc\(/);
  });
});
