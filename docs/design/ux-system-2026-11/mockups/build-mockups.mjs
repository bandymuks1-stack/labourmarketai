// Static concept mockups for the three design directions (2026-11-03).
// NOT wired into the product: plain HTML, fictional people, every board is
// labelled "Koncepcija". Run: `node build-mockups.mjs` → writes direction-*.html.
// The LM mark is the production file, referenced, never redrawn.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MARK = "../../../../apps/web/public/brand/lm-mark.svg";

const DIRECTIONS = {
  a: {
    name: "A · Ramus darbo stalas",
    sub: "Šviesus vienas produktas, obsidiano rėmas, auksas tik pagrindiniam veiksmui",
    vars: `--bg:#F5F4EF;--surface:#FFFFFF;--surface-2:#FAF9F5;--line:#E3E0D6;--text:#151513;--text-2:#55534C;--muted:#77746B;
      --brand:#8C6A16;--on-brand:#FFFFFF;--rail:#0E0E0C;--rail-text:#E9E5DA;--rail-muted:#9C988C;--rail-active:#1E1D1A;
      --ok:#1F7A4D;--ok-bg:#E6F2EA;--info:#1D5F8A;--info-bg:#E5EFF6;--warn:#8A5A00;--warn-bg:#F8EFD9;--radius:10px;--shadow:0 1px 2px rgba(20,20,18,.06);
      --chrome-bg:#FFFFFF;--chrome-blur:none;--font:"Inter","Segoe UI",system-ui,sans-serif;--display:"Inter","Segoe UI",system-ui,sans-serif;--h-weight:650;`,
  },
  b: {
    name: "B · Obsidiano dirbtuvė",
    sub: "Tamsus produktas (užšaldyta klasė 4e695e261), šviesus viešas puslapis, šampano kraštai",
    vars: `--bg:#070706;--surface:#151513;--surface-2:#1B1B18;--line:#2B2A26;--text:#F1EDE3;--text-2:#C4BFB2;--muted:#8F8A7E;
      --brand:#D4AF37;--on-brand:#141209;--rail:#0B0B0A;--rail-text:#E9E5DA;--rail-muted:#8F8A7E;--rail-active:#1E1D1A;
      --ok:#5BC48A;--ok-bg:rgba(91,196,138,.12);--info:#6FB6E0;--info-bg:rgba(111,182,224,.12);--warn:#E2B04A;--warn-bg:rgba(226,176,74,.12);--radius:14px;--shadow:0 1px 0 rgba(255,236,205,.06) inset,0 8px 24px rgba(0,0,0,.35);
      --chrome-bg:#0B0B0A;--chrome-blur:none;--font:"Inter","Segoe UI",system-ui,sans-serif;--display:"Bricolage Grotesque","Segoe UI Semibold",system-ui,sans-serif;--h-weight:700;`,
  },
  c: {
    name: "C · Stiklo laukas",
    sub: "HIG / Liquid Glass principai: permatomas rėmas virš turinio, didesni spinduliai, gimtoji mobili jausena",
    vars: `--bg:radial-gradient(1200px 700px at 15% -10%,#F3E7C8 0%,transparent 60%),radial-gradient(900px 600px at 100% 0%,#DCE6EE 0%,transparent 55%),#F2F1EC;--surface:rgba(255,255,255,.78);--surface-2:rgba(255,255,255,.6);--line:rgba(20,20,18,.08);--text:#121210;--text-2:#4F4D47;--muted:#75726A;
      --brand:#8C6A16;--on-brand:#FFFFFF;--rail:rgba(255,255,255,.55);--rail-text:#151513;--rail-muted:#6E6B63;--rail-active:rgba(255,255,255,.9);
      --ok:#1F7A4D;--ok-bg:#E3F1E8;--info:#1D5F8A;--info-bg:#E3EEF6;--warn:#8A5A00;--warn-bg:#F7EDD4;--radius:20px;--shadow:0 1px 1px rgba(0,0,0,.04),0 10px 30px rgba(30,30,20,.08);
      --chrome-bg:rgba(255,255,255,.55);--chrome-blur:blur(22px) saturate(160%);--font:"Inter","Segoe UI",system-ui,sans-serif;--display:"Inter","Segoe UI",system-ui,sans-serif;--h-weight:700;`,
  },
};

