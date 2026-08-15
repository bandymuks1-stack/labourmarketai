/**
 * Builds the self-contained R7 owner preview from product.html:
 *   - downloads every R7_IMG entry and embeds it as a data URI
 *   - inlines r7.css, world-data.js, world3d.js, r7-data.js, r7.js
 *   - emits an artifact-shaped file (no doctype/html/head/body — the
 *     artifact host wraps it) at owner-preview-r7.html
 *
 *   node docs/design/living-world-r5/r7/build-artifact-r7.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

const html = read("product.html");
const css = read("r7.css");
const imagesJs = read("r7-images.js");
const worldData = read("../assets/world-data.js");
const world3d = read("../assets/world3d.js");
const data = read("r7-data.js");
const app = read("r7.js");

const manifest = {};
for (const m of imagesJs.matchAll(/(\w+):\s*"(https:[^"]+)"/g)) manifest[m[1]] = m[2];

const dataUris = {};
let total = 0;
for (const [key, url] of Object.entries(manifest)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${key}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") || "image/jpeg";
  dataUris[key] = `data:${type};base64,${buf.toString("base64")}`;
  total += buf.length;
  console.log(key.padEnd(10), (buf.length / 1024).toFixed(0) + "KB");
}
console.log("images total", (total / 1024 / 1024).toFixed(2) + "MB");

const cut = (s, a, b) => {
  const i = s.indexOf(a), j = s.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`markers missing: ${a}`);
  return s.slice(i + a.length, j);
};
const body = cut(html, "<!--ARTIFACT-BODY-START-->", "<!--ARTIFACT-BODY-END-->");

const out = `<title>LabourMarket.ai R7</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${css}
</style>
${body}
<script>
window.R7_IMG = ${JSON.stringify(dataUris)};
</script>
<script>
${worldData}
</script>
<script>
${world3d}
</script>
<script>
${data}
</script>
<script>
${app}
</script>
`;

const file = join(here, "owner-preview-r7.html");
writeFileSync(file, out);
console.log("wrote", file, (out.length / 1024 / 1024).toFixed(2) + "MB");
