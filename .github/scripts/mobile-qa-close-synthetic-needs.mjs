#!/usr/bin/env node
// Cleanup after the signed-in mobile journeys (runs with `if: always()`).
// Closes every OPEN need the synthetic review identity posted with the mobile
// journey marker, through the product's own capability door (demand.close_draft
// → demand.close_confirm, the same path a person uses). Nothing else is touched.
//
// Env: MOBILE_QA_EMAIL, MOBILE_QA_PASSWORD (production-qa secrets), ANON_KEY
// (public), ORIGIN (default https://labourmarket.ai). Prints counts only —
// never the address, a token or a row id (the repository is public).
const MARKER = "QA-SYNTHETIC mobile";
const { MOBILE_QA_EMAIL: email, MOBILE_QA_PASSWORD: password, ANON_KEY: anon } = process.env;
const origin = (process.env.ORIGIN || "https://labourmarket.ai").replace(/\/$/, "");
if (!email || !password || !anon) {
  console.log("cleanup skipped: review identity or anon key not configured (nothing could have been posted)");
  process.exit(0);
}
const ref = JSON.parse(Buffer.from(anon.split(".")[1] || "", "base64url").toString() || "{}").ref;
if (!ref) {
  console.error("::error::anon key carries no project ref");
  process.exit(1);
}
const auth = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!auth.ok) {
  console.error(`::error::cleanup sign-in refused (HTTP ${auth.status}) — close any open "${MARKER}" need by hand`);
  process.exit(1);
}
const { access_token: token } = await auth.json();
let id = 0;
async function call(name, args) {
  const r = await fetch(`${origin}/api/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await r.text();
  const body = JSON.parse(text.startsWith("event:") ? text.split("data: ").pop() : text);
  const res = body.result ?? {};
  return res.structuredContent ?? JSON.parse(res.content?.[0]?.text ?? "{}");
}
const listed = await call("demand_list", {});
// demand.list answers { actingFor, needs: [{ id, title, status, role, … }] }; the
// envelope may or may not carry it under `data`.
const listedNeeds = listed.needs ?? listed.data?.needs;
if (!Array.isArray(listedNeeds)) {
  console.error("::error::demand_list returned no needs array — close any open marked need by hand");
  process.exit(1);
}
const rows = listedNeeds;
const mine = rows.filter((n) => JSON.stringify(n).includes(MARKER) && !/closed|cancel/i.test(String(n.status ?? "")));
let closed = 0;
let failed = 0;
for (const n of mine) {
  const d = await call("demand_close_draft", { requestId: n.id });
  const confirmationToken = d.confirmationToken ?? d.data?.confirmationToken;
  const c = confirmationToken ? await call("demand_close_confirm", { requestId: n.id, confirmationToken }) : null;
  if (c && c.ok !== false) closed += 1;
  else failed += 1;
}
console.log(`cleanup: open synthetic mobile needs found=${mine.length} closed=${closed} failed=${failed}`);
if (failed > 0) process.exit(1);