const CSS = `
*{box-sizing:border-box;margin:0}body{font-family:var(--font);color:var(--text);background:#2a2a28;padding:32px;font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
.board{width:var(--w);height:var(--h);background:var(--bg);background-color:#F2F1EC;overflow:hidden;position:relative;margin:0 auto 40px;border-radius:6px}
.dir-b .board{background-color:#070706}
.board[style*="390px"] .tag{top:16px;bottom:auto;right:64px}
.tag{position:absolute;right:12px;bottom:10px;font-size:11px;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:2px 10px;z-index:9}
.caption{color:#d8d4c8;font:600 13px/1.4 var(--font);width:var(--w);margin:0 auto 8px}
.row{display:flex;gap:16px}.col{display:flex;flex-direction:column;gap:12px}.grow{flex:1}.between{justify-content:space-between}.center{align-items:center}
h1,h2,h3{font-family:var(--display);font-weight:var(--h-weight);letter-spacing:-.01em}
h1{font-size:44px;line-height:1.08}h2{font-size:20px}h3{font-size:15px}
.t2{color:var(--text-2)}.mut{color:var(--muted);font-size:12.5px}.num{font-variant-numeric:tabular-nums}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px}
.btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:calc(var(--radius) - 2px);border:1px solid var(--line);background:var(--surface);color:var(--text);font-weight:600;font-size:14px;white-space:nowrap}
.btn.primary{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}.btn.sm{height:32px;padding:0 12px;font-size:13px}
.chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid var(--line);color:var(--text-2);background:var(--surface-2)}
.chip.ok{color:var(--ok);background:var(--ok-bg);border-color:transparent}.chip.info{color:var(--info);background:var(--info-bg);border-color:transparent}.chip.warn{color:var(--warn);background:var(--warn-bg);border-color:transparent}
.dot{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}.ring{width:8px;height:8px;border-radius:50%;border:1.5px solid currentColor;display:inline-block}
.plate{display:inline-grid;place-items:center;border-radius:28%;font-weight:650;color:var(--text);border:1px solid var(--line);flex:none}
.p1{background:#E9DCD3}.p2{background:#DCE3D3}.p3{background:#DFDAD0}.p4{background:#D3E2E1}.p5{background:#DED6E6}
.dir-b .p1{background:#3A2F2B}.dir-b .p2{background:#2F3529}.dir-b .p3{background:#36322B}.dir-b .p4{background:#2A3534}.dir-b .p5{background:#332D3A}
.input{height:44px;border:1px solid var(--line);border-radius:calc(var(--radius) - 2px);background:var(--surface);display:flex;align-items:center;padding:0 14px;color:var(--muted);gap:10px}
.header{height:64px;display:flex;align-items:center;gap:28px;padding:0 40px;background:var(--chrome-bg);backdrop-filter:var(--chrome-blur);-webkit-backdrop-filter:var(--chrome-blur);border-bottom:1px solid var(--line)}
.logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:17px;letter-spacing:-.01em}.logo img{height:22px}.logo b{color:var(--brand)}
.nav a{color:var(--text-2);margin-right:22px;font-weight:500}.nav a.on{color:var(--text);font-weight:650}
.shell{display:flex;height:100%}
.rail{width:232px;background:var(--rail);backdrop-filter:var(--chrome-blur);-webkit-backdrop-filter:var(--chrome-blur);color:var(--rail-text);padding:18px 12px;display:flex;flex-direction:column;gap:4px;border-right:1px solid var(--line)}
.rail .logo{padding:4px 10px 18px;color:var(--rail-text)}
.rail a{display:flex;align-items:center;gap:10px;height:38px;padding:0 10px;border-radius:8px;color:var(--rail-muted);font-weight:550}
.rail a.on{background:var(--rail-active);color:var(--rail-text)}.rail .sec{font-size:11px;color:var(--rail-muted);padding:14px 10px 4px}
.rail .ws{margin-top:auto;border-top:1px solid var(--line);padding:12px 10px 0;font-size:12.5px;color:var(--rail-muted)}
.main{flex:1;padding:28px 32px;overflow:hidden;display:flex;flex-direction:column;gap:18px}
.ico{width:18px;height:18px;border-radius:5px;border:1.6px solid currentColor;opacity:.8;flex:none}
table{width:100%;border-collapse:collapse}th{font-size:12px;color:var(--muted);font-weight:600;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.bar{height:6px;border-radius:99px;background:var(--line);overflow:hidden}.bar i{display:block;height:100%;background:var(--text-2)}
.tabbar{position:absolute;left:0;right:0;bottom:0;height:78px;padding:8px 10px 22px;display:flex;justify-content:space-around;align-items:center;background:var(--chrome-bg);backdrop-filter:var(--chrome-blur);-webkit-backdrop-filter:var(--chrome-blur);border-top:1px solid var(--line)}
.tabbar div{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;color:var(--muted);font-weight:600;width:64px}.tabbar .on{color:var(--text)}
.tabbar .fab{width:52px;height:52px;border-radius:16px;background:var(--brand);color:var(--on-brand);display:grid;place-items:center;font-size:26px;margin-top:-18px;box-shadow:0 6px 18px rgba(140,106,22,.35)}
.kcol{flex:1;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);padding:10px;display:flex;flex-direction:column;gap:8px}
.kcard{background:var(--surface);border:1px solid var(--line);border-radius:calc(var(--radius) - 4px);padding:10px;display:flex;flex-direction:column;gap:6px}
`;

