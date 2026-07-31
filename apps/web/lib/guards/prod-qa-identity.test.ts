import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import {
  PRODUCTION_ORIGIN,
  PROD_QA_IDENTITIES,
  PROD_QA_WORKER_EMAIL,
  ProdQaGuardError,
  assertProdQaTarget,
  describeProdQaTarget,
} from "@/lib/testing/prod-qa-guard";

/**
 * THE PRODUCTION QA IDENTITY GUARD.
 *
 * This guard is the only thing standing between a production service-role key
 * and an arbitrary account. Its refusals are the safety property, so they are
 * tested here directly rather than trusted to review.
 *
 * The owner's authorisation was explicit and narrow: ONE clearly-marked
 * synthetic QA account, no general production session-mint, and no weakening of
 * Auth, RLS or service-role protections. Each of those is an assertion below.
 */

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const GUARD = "lib/testing/prod-qa-guard.ts";
const MINT = "scripts/prod-qa-mint-session.ts";
const PROVISION = "scripts/prod-qa-provision.ts";
const LOCAL_GUARD = "lib/testing/local-supabase-guard.ts";

const PROD_URL = `${PRODUCTION_ORIGIN}`;

describe("exactly one synthetic identity is allowlisted", () => {
  it("the allowlist has one entry, and it is unmistakably synthetic", () => {
    expect(PROD_QA_IDENTITIES).toHaveLength(1);
    expect(PROD_QA_IDENTITIES[0]).toBe(PROD_QA_WORKER_EMAIL);
    expect(PROD_QA_WORKER_EMAIL).toMatch(/^qa\./);
    // `+` addressing keeps it routable to a mailbox the owner controls while
    // being obviously not a person's address.
    expect(PROD_QA_WORKER_EMAIL).toContain("+");
  });

  it("accepts the allowlisted identity against production", () => {
    const t = assertProdQaTarget({ url: PROD_URL, email: PROD_QA_WORKER_EMAIL });
    expect(t.email).toBe(PROD_QA_WORKER_EMAIL);
    expect(t.origin).toBe(PRODUCTION_ORIGIN);
  });

  it("normalises case and surrounding whitespace, and nothing else", () => {
    const t = assertProdQaTarget({
      url: PROD_URL,
      email: `  ${PROD_QA_WORKER_EMAIL.toUpperCase()}  `,
    });
    expect(t.email).toBe(PROD_QA_WORKER_EMAIL);
  });

  it("REFUSES every identity that is not the allowlisted one", () => {
    for (const email of [
      "someone@labourmarket.ai", //          a real user
      "qa.worker@labourmarket.ai", //        close, but not it
      "qa.worker+goal4@labourmarket.ai", //  same prefix, different tag
      "qa.worker+goal3@evil.example", //     same local part, other domain
      "qa.worker+goal3@labourmarket.ai.evil.example", // suffix attack
      "", //                                  nothing
      undefined,
    ]) {
      expect(
        () => assertProdQaTarget({ url: PROD_URL, email: email as string }),
        `must refuse: ${String(email)}`,
      ).toThrow(ProdQaGuardError);
    }
  });

  it("matches by equality, never by prefix or pattern", () => {
    // A `startsWith("qa.")` implementation would let this through, and it is
    // the exact mistake that turns a one-account allowlist into a wildcard.
    const src = read(GUARD);
    expect(src).not.toMatch(/startsWith\(\s*["']qa/i);
    expect(src).toMatch(/PROD_QA_IDENTITIES\.includes\(/);
  });
});

describe("the target must be production — this is not a general-purpose mint", () => {
  it("refuses a local target (that is the other script's job)", () => {
    for (const url of [
      "http://127.0.0.1:54321",
      "http://localhost:54321",
      "https://some-other-ref.supabase.co",
      // The APP origin, not the Supabase project origin — a plausible
      // copy-paste mistake. Built from the canonical constant so this file does
      // not itself re-advertise the legacy host that `single-domain-origin`
      // exists to keep out of the source.
      CANONICAL_ORIGIN,
      "not a url",
      undefined,
    ]) {
      expect(
        () => assertProdQaTarget({ url: url as string, email: PROD_QA_WORKER_EMAIL }),
        `must refuse target: ${String(url)}`,
      ).toThrow(ProdQaGuardError);
    }
  });

  it("refuses a key that belongs to a different project", () => {
    // A well-formed JWT whose `ref` claim is some other project.
    const claims = Buffer.from(JSON.stringify({ ref: "someotherproject" })).toString("base64url");
    const foreign = `eyJhbGciOiJIUzI1NiJ9.${claims}.sig`;
    expect(() =>
      assertProdQaTarget({
        url: PROD_URL,
        email: PROD_QA_WORKER_EMAIL,
        serviceKey: foreign,
      }),
    ).toThrow(ProdQaGuardError);
  });
});

describe("no secret ever reaches a log, a report or an artefact", () => {
  it("the target description carries origin and identity, never a key", () => {
    const line = describeProdQaTarget(
      assertProdQaTarget({ url: PROD_URL, email: PROD_QA_WORKER_EMAIL }),
    );
    expect(line).toContain(PRODUCTION_ORIGIN);
    expect(line).toContain(PROD_QA_WORKER_EMAIL);
    expect(line).not.toMatch(/eyJ/); // no JWT fragment
  });

  it("neither script prints a key or a token", () => {
    for (const f of [MINT, PROVISION]) {
      const src = read(f);
      // Keys are read from env and passed onward; they are never interpolated
      // into console output.
      expect(src, `${f} must not log a key`).not.toMatch(
        /console\.(info|log|error)\([^)]*(serviceKey|anonKey|access_token|refresh_token)/,
      );
    }
  });

  it("the minted session file is gitignored", () => {
    const ignore = readFileSync(join(WEB, "..", "..", ".gitignore"), "utf8");
    expect(ignore).toContain("/apps/web/tests/e2e/.storage-state.prod-qa.json");
  });
});

describe("the production path is a SCRIPT, never a reachable surface", () => {
  // 30s, not the 5s default. This walks app/, components/ and lib/ and reads
  // every .ts/.tsx in them; alone it takes ~2s, and under full-suite CPU
  // contention it intermittently crossed the default. A guard that fails on
  // load rather than on truth is worse than no guard.
  it("nothing in the app imports the production QA guard", { timeout: 30_000 }, () => {
    // If a route, server action or component ever imported this, the "no
    // general production session-mint endpoint" promise would be broken.
    // The guard itself and this test may name it; nothing that ships to a user
    // may. Paths are normalised because this repo is developed on Windows and a
    // separator mismatch would silently turn this assertion into a no-op.
    const ALLOWED = new Set([
      "lib/testing/prod-qa-guard.ts",
      "lib/guards/prod-qa-identity.test.ts",
    ]);
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const hit of grepTree(join(WEB, dir), /prod-qa-guard|prod-qa-mint|prod-qa-provision/)) {
        const rel = hit.slice(WEB.length + 1).replace(/\\/g, "/");
        if (!ALLOWED.has(rel)) offenders.push(rel);
      }
    }
    expect(offenders, `production QA helpers leaked into the app:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  it("provisioning requires an explicit production acknowledgement", () => {
    const src = read(PROVISION);
    expect(src).toContain("--i-understand-production");
    // …and refuses without it, rather than warning and proceeding.
    expect(src).toMatch(/if \(!argv\.includes\(ACK\)\)/);
  });

  it("the account is passwordless — there is no credential to leak", () => {
    const src = read(PROVISION);
    expect(src).not.toMatch(/password\s*:/);
    expect(src).toMatch(/email_confirm: true/);
    // And it is identifiable as synthetic from the database alone.
    expect(src).toMatch(/qa_synthetic: true/);
  });

  it("provisioning changes no Auth, RLS or service-role protection", () => {
    const src = read(PROVISION);
    // SQL-shaped only. The script has a `--revoke` FLAG that bans the QA
    // account's sessions — that is the removal procedure, not a policy change,
    // and a bare /revoke/ would have flagged the word in its own documentation.
    for (const forbidden of [
      /\.rpc\(/,
      /create\s+policy/i,
      /alter\s+policy/i,
      /drop\s+policy/i,
      /grant\s+(select|insert|update|delete|all|usage|execute)/i,
      /revoke\s+(select|insert|update|delete|all|usage|execute)/i,
      /security\s+definer/i,
      /alter\s+table/i,
    ]) {
      expect(forbidden.test(src), `provisioning must not touch: ${forbidden}`).toBe(false);
    }
  });
});

describe("the local guard was NOT weakened to make this possible", () => {
  it("the local helper still refuses every non-local target", () => {
    const src = read(LOCAL_GUARD);
    expect(src).toContain("REFUSED_NON_LOCAL_E2E_SESSION_MINT");
    expect(src).toContain("ALLOWED_LOCAL_ORIGINS");
    // No production escape hatch was added to it.
    expect(src).not.toMatch(/allowProduction|PROD_QA|skipLocalCheck/);
  });

  it("the local mint script gained no production mode", () => {
    const src = read("scripts/e2e-mint-session.ts");
    expect(src).toContain("resolveLocalSupabaseEnv");
    expect(src).not.toMatch(/PROD_QA|prod-qa/);
  });
});

describe("the gate refuses to run rather than pass for the wrong reason", () => {
  it("it fails loudly when the minted session is missing", () => {
    const spec = read("tests/e2e/employee-beta-gate.spec.ts");
    expect(spec).toMatch(/An unrun gate is NOT a passed gate/);
    expect(spec).toMatch(/storage-state\.prod-qa\.json/);
  });

  it("a check passes only with zero console errors and zero failed requests", () => {
    const spec = read("tests/e2e/employee-beta-gate.spec.ts");
    expect(spec).toMatch(/consoleErrors\.length === 0 && c\.failedRequests\.length === 0/);
  });

  it("it writes a machine-readable PASS/FAIL per check", () => {
    const spec = read("tests/e2e/employee-beta-gate.spec.ts");
    expect(spec).toMatch(/EMPLOYEE_BETA_PRODUCTION_GATE/);
    expect(spec).toMatch(/gate-results\.json/);
  });
});

// ── helpers ────────────────────────────────────────────────────────────────

function grepTree(dir: string, rx: RegExp): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      // Build and test ARTEFACTS. Skipped both because they cannot contain a
      // source import and because walking a directory another process is
      // actively writing makes this assertion intermittently unreliable — the
      // same failure mode `product-readiness`'s scan hit.
      if (
        entry === "node_modules" ||
        entry === ".next" ||
        entry === ".turbo" ||
        entry === "test-results" ||
        entry === "playwright-report"
      )
        continue;
      out.push(...grepTree(p, rx));
    } else if (/\.(ts|tsx)$/.test(p) && rx.test(readFileSync(p, "utf8"))) {
      out.push(p);
    }
  }
  return out;
}
