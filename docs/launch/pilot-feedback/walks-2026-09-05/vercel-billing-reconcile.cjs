// Vercel Production billing env reconciliation — ONE pass, idempotent, against the code contract (apps/web/lib/env.ts + lib/billing/config.ts).
// Owner directive 2026-09-05: reuse existing rows, UPDATE in place (rm + add of the same name/scope), REMOVE Preview billing scope,
// ADD the missing Production rows, never duplicate, never print a value. Runs from the repo root (the linked Vercel project).
//   node vercel-billing-reconcile.cjs plan     — read `vercel env ls`, print the action table (names + scopes only)
//   node vercel-billing-reconcile.cjs apply    — execute the plan; secrets come from %USERPROFILE%\.config\labourmarket\vercel-billing.env
//   node vercel-billing-reconcile.cjs verify   — re-list and assert the final Production/Preview state
// Secrets file (outside the repo, owner-written, never printed): lines
//   STRIPE_SECRET_KEY=rk_live_…   (or sk_live_)     STRIPE_WEBHOOK_SECRET=whsec_…     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…
const { spawnSync } = require("node:child_process"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const SECRETS = path.join(os.homedir(), ".config", "labourmarket", "vercel-billing.env");
const CMD = process.argv[2] || "plan";
const log = (o) => console.log(JSON.stringify(o));
const mask = (s) => String(s).replace(/(rk|sk|pk)_live_[A-Za-z0-9]+/g, "$1_live_***").replace(/whsec_[A-Za-z0-9]+/g, "whsec_***");
function vercel(args, input) {
  const r = spawnSync(process.platform === "win32" ? "vercel.cmd" : "vercel", args, { cwd: ROOT, encoding: "utf8", input, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" }, shell: process.platform === "win32" });
  return { code: r.status, out: mask((r.stdout || "") + (r.stderr || "")) };
}
// ── the contract ──────────────────────────────────────────────────────────────
const PUBLIC_TARGET = { PAYMENTS_ENABLED: "true", BILLING_PROVIDER: "stripe", STRIPE_MODE: "live", STRIPE_LIVE_ACTIVATION: "approved-by-owner", STRIPE_PRICE_COMPANY_PILOT: "price_1UCKgg637uptAg5zD8dMA6kU" };
const SECRET_TARGET = { STRIPE_SECRET_KEY: /^(rk|sk)_live_\S+$/, STRIPE_WEBHOOK_SECRET: /^whsec_\S+$/, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: /^pk_live_\S+$/ };
const REQUIRED = [...Object.keys(PUBLIC_TARGET), ...Object.keys(SECRET_TARGET)];
const LEGACY = ["STRIPE_PRICE_WORKER_PLUS", "STRIPE_PRICE_AGENCY_PILOT", "STRIPE_PUBLISHABLE_KEY", "BILLING_TEST_MODE", "PRICING_READINESS_STATE"];
const BILLING_RE = /^(STRIPE_|PAYMENTS_|BILLING_|PRICING_|NEXT_PUBLIC_STRIPE_)/;
// ── inventory ─────────────────────────────────────────────────────────────────
function inventory() {
  const r = vercel(["env", "ls"]);
  if (r.code !== 0) { console.error("VERCEL_ENV_LS_FAILED\n" + r.out.slice(0, 600)); process.exit(2); }
  const rows = [];
  for (const line of r.out.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s+(Encrypted|Plain|Sensitive|\S+)\s+(.+?)\s{2,}\S.*$/);
    if (!m) continue;
    const name = m[1]; const envs = m[3].split(/,\s*/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    rows.push({ name, envs });
  }
  return { rows, raw: r.out };
}
function plan(inv) {
  const actions = [];
  const byName = {};
  for (const row of inv.rows) { byName[row.name] = byName[row.name] || new Set(); row.envs.forEach((e) => byName[row.name].add(e)); }
  for (const name of REQUIRED) {
    const scopes = byName[name] || new Set();
    if (scopes.has("production")) actions.push({ name, scope: "production", action: "UPDATE", how: "rm production + add production", valueClass: PUBLIC_TARGET[name] ? "public: " + PUBLIC_TARGET[name] : "secret from owner file" });
    else actions.push({ name, scope: "production", action: "ADD", valueClass: PUBLIC_TARGET[name] ? "public: " + PUBLIC_TARGET[name] : "secret from owner file" });
    for (const s of ["preview", "development"]) if (scopes.has(s)) actions.push({ name, scope: s, action: "REMOVE", reason: "no preview deployments (#1521); test values must not coexist with live; code needs nothing in Preview (PAYMENTS_ENABLED defaults to false)" });
  }
  for (const row of inv.rows) {
    if (!BILLING_RE.test(row.name) || REQUIRED.includes(row.name)) continue;
    for (const s of row.envs) actions.push({ name: row.name, scope: s, action: "REMOVE", reason: LEGACY.includes(row.name) ? "legacy/superseded — no reader in current main" : "billing-named, no reader in current main (verify before apply)" });
  }
  return actions;
}
function readSecrets() {
  if (!fs.existsSync(SECRETS)) { console.error("NO_SECRETS_FILE: " + SECRETS + " — owner places three lines (never printed)"); process.exit(3); }
  const txt = fs.readFileSync(SECRETS, "utf8"); const out = {};
  for (const [name, re] of Object.entries(SECRET_TARGET)) {
    const m = txt.match(new RegExp("^" + name + "=(\\S+)\\s*$", "m"));
    if (!m) { console.error("SECRET_MISSING_IN_FILE: " + name); process.exit(3); }
    if (!re.test(m[1])) { console.error("SECRET_SHAPE_REFUSED: " + name + " does not match the live shape the code requires"); process.exit(3); }
    out[name] = m[1];
  }
  return out;
}
function apply(actions) {
  const secrets = readSecrets();
  const results = [];
  const removes = actions.filter((a) => a.action === "REMOVE" && a.scope !== "production");
  const prodSets = actions.filter((a) => a.scope === "production" && (a.action === "UPDATE" || a.action === "ADD"));
  const legacyProd = actions.filter((a) => a.action === "REMOVE" && a.scope === "production");
  for (const a of removes) { const r = vercel(["env", "rm", a.name, a.scope, "-y"]); results.push({ ...a, ok: r.code === 0, note: r.code === 0 ? "" : r.out.slice(0, 160) }); }
  for (const a of legacyProd) { const r = vercel(["env", "rm", a.name, "production", "-y"]); results.push({ ...a, ok: r.code === 0, note: r.code === 0 ? "" : r.out.slice(0, 160) }); }
  for (const a of prodSets) {
    const value = PUBLIC_TARGET[a.name] ?? secrets[a.name];
    if (a.action === "UPDATE") { const rm = vercel(["env", "rm", a.name, "production", "-y"]); if (rm.code !== 0) { results.push({ ...a, ok: false, note: "rm failed: " + rm.out.slice(0, 160) }); continue; } }
    const add = vercel(["env", "add", a.name, "production"], value + "\n");
    results.push({ ...a, ok: add.code === 0, note: add.code === 0 ? "" : add.out.slice(0, 200) });
  }
  return results;
}
function verify(inv) {
  const byName = {};
  for (const row of inv.rows) { byName[row.name] = byName[row.name] || new Set(); row.envs.forEach((e) => byName[row.name].add(e)); }
  const report = {};
  for (const name of REQUIRED) report[name] = { production: (byName[name] || new Set()).has("production"), preview: (byName[name] || new Set()).has("preview") };
  const stray = inv.rows.filter((r) => BILLING_RE.test(r.name) && !REQUIRED.includes(r.name)).map((r) => r.name + "@" + r.envs.join("+"));
  const ok = REQUIRED.every((n) => report[n].production && !report[n].preview) && stray.length === 0;
  return { ok, report, stray };
}
(function main() {
  const who = vercel(["whoami"]);
  if (who.code !== 0) { console.error("VERCEL_NOT_AUTHENTICATED\n" + who.out.slice(0, 300)); process.exit(4); }
  log({ vercelUser: who.out.trim().split(/\r?\n/).pop() });
  const inv = inventory();
  log({ inventory: inv.rows.filter((r) => BILLING_RE.test(r.name)) });
  if (CMD === "plan") { log({ plan: plan(inv) }); return; }
  if (CMD === "apply") { const results = apply(plan(inv)); log({ applied: results }); const v = verify(inventory()); log({ verify: v }); process.exit(v.ok ? 0 : 5); }
  if (CMD === "verify") { const v = verify(inv); log({ verify: v }); process.exit(v.ok ? 0 : 5); }
  console.error("unknown command"); process.exit(1);
})();