const plate = (i, s, cls) => `<span class="plate p${cls}" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.36)}px">${i}</span>`;
const icon = '<span class="ico"></span>';
const tag = '<span class="tag">Koncepcija · išgalvoti duomenys</span>';

const home = () => `
<div class="caption">1 · Pirmas apsilankymas (1440)</div>
<div class="board" style="--w:1440px;--h:900px">
  <div class="header"><span class="logo"><img src="${MARK}" alt=""><span>LabourMarket<b>.ai</b></span></span>
    <nav class="nav row" style="gap:0"><a>Darbo skelbimai</a><a>Žmonės ir komandos</a><a>Paslaugos</a><a>Kainos</a></nav>
    <span class="grow"></span><span class="mut">LT</span><a class="btn sm">Prisijungti</a><a class="btn sm primary">Pradėti nemokamai</a></div>
  <div style="padding:72px 40px 0;display:grid;grid-template-columns:1.05fr .95fr;gap:48px">
    <div class="col" style="gap:20px">
      <h1>Tavo darbas, žmonės ir galimybės — vienoje vietoje.</h1>
      <p class="t2" style="font-size:17px;max-width:560px">Rask darbą ar žmones, vesk projektų valandas ir leisk patirčiai virsti patikrinama istorija.</p>
      <div class="card col" style="gap:12px;padding:18px">
        <div class="mut" style="font-weight:600">Ko tau reikia?</div>
        <div class="input">${icon}Pvz.: reikia 4 plytelių klojėjų Kaune nuo gruodžio</div>
        <div class="row" style="gap:8px"><span class="chip">Ieškau darbo</span><span class="chip">Ieškau žmonių</span><span class="chip">Siūlau paslaugą</span><span class="chip">Mokymai</span></div>
      </div>
      <div class="row mut" style="gap:24px"><span class="num"><b style="color:var(--text)">53 095</b> darbo vietų iš oficialių šaltinių</span><span>11 kalbų</span><span>Nemokama darbuotojui</span></div>
    </div>
    <div class="col">
      ${[["Darbuotojui","Profilis, darbo žurnalas ir Living CV, kurį patvirtina vadovas.","Sukurti profilį"],
         ["Įmonei","Paieška pagal įrodytą patirtį, trumpasis sąrašas, projektai ir valandos.","Pateikti užklausą"],
         ["Agentūrai ir mokymo įstaigai","Rezervas, siūlymai klientams, kompetencijos ir praktika.","Kaip tai veikia"]]
        .map(([t, d, c], i) => `<div class="card row center" style="padding:18px;gap:16px">${plate(["D","Į","A"][i], 44, i + 1)}<div class="grow"><h3>${t}</h3><p class="t2" style="font-size:13.5px">${d}</p></div><a class="btn sm">${c}</a></div>`).join("")}
      <div class="card" style="padding:14px 18px"><div class="row between center"><span class="mut">Kaip patirtis tampa įrodymu</span><span class="row" style="gap:6px"><span class="chip"><span class="ring"></span>Įrašyta</span><span class="chip info"><span class="dot"></span>Su nuotrauka</span><span class="chip ok"><span class="dot"></span>Patvirtino vadovas</span></span></div></div>
    </div>
  </div>${tag}
</div>`;

