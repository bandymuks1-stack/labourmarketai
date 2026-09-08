/** Self-contained R11 visual-target page (artifact-shaped). */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const lib = read("lmworld.js");
const page = read("target-desktop.html");
const style = page.split("<style>")[1].split("</style>")[0];
const scene = page.split('<script src="lmworld.js"></script>')[1].split("</script>")[0].replace("<script>", "");
const out = `<title>LabourMarket.ai — gyvas pasaulis</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${style}</style>
<div class="wm">LabourMarket<i>.ai</i></div>
<svg id="s" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice"></svg>
<script>${lib}</script>
<script>${scene}</script>
`;
writeFileSync(join(here, "owner-target-r11.html"), out);
console.log("wrote owner-target-r11.html", (out.length / 1024).toFixed(0) + "KB");
