// W4 Slice 2 browser proof — a REAL worker session submits the new document
// form; the row must land in worker_documents (service-key read-back) and the
// page must re-render it. Local stack only. Run: node scripts/w4-doc-write-proof.mjs
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3150";
const st = spawnSync("npx", ["supabase", "status", "-o", "json"], {
  cwd: "../..",
  shell: true,
  encoding: "utf8",
});
const sup = JSON.parse(st.stdout.slice(st.stdout.indexOf("{")));
if (!/127\.0\.0\.1|localhost/.test(sup.API_URL)) throw new Error("not local");
const H = {
  apikey: sup.SERVICE_ROLE_KEY,
  Authorization: `Bearer ${sup.SERVICE_ROLE_KEY}`,
};

// Clean slate for the proof document type.
const workerRes = await fetch(
  `${sup.API_URL}/rest/v1/workers?profile_id=eq.aaaaaaaa-0000-0000-0000-000000000001&select=id`,
  { headers: H },
);
const workerId = (await workerRes.json())[0].id;
await fetch(
  `${sup.API_URL}/rest/v1/worker_documents?worker_id=eq.${workerId}&document_type_slug=eq.professional_certificate`,
  { method: "DELETE", headers: H },
);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: "tests/e2e/.storage-state.worker.json",
});
const page = await ctx.newPage();
await page.goto(`${BASE}/lt/dashboard/documents`, { waitUntil: "domcontentloaded" });

const form = page.getByTestId("worker-document-form");
await form.waitFor({ state: "visible", timeout: 120_000 });
await form.locator('select[name="document_type_slug"]').selectOption("professional_certificate");
await form.locator('select[name="country"]').selectOption("NL");
// Status is a chip radio group (design pass) — "ready" is default-checked;
// exercise the control anyway by clicking its chip label.
await form.locator('input[name="status"][value="ready"] + span').click();
await form.locator('input[name="valid_until"]').fill("2027-06-30");
await form.locator('input[name="note"]').fill("W4 write-proof");
await page.getByTestId("worker-document-save").click();
await page.getByTestId("worker-document-saved").waitFor({ timeout: 60_000 });

// DB truth: the row exists with the submitted facts.
const rowRes = await fetch(
  `${sup.API_URL}/rest/v1/worker_documents?worker_id=eq.${workerId}&document_type_slug=eq.professional_certificate&select=status,country,valid_until,note`,
  { headers: H },
);
const rows = await rowRes.json();
console.log("DB row:", JSON.stringify(rows));
if (rows.length !== 1 || rows[0].status !== "ready" || rows[0].country !== "NL")
  throw new Error("row mismatch");

// Audit event exists.
const evRes = await fetch(
  `${sup.API_URL}/rest/v1/worker_document_events?select=event_type&order=created_at.desc&limit=1`,
  { headers: H },
);
console.log("last audit event:", JSON.stringify(await evRes.json()));

// The page re-rendered the row into the inventory list (the list shows
// type/status/validity — notes deliberately stay off the list).
await page.goto(`${BASE}/lt/dashboard/documents`, { waitUntil: "domcontentloaded" });
await page.getByTestId("documents-list").waitFor({ timeout: 60_000 });
const listText = await page.getByTestId("documents-list").innerText();
if (!listText.includes("2027")) throw new Error("saved row not rendered in the list");
console.log("list shows the saved row's validity: true");

await browser.close();
console.log("W4_DOC_WRITE_PROOF_OK");