const rail = (on, role) => `
  <aside class="rail"><span class="logo"><img src="${MARK}" alt=""><span>LabourMarket<b>.ai</b></span></span>
    ${(role === "worker"
      ? ["Šiandien", "Darbo žurnalas", "Living CV", "Darbai ir pasiūlymai", "Pokalbiai"]
      : ["Šiandien", "Žmonių paieška", "Projektai", "Valandos ir ataskaitos", "Pokalbiai"])
      .map((x) => `<a class="${x === on ? "on" : ""}">${icon}${x}</a>`).join("")}
    <div class="sec">Daugiau</div><a>${icon}${role === "worker" ? "Dokumentai" : "Agentūros ir rangovai"}</a><a>${icon}${role === "worker" ? "Mokymai" : "Prekyvietė"}</a>
    <div class="ws">${role === "worker" ? "Asmeninė erdvė" : "Įmonė · Statybų Partneriai"}<br><span style="color:var(--rail-text)">Keisti erdvę ▾</span></div>
  </aside>`;

const today = () => `
<div class="caption">2 · Darbuotojo „Šiandien“ + žurnalas (1440)</div>
<div class="board" style="--w:1440px;--h:900px"><div class="shell">${rail("Šiandien", "worker")}
  <main class="main">
    <div class="row between center"><div><div class="mut">Antradienis, lapkričio 3</div><h2 style="font-size:26px">Labas, Aiste</h2></div>
      <div class="row" style="gap:8px"><div class="input" style="width:320px;height:40px">${icon}Paklausk arba ieškok…</div><a class="btn primary">+ Įrašyti darbą</a></div></div>
    <div class="row" style="align-items:stretch">
      <div class="card grow col" style="gap:10px"><div class="row between"><h3>Laukia tavęs</h3><span class="chip warn">2</span></div>
        <div class="row center" style="gap:12px;padding:10px 0;border-top:1px solid var(--line)">${plate("SP", 36, 4)}<div class="grow"><b>Patvirtink vakarykštes valandas</b><div class="mut">Fasado renovacija · 8 h · vadovas laukia</div></div><a class="btn sm primary">Peržiūrėti</a></div>
        <div class="row center" style="gap:12px;padding:10px 0;border-top:1px solid var(--line)">${plate("NF", 36, 2)}<div class="grow"><b>Pasiūlymas: plytelių darbai, Oslas</b><div class="mut">Nuo gruodžio 1 · atsakyk iki penktadienio</div></div><a class="btn sm">Atsakyti</a></div></div>
      <div class="card col" style="width:360px;gap:10px"><h3>Ši savaitė</h3>
        <div class="row num" style="gap:6px;align-items:flex-end;height:90px">${[8, 8, 0, 0, 0, 0, 0].map((h, i) => `<div class="col center" style="flex:1;gap:4px"><div style="width:100%;height:${h * 9 + 2}px;border-radius:4px;background:${h ? "var(--text-2)" : "var(--line)"}"></div><span class="mut">${["Pr","An","Tr","Kt","Pn","Š","S"][i]}</span></div>`).join("")}</div>
        <div class="row between"><span class="mut">Įrašyta</span><b class="num">16 h</b></div><div class="row between"><span class="mut">Patvirtinta</span><b class="num">8 h</b></div></div>
    </div>
    <div class="card col" style="gap:0"><div class="row between center" style="padding-bottom:8px"><h3>Darbo žurnalas</h3><span class="row" style="gap:6px"><span class="chip">Savaitė</span><span class="chip">Mėnuo</span></span></div>
      <table><tr><th>Data</th><th>Projektas</th><th>Darbas</th><th class="num">Val.</th><th>Įrodymas</th></tr>
      ${[["Pr 11-02","Fasado renovacija","Apšiltinimo plokščių klijavimas, 2 aukštas","8","ok","Patvirtino vadovas"],["An 11-03","Fasado renovacija","Armavimo tinklelis, vakarinė siena","8","info","Su nuotrauka"],["Pn 10-30","Gyvenamasis namas Žvėrynas","Vonios plytelės, 6 m²","7,5","","Įrašyta"]]
        .map((r) => `<tr><td class="num mut">${r[0]}</td><td>${r[1]}</td><td class="t2">${r[2]}</td><td class="num"><b>${r[3]}</b></td><td><span class="chip ${r[4]}">${r[4] ? '<span class="dot"></span>' : '<span class="ring"></span>'}${r[5]}</span></td></tr>`).join("")}</table></div>
  </main></div>${tag}</div>`;

