#!/usr/bin/env node
/**
 * APP LINKS / UNIVERSAL LINKS — proof of the SERVED half (F-4).
 *
 * Fetches the two association documents from an origin and checks them
 * against what the app claims:
 *   - /.well-known/assetlinks.json   → one statement per certificate, our
 *                                      package, SHA-256 fingerprints well-formed
 *   - /.well-known/apple-app-site-association
 *                                    → our bundle id under a Team ID, and the
 *                                      claimed components equal the app's
 *                                      route table (NATIVE_APP_PATHS), exact
 *                                      paths only
 * Both documents answer 404 until the owner sets ANDROID_CERT_FINGERPRINTS /
 * APPLE_TEAM_ID on the deploy (app-association.ts); this script says so by
 * name rather than failing opaquely. It proves what the host SERVES; whether a
 * phone trusts it also needs the signed build's certificate (Android) and the
 * Team ID's signature (iOS), which are the owner's — that half is the device
 * walk (REAL_DEVICE_TEST_PLAN §2, D13).
 *
 * Usage: node .github/scripts/app-links-proof.mjs https://labourmarket.ai
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const origin = (process.argv[2] ?? "https://labourmarket.ai").replace(/\/$/, "");

const assoc = readFileSync(join(ROOT, "apps/web/lib/mobile/app-association.ts"), "utf8");
const paths = [...assoc.matchAll(/NATIVE_APP_PATHS[^=]*=\s*\[([\s\S]*?)\];/)][0][1]
  .split(",")
  .map((s) => s.trim().replace(/^"|"$/g, ""))
  .filter(Boolean);
const bundleId = /IOS_BUNDLE_ID = "([^"]+)"/.exec(assoc)[1];
const packageName = /ANDROID_PACKAGE = "([^"]+)"/.exec(assoc)[1];
const FP = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;
const TEAM = /^[A-Z0-9]{10}$/;

let failures = 0;
const fail = (m) => { failures += 1; console.error(`FAIL  ${m}`); };
const pass = (m) => console.log(`PASS  ${m}`);

async function fetchDoc(path) {
  const res = await fetch(`${origin}${path}`, { redirect: "manual" });
  const text = await res.text();
  return { status: res.status, type: res.headers.get("content-type") ?? "", text };
}

const al = await fetchDoc("/.well-known/assetlinks.json");
if (al.status === 404) {
  console.log("INFO  assetlinks.json answers 404: ANDROID_CERT_FINGERPRINTS is not set on this deploy (owner gate O2) — not a server fault");
} else if (al.status !== 200) {
  fail(`assetlinks.json answered HTTP ${al.status}`);
} else {
  try {
    const doc = JSON.parse(al.text);
    if (!Array.isArray(doc) || doc.length === 0) fail("assetlinks.json is not a non-empty array");
    for (const st of doc) {
      if (st.target?.namespace !== "android_app") fail("statement namespace is not android_app");
      if (st.target?.package_name !== packageName) fail(`package_name ${st.target?.package_name} ≠ ${packageName}`);
      if (!Array.isArray(st.relation) || !st.relation.includes("delegate_permission/common.handle_all_urls")) fail("relation lacks handle_all_urls");
      for (const f of st.target?.sha256_cert_fingerprints ?? []) if (!FP.test(f)) fail(`malformed fingerprint ${f}`);
    }
    if (failures === 0) pass(`assetlinks.json: ${doc.length} statement(s) for ${packageName}, fingerprints well-formed`);
  } catch (e) { fail(`assetlinks.json is not JSON: ${e.message}`); }
}

const aasa = await fetchDoc("/.well-known/apple-app-site-association");
if (aasa.status === 404) {
  console.log("INFO  apple-app-site-association answers 404: APPLE_TEAM_ID is not set on this deploy (owner gate O3) — not a server fault");
} else if (aasa.status !== 200) {
  fail(`apple-app-site-association answered HTTP ${aasa.status}`);
} else {
  try {
    const doc = JSON.parse(aasa.text);
    const details = doc?.applinks?.details ?? [];
    if (details.length !== 1) fail(`expected one applinks.details entry, got ${details.length}`);
    const d = details[0] ?? {};
    const ids = d.appIDs ?? [];
    if (ids.length !== 1 || !ids[0].endsWith(`.${bundleId}`) || !TEAM.test(ids[0].split(".")[0])) fail(`appIDs ${JSON.stringify(ids)} is not <TEAMID>.${bundleId}`);
    const claimed = (d.components ?? []).map((c) => c["/"]);
    const want = [...paths];
    if (JSON.stringify(claimed) !== JSON.stringify(want)) fail(`claimed components ${JSON.stringify(claimed)} ≠ NATIVE_APP_PATHS ${JSON.stringify(want)}`);
    for (const c of claimed) if (/[*?]/.test(String(c))) fail(`component ${c} is a wildcard claim`);
    if (!/json/.test(aasa.type)) fail(`apple-app-site-association content-type is ${aasa.type}, Apple requires application/json`);
    if (failures === 0) pass(`apple-app-site-association: ${ids[0]} claims ${claimed.length} exact paths = NATIVE_APP_PATHS`);
  } catch (e) { fail(`apple-app-site-association is not JSON: ${e.message}`); }
}

const health = await fetchDoc("/api/health");
console.log(`INFO  /api/health HTTP ${health.status} ${health.text.slice(0, 160).replace(/\s+/g, " ")}`);

if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log("APP_LINKS_SERVED_PROVEN (or honestly 404 until the owner's values exist)");
