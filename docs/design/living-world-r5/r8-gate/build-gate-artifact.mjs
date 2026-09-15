/**
 * Self-contained R8 gate preview: inlines gate.css + gate.js and embeds
 * every <img> src as a data URI (artifact CSP blocks external hosts).
 *   node docs/design/living-world-r5/r8-gate/build-gate-artifact.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "gate.html"), "utf8");
const css = readFileSync(join(here, "gate.css"), "utf8");
const js = readFileSync(join(here, "gate.js"), "utf8");

const urls = [...new Set([...html.matchAll(/src="(https:[^"]+)"/g)].map((m) => m[1]))];
const uris = {};
let total = 0;
for (const url of urls) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  uris[url] = `data:${res.headers.get("content-type") || "image/jpeg"};base64,${buf.toString("base64")}`;
  total += buf.length;
  console.log(url.slice(40, 76).padEnd(38), (buf.length / 1024).toFixed(0) + "KB");
}
console.log("images total", (total / 1024 / 1024).toFixed(2) + "MB");

const cut = (s, a, b) => s.slice(s.indexOf(a) + a.length, s.indexOf(b));
let body = cut(html, "<!--ARTIFACT-BODY-START-->", "<!--ARTIFACT-BODY-END-->");
for (const [url, uri] of Object.entries(uris)) body = body.split(url).join(uri);

const out = `<title>LabourMarket.ai R8</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${css}
</style>
${body}
<script>
${js}
</script>
`;
writeFileSync(join(here, "owner-preview-r8.html"), out);
console.log("wrote owner-preview-r8.html", (out.length / 1024 / 1024).toFixed(2) + "MB");