const search = () => `
<div class="caption">3 · Įmonė: žmonių paieška ir trumpasis sąrašas (1440)</div>
<div class="board" style="--w:1440px;--h:900px"><div class="shell">${rail("Žmonių paieška", "company")}
  <main class="main">
    <div class="row between center"><h2 style="font-size:26px">Žmonių paieška</h2><a class="btn">Trumpasis sąrašas · 3</a></div>
    <div class="row" style="gap:8px"><div class="input grow">${icon}Plytelių klojėjas</div><div class="input" style="width:170px">Šalis: Norvegija ▾</div><div class="input" style="width:190px">Laisvas nuo: 12-01 ▾</div><div class="input" style="width:210px">Įrodymai: patvirtinta ▾</div></div>
    <div class="mut">128 žmonės atitinka · rūšiuota pagal patvirtintą patirtį</div>
    <div class="card" style="padding:4px 12px"><table><tr><th>Žmogus</th><th>Patirtis</th><th>Įrodymai</th><th>Kalbos</th><th>Laisvas</th><th></th></tr>
      ${[["AP","Aistė P.","Plytelių klojėja · 9 m.","412 h patvirtinta","LT, EN","12-01",1,true],["MK","Marius K.","Plytelių klojėjas, hidroizoliacija","188 h patvirtinta","LT, NO","dabar",2,false],["OS","Olena S.","Apdailininkė · 6 m.","Profilis, be patvirtinimų","UA, PL, EN","01-05",3,false],["JV","Jonas V.","Plytelių klojėjas · 3 m.","96 h su nuotraukomis","LT","12-15",4,false]]
        .map((r) => `<tr><td><div class="row center" style="gap:10px">${plate(r[0], 36, r[6])}<b>${r[1]}</b></div></td><td class="t2">${r[2]}</td><td><span class="chip ${r[3].includes("patvirtinta") ? "ok" : r[3].includes("nuotrauk") ? "info" : ""}">${r[3].includes("be ") ? '<span class="ring"></span>' : '<span class="dot"></span>'}${r[3]}</span></td><td class="mut">${r[4]}</td><td class="num">${r[5]}</td><td style="text-align:right">${r[7] ? '<span class="chip">✓ Sąraše</span>' : '<a class="btn sm">+ Į sąrašą</a>'}</td></tr>`).join("")}
    </table></div>
    <div class="card row center between" style="padding:12px 16px"><span class="row center" style="gap:8px">${plate("AP", 28, 1)}${plate("RJ", 28, 5)}${plate("TB", 28, 3)}<span class="t2">3 žmonės trumpajame sąraše</span></span><a class="btn primary">Siųsti pasiūlymą</a></div>
  </main></div>${tag}</div>`;

const project = () => `
<div class="caption">4 · Projekto lenta: užduotys, komanda, valandos (1440)</div>
<div class="board" style="--w:1440px;--h:900px"><div class="shell">${rail("Projektai", "company")}
  <main class="main">
    <div class="row between center"><div><div class="mut">Projektai / Fasado renovacija</div><h2 style="font-size:26px">Fasado renovacija, Kaunas</h2></div><a class="btn primary">Paskirti komandą</a></div>
    <div class="row">${[["Valandos šią savaitę","142 / 160 h"],["Laukia patvirtinimo","24 h"],["Komanda","6 žmonės"],["Terminas","12-20 · 47 d."]]
      .map(([k, v]) => `<div class="card grow"><div class="mut">${k}</div><div class="num" style="font-size:22px;font-weight:650">${v}</div></div>`).join("")}</div>
    <div class="row" style="align-items:stretch;flex:1">
      ${[["Planuojama", [["Langų angokraščiai", "2 žmonės"], ["Pastolių perkėlimas", "Šiaurinė pusė"]]], ["Vyksta", [["Apšiltinimas, 2 aukštas", "4 žmonės · 64 h"], ["Armavimas, vakarai", "2 žmonės"]]], ["Laukia patvirtinimo", [["Gruntavimas, 1 aukštas", "24 h · 3 įrašai"]]], ["Užbaigta", [["Seno tinko nuėmimas", "212 h patvirtinta"]]]]
        .map(([t, cards], ci) => `<div class="kcol"><div class="row between center" style="padding:2px 4px"><b>${t}</b><span class="mut num">${cards.length}</span></div>${cards.map(([a, b]) => `<div class="kcard"><b style="font-size:13.5px">${a}</b><span class="mut">${b}</span><span class="row center" style="gap:4px">${plate("AP", 22, 1)}${plate("MK", 22, 2)}${ci === 2 ? '<span class="chip warn" style="margin-left:auto">Patvirtink</span>' : ci === 3 ? '<span class="chip ok" style="margin-left:auto"><span class="dot"></span>Patvirtinta</span>' : ""}</span></div>`).join("")}</div>`).join("")}
    </div>
  </main></div>${tag}</div>`;

