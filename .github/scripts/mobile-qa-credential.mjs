#!/usr/bin/env node
// ONE-RUN PASSWORD for the mobile review identity (owner approval 2026-10-28:
// "use the existing synthetic qa.owner+multiw account for mobile QA").
//
//   node mobile-qa-credential.mjs issue     → sets a fresh random password on that ONE
//                                              account and exports MOBILE_QA_EMAIL /
//                                              MOBILE_QA_PASSWORD to $GITHUB_ENV (masked)
//   node mobile-qa-credential.mjs scramble  → sets another random password nobody sees
//                                              (run with `if: always()` after the journeys)
//
// The service key (SERVICE_ROLE_KEY, production-qa environment) is used ONLY for this
// admin password change; the app signs in like a person, with the one-run password.
// Refuses any address but the one below, any account not marked
// app_metadata.qa_synthetic, and any key not issued by the production project.
// Prints no password, token, address or id.
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";

const QA_EMAIL = "qa.owner+multiw@labourmarket.ai";
const PROJECT_REF = "gorgitwvdzxbnaxhrsrw";
const mode = process.argv[2];
const key = process.env.SERVICE_ROLE_KEY ?? "";
if (mode !== "issue" && mode !== "scramble") {
  console.error("usage: mobile-qa-credential.mjs issue|scramble");
  process.exit(2);
}
let claims = {};
try {
  claims = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString() || "{}");
} catch {
  claims = {};
}
if (claims.ref !== PROJECT_REF || claims.role !== "service_role") {
  console.error("::error::SERVICE_ROLE_KEY is not the production project's service key — nothing changed");
  process.exit(1);
}
const base = `https://${PROJECT_REF}.supabase.co/auth/v1/admin`;
const h = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

let user = null;
for (let page = 1; page <= 20 && !user; page += 1) {
  const r = await fetch(`${base}/users?page=${page}&per_page=200`, { headers: h });
  if (!r.ok) {
    console.error(`::error::admin user read failed (HTTP ${r.status}) — nothing changed`);
    process.exit(1);
  }
  const body = await r.json();
  const users = body.users ?? [];
  user = users.find((u) => (u.email ?? "").toLowerCase() === QA_EMAIL) ?? null;
  if (users.length < 200) break;
}
if (!user) {
  console.error("::error::the mobile review identity does not exist — nothing changed");
  process.exit(1);
}
if (user.app_metadata?.qa_synthetic !== true) {
  console.error("::error::the account is not marked qa_synthetic — refusing to touch it");
  process.exit(1);
}

const password = randomBytes(24).toString("base64url") + "Aa1!";
if (mode === "issue") console.log(`::add-mask::${password}`);
const put = await fetch(`${base}/users/${user.id}`, { method: "PUT", headers: h, body: JSON.stringify({ password }) });
if (!put.ok) {
  console.error(`::error::password ${mode} failed (HTTP ${put.status})`);
  process.exit(1);
}
if (mode === "issue") {
  const envFile = process.env.GITHUB_ENV;
  if (!envFile) {
    console.error("::error::GITHUB_ENV is not set — run this only inside the CI job");
    process.exit(1);
  }
  appendFileSync(envFile, `MOBILE_QA_EMAIL=${QA_EMAIL}\nMOBILE_QA_PASSWORD=${password}\n`);
  console.log("mobile review identity: one-run password issued (masked)");
} else {
  console.log("mobile review identity: password scrambled (nobody holds it)");
}
