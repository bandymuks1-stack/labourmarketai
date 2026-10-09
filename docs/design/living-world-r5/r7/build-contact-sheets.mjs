/** Builds desktop + mobile contact sheets (artifact-shaped, data-URI PNGs). */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const img = (f) => "data:image/png;base64," + readFileSync(join(here, "review", f + ".png")).toString("base64");

const css = `
:root { --bg:#0a0d14; --panel:#131824; --line:rgba(158,178,216,.12); --ink:#e8edf6; --dim:#8b97ad; --amber:#f0a25c; }
* { box-sizing:border-box; margin:0; }
body { background:var(--bg); color:var(--ink); font:14px/1.5 "Segoe UI",system-ui,sans-serif; padding:28px; }
h1 { font-size:20px; margin-bottom:4px; } h1 i { font-style:normal; color:var(--amber); }
.sub { color:var(--dim); font-size:12.5px; margin-bottom:24px; }
.grid { display:grid; gap:22px; }
.d { grid-template-columns:repeat(auto-fill,minmax(430px,1fr)); }
.m { grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); }
figure { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
figure img { width:100%; display:block; }
figcaption { padding:10px 14px; font-size:12px; color:var(--dim); border-top:1px solid var(--line); }
figcaption b { color:var(--ink); font-family:ui-monospace,Consolas,monospace; margin-right:8px; }
`;

const D = [
  ["01_ENTRY", "Įėjimas — gyvas pasaulis po produktu"],
  ["02_PERSONAL_WORKSPACE", "Mano erdvė — pokalbis keičia produktą"],
  ["03_WORK_JOURNAL", "Dienoraštis — kasdienis darbo įrankis"],
  ["04_LIVING_IDENTITY", "Gyvoji tapatybė — gebėjimų žemėlapis"],
  ["05_OPPORTUNITY_DISCOVERY", "Kryptys — paieška natūralia kalba"],
  ["06_OPPORTUNITY_DETAIL", "Krypties detalė — faktinės sąsajos"],
  ["07_ORGANIZATION_WORKSPACE", "Organizacija — šiandienos operacijos"],
  ["08_PROJECT_OBJECT", "Objektas — Terminalo plėtra"],
  ["09_CAPACITY_INQUIRY", "Pajėgumo trūkumas → užklausa"],
  ["10_DISCOVERY", "Atitikmenys pagal įrodymus + rinkos faktas"],
  ["11_LIVING_WORLD", "Gyvasis pasaulis — Švedija"],
  ["11b_LIVING_WORLD_GOTEBORG", "Gyvasis pasaulis — Göteborg → į produktą"],
];
const M = [
  ["M_01_WORKSPACE", "Mano erdvė"],
  ["M_02_JOURNAL", "Dienoraštis"],
  ["M_03_OPPORTUNITY", "Kryptys"],
  ["M_04_ORGANIZATION", "Organizacija"],
];

function sheet(title, sub, cls, items) {
  return `<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
<h1>LabourMarket<i>.ai</i> — ${title}</h1>
<p class="sub">${sub}</p>
<div class="grid ${cls}">
${items.map(([f, cap]) => `<figure><img src="${img(f)}" alt="${cap}"><figcaption><b>${f}</b>${cap}</figcaption></figure>`).join("\n")}
</div>
`;
}

writeFileSync(join(here, "contact-sheet-desktop.html"),
  sheet("R7 darbastalio vaizdai", "1440 × 900 · visos 11 privalomų aplikacijos zonų + Göteborg priartėjimas · R&D prototipas", "d", D));
writeFileSync(join(here, "contact-sheet-mobile.html"),
  sheet("R7 mobilūs vaizdai", "390 × 844 · keturios pagrindinės zonos · R&D prototipas", "m", M));
console.log("sheets written");
