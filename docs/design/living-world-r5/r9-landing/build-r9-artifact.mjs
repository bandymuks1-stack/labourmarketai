/**
 * Self-contained R9 landing preview — no external requests at all:
 * inlines r9.css, world-data.js (real coastline + counts), world3d.js, r9.js.
 *   node docs/design/living-world-r5/r9-landing/build-r9-artifact.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const html = read("index.html");
const cut = (s, a, b) => s.slice(s.indexOf(a) + a.length, s.indexOf(b));

const out = `<title>LabourMarket.ai</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${read("r9.css")}
</style>
${cut(html, "<!--ARTIFACT-BODY-START-->", "<!--ARTIFACT-BODY-END-->")}
<script>
${read("../assets/world-data.js")}
</script>
<script>
${read("../assets/world3d.js")}
</script>
<script>
${read("r9.js")}
</script>
`;
writeFileSync(join(here, "owner-preview-r9.html"), out);
console.log("wrote owner-preview-r9.html", (out.length / 1024).toFixed(0) + "KB");
