/**
 * Builds the owner visual review — a single self-contained HTML page with
 * every keyframe embedded, so the owner can judge the direction without
 * opening the repository.
 *
 *   node docs/design/living-world-r5/tools/build-review.mjs   (from apps/web)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const url = "file:///" + join(root, "flagship-goteborg.html").replace(/\\/g, "/");

const KEYS = [
  [0, "Šalis", "Švedija, prieš darbo dieną", "Reljefas kyla ten, kur yra daugiausia realaus darbo. 41 432 atviros galimybės, 21 regionas, 290 miestų."],
  [1, "Regionas", "Vakarų pakrantė", "Kamera leidžiasi. 6 289 galimybės Västra Götaland regione, 49 miestuose."],
  [2, "Prie miesto", "Ten, kur upė pasitinka jūrą", "Paskutinis geometrijos kadras. Toliau pasaulį rodo tikra fotografija."],
  [3, "Miestas", "Göteborgas — ekonomika, ne taškas", "Kranas kadre dar prieš bet kokį žymėjimą. 3 078 galimybės, 1 036 darbdaviai, 36 profesijos."],
  [4, "Krantinė", "Krovinys nuleidžiamas", "Nuo čia istorija turi objektą. 98 sandėlio galimybės mieste, 40 darbdavių."],
  [6, "Darbas", "Žmogus, ne duomenų eilutė", "Siunta priimama, sutikrinama, paženklinama."],
  [7, "Detalė", "Etiketė. Skenavimas. Rezultatas", "Arčiausias kadras kelyje — kokybės kartelė visam pasauliui."],
  [8, "Darbo dienoraštis", "Šis darbas dabar yra tavo istorijos dalis", "Įrašas atsiranda ten, kur buvo padarytas darbas. Jokių balų, jokių XP."],
  [9, "Ką sistema žino", "Du nauji dalykai — apie darbą, ne apie žmogų", "Krautuvo valdymas ir siuntų skenavimas turi pagrindą: jie užfiksuoti iš realaus darbo."],
  [10, "Nauja kryptis", "Tas pats darbas atidaro kitas duris", "78 vairuotojo galimybės mieste, 61 darbdavys. Ko trūksta — parodoma atvirai."],
  [12, "Kita profesija", "Kažkieno darbas prasideda ten, kur baigėsi mano", "72 virėjo, 55 virtuvės pagalbininko, 51 padavėjo."],
  [14, "Atgal", "Tas pats kadras, kitaip matomas", "Viena gija viename mieste vienoje šalyje."],
];

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function shoot(viewport, mobile, quality) {
  const page = await browser.newPage({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  const out = [];
  for (const [beat] of KEYS) {
    await page.evaluate((k) => window.R5Camera && window.R5Camera.goTo(k), beat);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await page.waitForTimeout(600);
    const buf = await page.screenshot({ type: "jpeg", quality });
    out.push("data:image/jpeg;base64," + buf.toString("base64"));
  }
  await page.close();
  return out;
}

console.log("shooting desktop…");
const desktop = await shoot({ width: 1280, height: 800 }, false, 62);
console.log("shooting mobile…");
const mobile = await shoot({ width: 390, height: 844 }, true, 62);
await browser.close();

const rows = KEYS.map(
  ([, scale, title, note], i) => `
<figure class="frame">
  <img src="${desktop[i]}" alt="${title}" loading="lazy" width="1280" height="800">
  <figcaption>
    <span class="scale">${String(i + 1).padStart(2, "0")} · ${scale}</span>
    <strong>${title}</strong>
    <span class="note">${note}</span>
  </figcaption>
</figure>`,
).join("");

const phones = KEYS.map(
  ([, , title], i) => `
<figure class="phone">
  <img src="${mobile[i]}" alt="${title} — mobilus" loading="lazy" width="390" height="844">
  <figcaption>${title}</figcaption>
</figure>`,
).join("");

const html = `<title>Living Opportunity World</title>
<style>
:root{
  --paper:#f6f3ee; --ink:#1a1714; --soft:#57524b; --rule:#ddd6cb; --accent:#9a4a24;
  --card:#fffdfa;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --paper:#14120f; --ink:#f2ede5; --soft:#a9a196; --rule:#332e28; --card:#1c1915;
}}
:root[data-theme="dark"]{
  --paper:#14120f; --ink:#f2ede5; --soft:#a9a196; --rule:#332e28; --card:#1c1915;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.6;font-size:16px}
img{max-width:100%;height:auto;display:block}
.wrap{max-width:74rem;margin:0 auto;padding:clamp(1.5rem,5vw,4.5rem) clamp(1rem,4vw,3rem) 6rem}
h1{font-family:var(--serif);font-weight:400;font-size:clamp(2.2rem,6.5vw,4.4rem);line-height:1.02;letter-spacing:-.022em;margin:0 0 .6rem}
.lede{font-size:clamp(1rem,1.6vw,1.18rem);color:var(--soft);max-width:44rem;margin:0 0 2rem}
.tag{display:inline-block;font-family:var(--mono);font-size:.64rem;letter-spacing:.14em;text-transform:uppercase;
  border:1px solid var(--rule);border-radius:2px;padding:.28rem .6rem;color:var(--soft);margin:0 .4rem .5rem 0}
h2{font-family:var(--serif);font-weight:400;font-size:clamp(1.5rem,3.2vw,2.3rem);line-height:1.1;letter-spacing:-.015em;
  margin:3.4rem 0 .4rem;padding-top:1.6rem;border-top:1px solid var(--rule)}
h3{font-size:.98rem;margin:1.8rem 0 .5rem}
p{margin:0 0 .9rem;max-width:44rem}
.soft{color:var(--soft)}
.frame{margin:0 0 2.6rem}
.frame img{border-radius:3px;border:1px solid var(--rule)}
.frame figcaption{display:grid;gap:.15rem;padding:.7rem .1rem 0}
.scale{font-family:var(--mono);font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.frame strong{font-family:var(--serif);font-weight:400;font-size:1.2rem}
.note{color:var(--soft);font-size:.88rem}
.phones{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:1.3rem}
.phone figcaption{font-size:.76rem;color:var(--soft);padding-top:.45rem}
.phone img{border-radius:10px;border:1px solid var(--rule)}
table{border-collapse:collapse;width:100%;font-size:.9rem;margin:0 0 1.4rem}
.scroller{overflow-x:auto}
th,td{text-align:left;padding:.5rem .7rem;border-bottom:1px solid var(--rule)}
th{font-family:var(--mono);font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);font-weight:500}
td.n{font-family:var(--mono)}
.win{color:var(--accent);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem;margin:1.2rem 0 1.6rem}
.card{background:var(--card);border:1px solid var(--rule);border-radius:4px;padding:1rem 1.1rem}
.card b{display:block;font-family:var(--mono);font-size:1.3rem;letter-spacing:-.01em}
.card span{display:block;font-size:.78rem;color:var(--soft);margin-top:.15rem}
ul{max-width:44rem;padding-left:1.1rem}
li{margin:0 0 .4rem}
.verdict{background:var(--card);border:1px solid var(--rule);border-left:3px solid var(--accent);
  border-radius:4px;padding:1.1rem 1.2rem;margin:1.4rem 0}
.verdict p{margin:0 0 .5rem}
.verdict p:last-child{margin:0}
code{font-family:var(--mono);font-size:.86em}
</style>

<div class="wrap">

<p><span class="tag">R&amp;D prototipas</span><span class="tag">produkcija nepaliesta</span><span class="tag">PR #1166</span></p>

<h1>Living Opportunity World</h1>
<p class="lede">
Kamera, keliaujanti per gyvą ekonomiką: nuo šalies reljefo, kurį formuoja
realus darbo kiekis, iki rankų, kurios tą darbą atlieka — ir atgal.
Švedija, Göteborgas, viena siunta.
</p>

<h2>Kaip veikia pasaulis</h2>
<p>
Makro kadrai yra <strong>tikras 3D</strong> — WebGL be jokių bibliotekų, be CDN,
be kompiliavimo. Krantų linijos yra tikra Natural Earth geografija.
Jūra, dangus, žema saulė, migla ir krantų nuolydis yra scenoje, o ne
paveikslėlyje.
</p>
<p>
Svarbiausia: <strong>žemė kyla ten, kur yra darbo.</strong> Reljefo aukštis
ateina iš gyvų gamybinių skaičių — Göteborgas ir Stokholmas yra aukštumos
todėl, kad taip sako inventorius. Jokių taškų žemėlapyje, jokių šviečiančių
tinklo linijų, jokio HUD.
</p>
<p>
Žmogaus mastelio kadrai yra tikra fotografija, judinama toje pačioje
perspektyvoje — todėl perėjimas nuo šalies iki rankų neatrodo kaip skaidrių
peržiūra.
</p>

<h2>Kodėl Göteborgas — pagal duomenis, ne pagal skonį</h2>
<div class="scroller">
<table>
<tr><th>Miestas</th><th>Atviros galimybės</th><th>Profesijų tolygumas</th><th>Profesijų ≥20</th><th>Profesijų ≥50</th></tr>
<tr><td class="win">Göteborgas</td><td class="n">3 078</td><td class="n win">0,841</td><td class="n">17</td><td class="n">12</td></tr>
<tr><td>Stokholmas</td><td class="n">6 523</td><td class="n">0,815</td><td class="n">20</td><td class="n">15</td></tr>
<tr><td>Malmė</td><td class="n">1 522</td><td class="n">0,868</td><td class="n">11</td><td class="n">3</td></tr>
</table>
</div>
<p class="soft">
Stokholmas didesnis, bet slauga ir paslaugos sutelkia ~47 % jo klasifikuotos
imties — grandinė silpnesnė. Malmė tolygesnė, bet tik 3 profesijos viršija 50 —
grandinė nutrūksta. Göteborgas vienintelis iš didelės apimties miestų išlaiko
visą grandinę vienoje geografijoje.
</p>

<h2>Kameros kelias — 12 kadrų iš tikros patirties</h2>
<p class="soft">Kiekvienas kadras nufotografuotas iš veikiančio prototipo, ne piešinys.</p>
${rows}

<h2>Mobilus — atskira kryptis, ne apkarpytas desktopas</h2>
<p class="soft">Vertikalus gylis vietoj šoninio judesio; vienas mastelis viename ekrane.</p>
<div class="phones">${phones}</div>

<h2>Realūs duomenys</h2>
<div class="grid">
  <div class="card"><b>41 432</b><span>atviros galimybės Švedijoje</span></div>
  <div class="card"><b>21</b><span>regionai</span></div>
  <div class="card"><b>290</b><span>miestai</span></div>
  <div class="card"><b>7 782</b><span>darbdaviai</span></div>
  <div class="card"><b>3 078</b><span>galimybės Göteborge</span></div>
  <div class="card"><b>1 036</b><span>darbdaviai Göteborge</span></div>
</div>
<p class="soft">
Užklausta 2026-08-15 · inventorius atnaujintas 17:34 UTC · šaltinis
Arbetsförmedlingen vieši skelbimai (CC0). Skaičiai sensta ir prieš kiekvieną
naudojimą užklausiami iš naujo.
</p>

<h3>Ko sistema neturi — ir kur tai matoma</h3>
<ul>
<li><strong>Koordinačių nėra nė vienam iš 41 461 įrašo.</strong> Todėl žymima tik
miesto vieta pagal viešą koordinatę — niekada darbo vieta.</li>
<li><strong>Tik 41,5 % įrašų turi profesiją.</strong> Kiekvienas profesijos
skaičius tai pasako ekrane.</li>
<li><strong>Seni profesijų žymenys užteršti</strong> — jie išmesti iš visų skaičiavimų.</li>
<li>Nė vienas darbdavys neįvardytas. Nėra atlyginimų, atitikties procentų,
žmogaus vertinimo, XP.</li>
</ul>

<h2>Darbo dienoraštis — priežastingumas, ne balas</h2>
<p>
Žmogus atlieka darbą → jį užrašo → sistema turi faktinį pagrindą dviem
dalykams, kurių anksčiau nežinojo (krautuvo valdymas, siuntų skenavimas) →
dėl to tampa matoma kita reali kryptis: 78 vairuotojo galimybės tame pačiame
mieste, ir atvirai pasakoma, ko dar trūksta.
</p>
<p>
Tai veikia ir tada, kai žmogus <strong>jau turi darbą</strong> — grįžti verta
todėl, kad istorija auga, o ne todėl, kad kada nors gal prireiks ieškoti.
</p>

<h2>Kas ekrane niekada nepasirodo</h2>
<p>
Prototipe nėra nė vieno techninio termino, funkcijos pavadinimo ar verdikto
kodo. Variklio įrodymas perkeltas į testą
(<code>r5-living-world-journey.test.ts</code>, 6 testai, žali), kuris prilipdo
prototipo teiginius prie gamybinių modulių — todėl dizaino prototipas
negali tyliai nutolti nuo sistemos, kurią vaizduoja.
</p>

<h2>Kas dar nepadaryta</h2>
<p>Sąžiningai — ši apžvalga apima pasaulį ir Göteborgo kelią. Dar nepadaryta:</p>
<ul>
<li>darbuotojo, darbdavio, paieškos ir galimybės detalės produktinės plokštumos ta pačia kalba;</li>
<li>trumpas antros srities (ne darbo) įrodymas — architektūra veikia ir yra padengta testu, bet vizualiai neperdaryta po korekcijos;</li>
<li>produkcinė fotografija: dabar naudojamos Unsplash nuotraukos tik R&amp;D tikslais.</li>
</ul>

<div class="verdict">
<p><strong>Sprendimas:</strong> APPROVE — tęsti šia kryptimi ir daryti produktines plokštumas.</p>
<p><strong>CORRECT</strong> — kryptis gera, bet įvardyti, kas keistina.</p>
<p><strong>REJECT</strong> — kryptis netinka.</p>
</div>

</div>`;

const file = join(root, "owner-review.html");
writeFileSync(file, html);
console.log(
  "wrote",
  file,
  (html.length / 1024 / 1024).toFixed(2) + "MB",
);