const mobile = () => `
<div class="caption">5 · Telefonas: „Šiandien“ ir įmonės projektas (390)</div>
<div class="row" style="width:860px;margin:0 auto 40px;gap:40px">
  <div class="board" style="--w:390px;--h:844px;margin:0">
    <div style="padding:52px 18px 0" class="col"><div class="row between center"><span class="logo"><img src="${MARK}" alt="" style="height:20px"></span>${plate("AP", 34, 1)}</div>
      <div><div class="mut">Antradienis, lapkričio 3</div><h2 style="font-size:24px">Labas, Aiste</h2></div>
      <div class="card col" style="gap:8px"><div class="row between"><h3>Laukia tavęs</h3><span class="chip warn">2</span></div><b>Patvirtink vakarykštes valandas</b><div class="mut">Fasado renovacija · 8 h</div><a class="btn primary" style="justify-content:center">Peržiūrėti</a></div>
      <div class="card col" style="gap:6px"><div class="row between"><h3>Ši savaitė</h3><b class="num">16 h</b></div><div class="bar"><i style="width:40%"></i></div><div class="mut">8 h patvirtinta · 8 h laukia</div></div>
      <div class="card col" style="gap:8px"><h3>Paskutiniai įrašai</h3>
        <div class="row between center"><span>An · Armavimas</span><span class="chip info"><span class="dot"></span>Su nuotrauka</span></div>
        <div class="row between center"><span>Pr · Apšiltinimas</span><span class="chip ok"><span class="dot"></span>Patvirtinta</span></div></div>
    </div>
    <nav class="tabbar"><div class="on">${icon}Šiandien</div><div>${icon}Žurnalas</div><div><span class="fab">+</span></div><div>${icon}Darbai</div><div>${icon}CV</div></nav>${tag}
  </div>
  <div class="board" style="--w:390px;--h:844px;margin:0">
    <div style="padding:52px 18px 0" class="col"><div class="mut">‹ Projektai</div><h2 style="font-size:22px">Fasado renovacija</h2>
      <div class="row" style="gap:8px"><div class="card grow" style="padding:12px"><div class="mut">Šią savaitę</div><b class="num" style="font-size:18px">142 h</b></div><div class="card grow" style="padding:12px"><div class="mut">Laukia</div><b class="num" style="font-size:18px">24 h</b></div></div>
      <div class="row" style="gap:6px"><span class="chip" style="background:var(--surface);color:var(--text)">Vyksta · 2</span><span class="chip">Laukia · 1</span><span class="chip">Planuojama · 2</span></div>
      ${[["Apšiltinimas, 2 aukštas", "4 žmonės · 64 h"], ["Armavimas, vakarai", "2 žmonės · 18 h"]].map(([a, b]) => `<div class="card col" style="gap:6px"><b>${a}</b><span class="mut">${b}</span><span class="row" style="gap:4px">${plate("AP", 24, 1)}${plate("MK", 24, 2)}${plate("JV", 24, 4)}</span></div>`).join("")}
      <a class="btn primary" style="justify-content:center">Paskirti komandą</a></div>
    <nav class="tabbar"><div>${icon}Šiandien</div><div>${icon}Žmonės</div><div class="on">${icon}Projektai</div><div>${icon}Valandos</div><div>${icon}Pokalbiai</div></nav>${tag}
  </div></div>`;

for (const [key, d] of Object.entries(DIRECTIONS)) {
  const html = `<!doctype html><html lang="lt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${d.name}</title><style>:root{${d.vars}}${CSS}</style></head><body class="dir-${key}">
<div class="caption" style="font-size:20px;margin-bottom:2px">${d.name}</div><div class="caption" style="font-weight:400;margin-bottom:28px;color:#aaa69a">${d.sub}</div>
${home()}${today()}${search()}${project()}${mobile()}</body></html>`;
  writeFileSync(join(here, `direction-${key}.html`), html);
}
console.log("written direction-a/b/c.html");
