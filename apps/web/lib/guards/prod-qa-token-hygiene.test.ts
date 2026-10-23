import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { qaApiOrigin, qaAppOrigin } from "../../tests/e2e/prod-qa-api";
import { PRODUCTION_ORIGIN } from "../testing/prod-qa-guard";

/**
 * PRODUCTION QA SESSION TOKENS — the owner's six conditions (2026-10-19),
 * executable. The API-level production walks send each synthetic person's own
 * token to Supabase to prove permissions (CodeQL "file data in outbound network
 * request"). That is intended ONLY under these rules:
 *   1. only allowlisted synthetic identities;
 *   2. only the production project's own API, over HTTPS;
 *   3. never into logs, artefacts, errors, GitHub or third parties;
 *   4. session files never in the repository, owner-only permissions;
 *   5. the API address cannot be redirected by untrusted input;
 *   6. sessions revoked and deleted after every walk.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");
const api = read(join(APP, "tests/e2e/prod-qa-api.ts"));
const workflow = read(join(REPO, ".github/workflows/prod-qa-walk.yml"));
const mint = read(join(APP, "scripts/prod-qa-mint-session.ts"));
const revoke = read(join(APP, "scripts/prod-qa-revoke-sessions.ts"));

describe("1. only allowlisted synthetic identities", () => {
  it("the shared helper refuses a token whose e-mail is not on the allowlist", () => {
    expect(api).toMatch(/PROD_QA_IDENTITIES\.includes\(claims\.email\)/);
  });
  it("the mint script resolves the identity through the production QA guard", () => {
    expect(mint).toMatch(/prod-qa-guard/);
  });
});

describe("2 + 5. only the production API over HTTPS; the address is not an input", () => {
  const saved = process.env.PROD_QA_SUPABASE_URL;
  afterEach(() => {
    process.env.PROD_QA_SUPABASE_URL = saved;
  });
  it("accepts exactly the production origin", () => {
    process.env.PROD_QA_SUPABASE_URL = `${PRODUCTION_ORIGIN}/`;
    expect(qaApiOrigin()).toBe(PRODUCTION_ORIGIN);
  });
  it.each([
    ["plain http", PRODUCTION_ORIGIN.replace("https:", "http:")],
    ["another host", "https://attacker.example"],
    ["a look-alike", `${PRODUCTION_ORIGIN}.attacker.example`],
    ["another project", "https://abcdefghijklmnopqrst.supabase.co"],
    ["empty", ""],
  ])("refuses %s before any request", (_label, value) => {
    process.env.PROD_QA_SUPABASE_URL = value;
    expect(() => qaApiOrigin()).toThrow();
  });
  it.each([
    ["plain http", "http://labourmarket.ai"],
    ["another host", "https://attacker.example"],
    ["a look-alike", "https://labourmarket.ai.attacker.example"],
  ])("the MCP endpoint refuses %s", (_label, value) => {
    const prev = process.env.PLAYWRIGHT_BASE_URL;
    process.env.PLAYWRIGHT_BASE_URL = value;
    try {
      expect(() => qaAppOrigin()).toThrow();
    } finally {
      process.env.PLAYWRIGHT_BASE_URL = prev;
    }
  });
  it("the token must be issued by that same origin, and a redirect cannot carry it away", () => {
    expect(api).toMatch(/claims\.iss\.startsWith\(`\$\{PRODUCTION_ORIGIN\}\/`\)/);
    expect(api).toMatch(/redirect: "error"/);
  });
  it("the workflow takes the URL from a repository secret, and dispatch inputs cannot set it", () => {
    expect(workflow).toMatch(/PROD_QA_SUPABASE_URL: \$\{\{ secrets\.NEXT_PUBLIC_SUPABASE_URL \}\}/);
    const inputs = workflow.slice(workflow.indexOf("workflow_dispatch:"), workflow.indexOf("\n  push:"));
    expect(inputs).not.toMatch(/url|supabase|origin|host/i);
  });
  it("no production walk sends a bearer token except through the shared helper", () => {
    const dir = join(APP, "tests/e2e");
    const offenders = readdirSync(dir)
      .filter((f) => /^prod-.*\.spec\.ts$/.test(f))
      .filter((f) => /authorization:\s*`Bearer/.test(read(join(dir, f))));
    expect(offenders).toEqual([]);
  });
});

describe("3. never into logs, artefacts or messages", () => {
  it("the artefact uploads only the result and the walk log — no session, trace or screenshot", () => {
    const upload = workflow.slice(workflow.indexOf("- name: Upload result"));
    const paths = upload.slice(upload.indexOf("path: |"), upload.indexOf("path: |") + 120);
    expect(paths).toMatch(/prod-qa-result\.json/);
    expect(paths).toMatch(/prod-qa-walk\.log/);
    expect(paths).not.toMatch(/storage-state|test-results|\.zip|trace/);
    expect(workflow).toMatch(/--trace=off/);
  });
  it("the helper never logs or throws a token value", () => {
    expect(api).not.toMatch(/console\./);
    expect(api).not.toMatch(/\$\{token\}`\)|Error\([^)]*token\b/);
  });
  it("the mint and the revoke scripts print metadata and counts, never the token", () => {
    expect(mint).toMatch(/Metadata only — never the token/);
    expect(revoke).not.toMatch(/console\.(info|error)\([^)]*(token|email)\b/);
  });
});

describe("4. never in the repository, owner-only on disk", () => {
  it("every session file is gitignored", () => {
    expect(read(join(REPO, ".gitignore"))).toMatch(/\/apps\/web\/tests\/e2e\/\.storage-state\*\.json/);
  });
  it("the mint writes 0600 and the workflow's copy keeps 0600", () => {
    expect(mint).toMatch(/mode: 0o600/);
    expect(mint).toMatch(/chmodSync\(out\.path, 0o600\)/);
    expect(workflow).toMatch(/install -m 600 tests\/e2e\/\.storage-state\.prod-qa\.worker2\.json/);
    expect(workflow).not.toMatch(/\bcp tests\/e2e\/\.storage-state/);
  });
});

describe("6. sessions are revoked and deleted after every walk", () => {
  it("an always-run step revokes every session at Supabase and fails if a file survives", () => {
    const step = workflow.slice(workflow.indexOf("- name: Revoke and delete the synthetic sessions"));
    expect(step).toMatch(/if: always\(\)/);
    expect(step).toMatch(/scripts\/prod-qa-revoke-sessions\.ts/);
    expect(step).toMatch(/a session file survived cleanup/);
    expect(workflow.indexOf("Revoke and delete the synthetic sessions")).toBeLessThan(workflow.indexOf("- name: Upload result"));
  });
  it("the revoke script logs each session out (scope=local) and deletes the file whatever the answer", () => {
    expect(revoke).toMatch(/\/auth\/v1\/logout\?scope=local/);
    expect(revoke).toMatch(/unlinkSync\(path\)/);
    expect(revoke).toMatch(/redirect: "error"/);
  });
});
