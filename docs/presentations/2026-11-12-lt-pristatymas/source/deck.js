// LabourMarket.ai — LT pristatymas. Text lives in one STRINGS-like structure per slide
// so EN / RU versions can be produced by swapping text only (layouts stay the same).
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");
const sizeOf = (p) => { const b = fs.readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

const S = "/tmp/claude-0/-home-user-labourmarketai/9d90af5e-3497-57b2-9ef1-78fd93b719d2/scratchpad";
const IMG = S + "/img/";
const OUT = process.argv[2] || S + "/LabourMarket_AI_Pristatymas_LT.pptx";
const AREAS = JSON.parse(fs.readFileSync(S + "/areas.json", "utf8"));

const THEME = {
  name: "LabourMarket.ai",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "14161A", lt1: "FFFFFF", dk2: "0B0C0E", lt2: "F2F3F5",
    accent1: "FFA100", accent2: "1E8E4E", accent3: "2563EB", accent4: "6B7280",
    accent5: "B45309", accent6: "9CA3AF", hlink: "2563EB", folHlink: "6B7280",
  },
};
const HEX = THEME.colors;
const ST = {
  V: { label: "VEIKIA", fill: "1E8E4E" },
  T: { label: "SUKURTA / TIKRINAMA", fill: "2563EB" },
  P: { label: "PLANUOJAMA", fill: "6B7280" },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.title = "LabourMarket.ai — platformos pristatymas";
pres.author = "LabourMarket.ai";
pres.company = "LabourMarket.ai";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

const FOOT = "LabourMarket.ai · Pristatymas · 2026-11";
pres.defineSlideMaster({
  title: "LM_CONTENT",
  background: { color: "FFFFFF" },
  objects: [
    { image: { x: 12.45, y: 6.93, w: 0.36, h: 0.34, path: IMG + "mark_orange.png" } },
    { text: { text: FOOT, options: { x: 0.6, y: 6.95, w: 7, h: 0.3, fontSize: 10, color: "6B7280", margin: 0 } } },
  ],
  placeholders: [],
  slideNumber: { x: 11.7, y: 6.95, w: 0.6, h: 0.3, fontSize: 10, color: "6B7280", align: "right" },
});
pres.defineSlideMaster({
  title: "LM_DARK",
  background: { color: "000000" },
  objects: [],
});

let sectionName = null;
function section(t) { pres.addSection({ title: t }); sectionName = t; }
function slide(master = "LM_CONTENT") { return pres.addSlide({ masterName: master, sectionTitle: sectionName }); }

function title(s, t, sub) {
  s.addText(t, { x: 0.6, y: 0.4, w: 12.1, h: 0.75, fontSize: 32, bold: true, color: C.text1, margin: 0, isTextBox: true, fontFace: THEME.headFontFace });
  if (sub) s.addText(sub, { x: 0.6, y: 1.12, w: 12.1, h: 0.45, fontSize: 16, color: "4B5563", margin: 0, isTextBox: true });
}
function chip(s, st, x, y, w = 2.05) {
  const d = ST[st];
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.3, rectRadius: 0.15, fill: { color: d.fill }, line: { color: d.fill } });
  s.addText(d.label, { x, y, w, h: 0.3, fontSize: 10, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true });
}
function legend(s, x = 0.6, y = 6.45) {
  let cx = x;
  for (const k of ["V", "T", "P"]) { chip(s, k, cx, y, k === "T" ? 2.05 : 1.25); cx += (k === "T" ? 2.05 : 1.25) + 0.15; }
}
// image fitted (contain) into a box with a light frame + caption
function shot(s, file, x, y, w, h, caption) {
  const p = IMG + file; const d = sizeOf(p);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: "F2F3F5" }, line: { color: "E5E7EB", width: 1 } });
  const pad = 0.12; const bw = w - 2 * pad, bh = h - 2 * pad;
  const r = Math.min(bw / d.w, bh / d.h); const iw = d.w * r, ih = d.h * r;
  s.addImage({ path: p, x: x + pad + (bw - iw) / 2, y: y + pad + (bh - ih) / 2, w: iw, h: ih, altText: caption || "Platformos ekrano vaizdas" });
  if (caption) s.addText(caption, { x, y: y + h + 0.05, w, h: 0.3, fontSize: 10, italic: true, color: "6B7280", margin: 0, isTextBox: true });
}
// rows of feature lines with status chip: items = [[text, st, id]]
function featureList(s, items, x, y, w, rowH = 0.43, fs = 14) {
  items.forEach(([t, st, id], i) => {
    const yy = y + i * rowH;
    chip(s, st, x, yy + (rowH - 0.3) / 2 - 0.02, st === "T" ? 2.05 : 1.25);
    s.addText([
      { text: t, options: { color: C.text1 } },
      ...(id ? [{ text: "  " + id, options: { color: "9CA3AF", fontSize: fs - 4 } }] : []),
    ], { x: x + 2.2, y: yy, w: w - 2.2, h: rowH, fontSize: fs, valign: "middle", margin: 0, isTextBox: true });
  });
}
// "Kam / Ką gali / Nauda" block
function whoWhat(s, x, y, w, rows) {
  rows.forEach(([k, v], i) => {
    const yy = y + i * 0.62;
    s.addText(k.toUpperCase(), { x, y: yy, w: 1.3, h: 0.55, fontSize: 11, bold: true, color: "B45309", margin: 0, valign: "top", isTextBox: true, charSpacing: 1 });
    s.addText(v, { x: x + 1.35, y: yy, w: w - 1.35, h: 0.55, fontSize: 14, color: C.text1, margin: 0, valign: "top", isTextBox: true });
  });
}
function card(s, x, y, w, h, head, body, opts = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: opts.fill || "F2F3F5" }, line: { color: opts.line || "F2F3F5" } });
  if (opts.num) {
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: y + 0.25, w: 0.5, h: 0.5, fill: { color: "FFA100" }, line: { color: "FFA100" } });
    s.addText(String(opts.num), { x: x + 0.25, y: y + 0.25, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: "0B0C0E", align: "center", valign: "middle", margin: 0, isTextBox: true });
  }
  const tx = opts.num ? x + 0.9 : x + 0.25;
  s.addText(head, { x: tx, y: y + 0.22, w: w - (tx - x) - 0.2, h: 0.55, fontSize: opts.headSize || 17, bold: true, color: opts.headColor || C.text1, margin: 0, valign: "middle", isTextBox: true });
  if (body) s.addText(body, { x: x + 0.25, y: y + 0.85, w: w - 0.45, h: h - 1.0, fontSize: opts.bodySize || 14, color: opts.bodyColor || "374151", margin: 0, valign: "top", isTextBox: true });
  if (opts.st) chip(s, opts.st, x + 0.25, y + h - 0.45, opts.st === "T" ? 2.05 : 1.25);
}
// standard feature slide: left who/what + list, right screenshot
function featureSlide({ t, sub, who, items, img, cap, notes, listFs }) {
  const s = slide(); title(s, t, sub);
  if (who) whoWhat(s, 0.6, 1.75, 6.3, who);
  const ly = who ? 1.75 + who.length * 0.62 + 0.1 : 1.8;
  featureList(s, items, 0.6, ly, 6.4, items.length > 8 ? 0.4 : 0.44, listFs || (items.length > 8 ? 13 : 14));
  if (img) shot(s, img, 7.3, 1.75, 5.45, 4.45, cap);
  legend(s, 7.3, 6.45);
  if (notes) s.addNotes(notes);
  return s;
}
const CAP = "Tikras platformos ekranas, testinė aplinka, sintetiniai duomenys. Dabartinė versija gali šiek tiek skirtis.";

// ───────────────────────── 1. Titulinė
section("Įžanga");
{
  const s = slide("LM_DARK");
  s.addImage({ path: IMG + "logo_block.png", x: 0.9, y: 1.2, w: 7.6, h: 7.6 * (sizeOf(IMG + "logo_block.png").h / sizeOf(IMG + "logo_block.png").w), altText: "LabourMarket.ai logotipas" });
  s.addText("Viena platforma darbuotojams, darbdaviams ir įmonėms", { x: 0.9, y: 3.75, w: 11.5, h: 0.8, fontSize: 34, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
  s.addText("Visų profesijų ir ekonomikos sektorių darbo, žmonių ir įmonių bendradarbiavimo platforma — nuo poreikio iki atlikto, patvirtinto darbo.", { x: 0.9, y: 4.6, w: 10.5, h: 0.9, fontSize: 18, color: "D1D5DB", margin: 0, isTextBox: true });
  s.addText("Platformos pristatymas · susitikimas dėl testuotojo patirties · 2026 m. lapkritis", { x: 0.9, y: 6.3, w: 11, h: 0.4, fontSize: 14, color: "FFA100", margin: 0, isTextBox: true });
  s.addNotes("Pristatymo tikslas: parodyti visą viziją, ką jau galima naudoti, kas sukurta bet dar tikrinama, ir kas planuojama. Kiekviena funkcija pažymėta būsena iš funkcijų registro (docs/program/FUNCTION_REGISTER.md).");
}

// ───────────────────────── 2. Problema
{
  const s = slide(); title(s, "Kokią problemą sprendžiame", "Darbo rinka išskaidyta: žmonės, įmonės ir darbai nemato vieni kitų");
  const P = [
    ["Fragmentuota rinka", "Skelbimai, agentūros, subrangovai ir paslaugos — atskiruose portaluose, kalbose ir šalyse."],
    ["Tarpininkų grandinės", "Tarp užsakovo ir žmogaus — kelios grandys. Brangiau, lėčiau, mažiau aiškumo abiem pusėms."],
    ["Sunku rasti vienas kitą", "Įmonės neranda žmonių ir komandų; specialistai neranda užsakovų ir patikimų darbdavių."],
    ["Patirtis neįrodoma", "CV — tik deklaracija. Realiai atlikti darbai, valandos ir patvirtinimai niekur nesikaupia."],
  ];
  P.forEach(([h, b], i) => card(s, 0.6 + i * 3.1, 1.9, 2.9, 3.6, h, b, { num: i + 1, bodySize: 15 }));
  s.addText("LabourMarket.ai jungia šias dalis į vieną sistemą: poreikis, pasiūlymas, bendravimas, vykdymas ir patvirtinta darbo istorija.", { x: 0.6, y: 5.85, w: 12.1, h: 0.6, fontSize: 17, bold: true, color: "B45309", margin: 0, isTextBox: true });
}

// ───────────────────────── 3. Ekosistema
{
  const s = slide(); title(s, "Kaip veikia visa ekosistema", "Vienas darbo grafas: visi dalyviai ir jų ryšiai vienoje vietoje");
  const cx = 6.67, cy = 3.75;
  s.addShape(pres.shapes.OVAL, { x: cx - 1.35, y: cy - 0.75, w: 2.7, h: 1.5, fill: { color: "0B0C0E" }, line: { color: "FFA100", width: 2 } });
  s.addText([{ text: "LabourMarket", options: { color: "FFFFFF", bold: true } }, { text: ".ai", options: { color: "FFA100", bold: true } }], { x: cx - 1.35, y: cy - 0.75, w: 2.7, h: 1.5, fontSize: 18, align: "center", valign: "middle", margin: 0, isTextBox: true });
  const N = [
    ["Darbuotojai ir specialistai", 0.6, 1.75], ["Darbdaviai ir įmonės", 9.5, 1.75],
    ["Įdarbinimo agentūros", 0.6, 3.4], ["Paslaugų teikėjai ir užsakovai", 9.5, 3.4],
    ["Komandos, brigados, subrangovai", 0.6, 5.05], ["Mokymo įstaigos", 9.5, 5.05],
  ];
  const E = [
    "Susidomėjimas poreikiu, kontaktas, pokalbis", "Poreikis → kandidatai → trumpasis sąrašas",
    "Pasiūla → agentūros ir kliento tiltas → pasiūlymas", "Paslaugos užklausa → atsakymas → susirašinėjimas",
    "Komandos pasiūlymas → priskyrimas projektui", "Praktika → kompetencija → pripažinimas",
  ];
  N.forEach(([n, x, y], i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 3.25, h: 1.25, rectRadius: 0.1, fill: { color: "F2F3F5" }, line: { color: "E5E7EB" } });
    s.addText(n, { x: x + 0.2, y: y + 0.1, w: 2.85, h: 0.5, fontSize: 15, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true });
    s.addText(E[i], { x: x + 0.2, y: y + 0.6, w: 2.85, h: 0.55, fontSize: 11, color: "4B5563", margin: 0, valign: "top", isTextBox: true });
    const left = x < 5;
    const x1 = left ? x + 3.25 : x, y1 = y + 0.62;
    const x2 = left ? cx - 1.3 : cx + 1.3, y2 = cy;
    s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.max(Math.abs(y2 - y1), 0.001), flipV: (left ? y1 > y2 : y1 < y2), line: { color: "FFA100", width: 1.5 } });
  });
  s.addText("Realus darbas → įrodymai → gebėjimai → poreikis → atitiktis → vykdymas → patvirtinta istorija", { x: 3.95, y: 5.35, w: 5.4, h: 0.9, fontSize: 13, bold: true, color: "B45309", align: "center", valign: "middle", margin: 0, isTextBox: true });
  s.addText("Visi šeši ryšiai patvirtinti produkcijos eisenomis (registro kelionės J-3, J-5, J-9, J-10, J-11, J-12).", { x: 0.6, y: 6.45, w: 10.8, h: 0.35, fontSize: 11, italic: true, color: "6B7280", margin: 0, isTextBox: true });
}

// ───────────────────────── 4. Kam skirta
{
  const s = slide(); title(s, "Kam skirta platforma", "Visos profesijos ir sektoriai — ne tik statybos ir ne tik viena šalis");
  const A = [
    ["Darbuotojai", "Profilis, gyvas CV, darbo žurnalas, darbo paieška, susidomėjimas poreikiais.", "V"],
    ["Individualūs specialistai", "Savo paslaugų siūlymas bet kuriai įmonei ar asmeniui iš asmeninės paskyros.", "V"],
    ["Įmonės ir darbdaviai", "Poreikiai, kandidatai, projektai, komanda, valandos, dokumentai.", "V"],
    ["Įdarbinimo agentūros", "Įmonės tipas: pasiūlos deklaravimas, klientų tiltas, kandidatų siūlymas.", "V"],
    ["Paslaugų užsakovai", "Užsakovo erdvė: paslaugų paieška, užklausos, susirašinėjimas.", "V"],
    ["Subrangovai ir komandos", "Brigados formavimas, komandos pasiūlymas, B2B derybos.", "V"],
  ];
  A.forEach(([h, b, st], i) => card(s, 0.6 + (i % 3) * 4.1, 1.8 + Math.floor(i / 3) * 2.3, 3.9, 2.1, h, b, { st, bodySize: 13 }));
  s.addText("Agentūra ir užsakovas naujiems naudotojams nesiūlomi kaip atskiros rolės: agentūra kuriama kaip įmonė, užsakymas — tai veiksmas. Esamos tokių paskyrų erdvės veikia.", { x: 0.6, y: 6.45, w: 12.1, h: 0.4, fontSize: 11, italic: true, color: "6B7280", margin: 0, isTextBox: true });
}

// ───────────────────────── 5. Registracija
section("Naudotojai ir paieška");
featureSlide({
  t: "Registracija ir paskyros", sub: "Viena paskyra — kelios rolės ir kelios darbo erdvės",
  who: [["Kam", "Kiekvienam: darbuotojui, įmonei, agentūrai, mokymo įstaigai."], ["Nauda", "Vienas asmuo gali būti ir darbuotojas, ir įmonės vadovas — be atskirų paskyrų."]],
  items: [
    ["Registracija el. paštu ir „Google“", "V", "1.1–1.2"], ["Slaptažodžio atkūrimas", "V", "1.3"],
    ["Pirmieji žingsniai ir sąrankos centras", "V", "1.4"], ["Kelios rolės vienoje paskyroje", "V", "1.5"],
    ["Organizacijos kūrimas ir patvirtinimas", "V", "1.6–1.7"], ["Nariai, kvietimai, teisės", "V", "1.9"],
    ["Darbo erdvių perjungimas, duomenų atskyrimas", "V", "1.10–1.11"], ["Viena organizacija — kelios veiklos rūšys", "T", "1.8"],
  ],
  img: "signup.png", cap: CAP,
});

// ───────────────────────── 6. Darbuotojo profilis
featureSlide({
  t: "Darbuotojo profilis ir gyvas CV", sub: "Ne tik deklaracija — profilis auga iš realaus darbo",
  who: [["Kam", "Darbuotojams ir specialistams bet kuriame sektoriuje."], ["Nauda", "Darbdavys mato, kas įrodyta, kas deklaruota, o kas — galimas gebėjimas."]],
  items: [
    ["Profesinis profilis, patirtis, išsilavinimas, kalbos", "V", "2.1, 2.5–2.9"], ["Darbo kortelė: prieinamumas, atlyginimas, vietovės", "V", "2.2"],
    ["CV importas — kiekvienas faktas patvirtinamas", "V", "2.3"], ["Gyvas CV ir eksportas ES formatu", "V", "2.4"],
    ["Įrodymų lygiai ir galimi gebėjimai", "V", "2.14, 2.29"], ["Matomumas tik su sutikimu", "V", "2.35"],
    ["Išorinės profilio nuorodos", "T", "2.10"],
  ],
  img: "profile.png", cap: CAP,
});

// ───────────────────────── 7. Darbo paieška
featureSlide({
  t: "Darbo paieška", sub: "Vieši skelbimai ir platformos poreikiai vienoje vietoje",
  who: [["Kam", "Ieškantiems darbo — ir be paskyros."], ["Nauda", "Oficialūs skelbimai iš Švedijos ir Norvegijos + tiesioginiai įmonių poreikiai."]],
  items: [
    ["Viešas darbo skelbimų puslapis /jobs", "V", "4.4"], ["Švedijos skelbimai (Arbetsförmedlingen)", "V", "10.18"],
    ["Norvegijos skelbimai (NAV)", "V", "10.19"], ["Poreikių lenta ir „rodau susidomėjimą“", "V", "4.3"],
    ["Išsaugotos paieškos ir el. pašto įspėjimai", "V", "4.9"], ["Perėjimas į originalų skelbimą", "V", "4.29"],
    ["Atitikties peržiūra prieš registraciją", "V", "4.26"], ["Senų skelbimų valymas", "T", "10.20"],
  ],
  img: "jobs.png", cap: "Tikras viešas /jobs ekranas su Švedijos skelbimais (testinė aplinka).",
});

// ───────────────────────── 8. Darbdavio galimybės
featureSlide({
  t: "Darbdavio galimybės", sub: "Nuo poreikio aprašymo iki kandidatų ir komandos",
  who: [["Kam", "Įmonėms ir darbdaviams bet kuriame sektoriuje."], ["Nauda", "Poreikis struktūruojamas, kandidatai randami taisyklėmis, viskas vienoje erdvėje."]],
  items: [
    ["Įmonės pradžios erdvė ir nustatymai", "V", "3.1, 3.30"], ["Poreikio paskelbimas (darbuotojai, komanda, paslauga)", "V", "4.1"],
    ["Kandidatų paieška ir trumpasis sąrašas su pastabomis", "V", "4.11–4.12"], ["Susisiekimas su susidomėjusiais", "V", "4.16"],
    ["Įmonės dokumentų registras", "V", "3.29"], ["Nemokamas planas: 1 atviras poreikis", "T", "7.2"],
    ["Viešas įmonės profilis", "T", "8.9"],
  ],
  img: "need.png", cap: CAP,
});

// ───────────────────────── 9. Atranka
{
  const s = slide(); title(s, "Darbuotojų atranka", "Taisyklėmis paremta atitiktis abiem kryptimis — su paaiškinimu, ne „juodąja dėže“");
  const steps = ["Poreikis", "Automatinė atitiktis", "Trumpasis sąrašas", "Kontakto užklausa", "Pokalbis", "Sprendimas"];
  steps.forEach((t, i) => {
    const x = 0.6 + i * 2.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.8, w: 1.85, h: 0.9, rectRadius: 0.1, fill: { color: i === 5 ? "DBEAFE" : "0B0C0E" }, line: { color: i === 5 ? "2563EB" : "0B0C0E" } });
    s.addText(t, { x, y: 1.8, w: 1.85, h: 0.9, fontSize: 14, bold: true, color: i === 5 ? "1E3A8A" : "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true });
    if (i < 5) s.addText("→", { x: x + 1.83, y: 1.95, w: 0.25, h: 0.6, fontSize: 18, bold: true, color: "FFA100", align: "center", margin: 0, isTextBox: true });
  });
  featureList(s, [
    ["Atitikties variklis abiem kryptimis (taisyklės)", "V", "4.5"], ["Automatinis atitikimas su paaiškinimu", "V", "4.13"],
    ["Kandidatų paieška, trumpasis sąrašas, pastabos", "V", "4.11–4.12"], ["Kontaktų atskleidimo užklausos", "V", "4.19"],
    ["Tapatybės apsauga paieškoje, vardas — tik su leidimu", "V", "4.20–4.21"], ["Atrankos eiga → samdymo sprendimas → poreikio uždarymas", "T", "4.30"],
    ["DI (AI) pagrįsta atitiktis — išjungta, kol nepatikrinta", "T", "10.6"],
  ], 0.6, 3.0, 12.1, 0.44, 14);
  legend(s);
}

// ───────────────────────── 10. Agentūros
{
  const s = slide(); title(s, "Įdarbinimo agentūros", "Agentūra deklaruoja pasiūlą — įmonės ją randa ir gauna pasiūlymus");
  const F = [["Pasiūlos deklaravimas", "Kiek ir kokių žmonių agentūra gali pasiūlyti.", "V", "4.28"], ["Pasiūlos paieška", "Įmonės mato organizacijų pasiūlą.", "V", "4.10"], ["Agentūros ir kliento tiltas", "Kliento kvietimas ir kandidatų siūlymas klientui.", "V", "4.15"], ["Komisiniai, agentūra–agentūra", "Atrankos eigos ir komisinių dalis.", "T", "4.30"]];
  F.forEach(([h, b, st, id], i) => card(s, 0.6 + i * 3.1, 1.8, 2.9, 2.6, h, b + "  (" + id + ")", { st, bodySize: 14 }));
  whoWhat(s, 0.6, 4.75, 12.1, [["Kam", "Įdarbinimo ir personalo nuomos agentūroms — kaip įmonės tipui."], ["Nauda", "Mažiau tarpininkų: poreikis, pasiūla ir pasiūlymas — vienoje grandinėje (kelionė J-9 patvirtinta)."]]);
  legend(s);
}

// ───────────────────────── 11. B2B
section("Bendradarbiavimas");
featureSlide({
  t: "B2B bendradarbiavimas", sub: "Įmonės ieško kitų įmonių, komandų ir subrangovų",
  who: [["Kam", "Įmonėms, subrangovams, rangovams, paslaugų įmonėms."], ["Nauda", "Poreikiai ir pasiūlymai tarp įmonių — su derybomis ir sutartimis."]],
  items: [
    ["Ryšiai: įmonės, partneriai, kvietimai", "V", "1.12"], ["Organizacijų pasiūlos paieška", "V", "4.10"],
    ["B2B derybos", "V", "4.7"], ["Pasiūlymai ir sutartys", "V", "6.6"], ["Pirkimai", "V", "6.7"],
    ["Komandų užklausos", "V", "6.19"], ["Viešas įmonės puslapis /business", "T", "6.21"], ["Tarpvalstybiniai sandoriai", "P", "6.12"],
  ],
  img: "network.png", cap: CAP,
});

// ───────────────────────── 12. Komandos
{
  const s = slide(); title(s, "Komandų kūrimas ir pasiūlymai", "Brigada siūloma ir priskiriama kaip vienetas");
  const steps = [["Brigados sudarymas", "Įmonė ar darbuotojai sudaro komandą.", "3.7"], ["Komandos pasiūlymas", "Komanda atsiliepia į poreikį kaip vienetas.", "4.6"], ["Derybos", "Sąlygų derinimas tarp įmonių.", "4.7"], ["Priskyrimas projektui", "Visa komanda priskiriama objektui.", "3.8"]];
  steps.forEach(([h, b, id], i) => card(s, 0.6 + i * 3.1, 1.8, 2.9, 2.8, h, b + "  (" + id + ")", { num: i + 1, st: "V", bodySize: 14 }));
  whoWhat(s, 0.6, 4.95, 12.1, [["Scenarijai", "Montuotojų brigada, valymo komanda, IT specialistų grupė, sezoninių darbuotojų grupė."], ["Įrodymas", "Kelionė J-10 „brigada pasiūloma ir suderinama kaip vienetas“ — produkcijos eisena 19/19."]]);
  legend(s);
}

// ───────────────────────── 13. Paslaugų rinka
featureSlide({
  t: "Paslaugų rinka", sub: "Paslaugos ir prekės tarp žmonių ir įmonių",
  who: [["Kam", "Specialistams, įmonėms ir paslaugų užsakovams."], ["Nauda", "Viena paieška per paslaugas, skelbimus ir poreikius."]],
  items: [
    ["Paslaugų pasiūlymai ir užklausų ciklas", "V", "6.1"], ["Skelbimai: prekės, nuoma, ieškoma", "V", "6.2"],
    ["Viena paieškos rodyklė", "V", "6.3"], ["Užsakovo erdvė", "V", "6.4"], ["Projekto kainos skaičiuoklė", "V", "6.10"],
    ["Įvertinimai, atšaukimas, ginčai", "P", "6.23"], ["Prekių užsakymai ir logistika", "P", "6.13–6.14"], ["Būstas darbuotojams", "P", "6.22"],
  ],
  img: "services.png", cap: CAP,
});

// ───────────────────────── 14. Pokalbiai
featureSlide({
  t: "Pokalbiai ir komunikacija", sub: "Bendravimas vyksta prie konkretaus poreikio, projekto ar užsakymo",
  who: [["Kam", "Visiems dalyviams — tik tarp susijusių šalių."], ["Privatumas", "Vardas ir kontaktai atskleidžiami tik leidus; organizacijų duomenys atskirti."]],
  items: [
    ["Pokalbių gijos ir istorija", "V", "5.2, 5.4"], ["Pranešimai programoje ir el. paštu", "V", "5.6–5.7"],
    ["Savaitės santrauka", "V", "5.9"], ["Datų siūlymas → sutikimas → įsipareigojimas", "V", "5.13"],
    ["Pagalbos pokalbiai", "V", "5.17"], ["Žinučių vertimas", "T", "5.5"], ["Push pranešimai telefone", "T", "5.8"],
    ["SMS / WhatsApp kanalai", "P", "5.21"],
  ],
  img: "chat.png", cap: CAP,
});

// ───────────────────────── 15. Projektai
section("Darbo vykdymas");
featureSlide({
  t: "Projektai", sub: "Objektai, etapai, užduotys ir žmonės — vienoje lentoje",
  who: [["Kam", "Įmonėms, vykdančioms darbus objektuose ar projektuose."], ["Nauda", "Kas, kur, kada ir kiek dirbo — be atskirų lentelių."]],
  items: [
    ["Projektai, objektai, etapai, užduotys", "V", "3.2–3.5"], ["Darbuotojų ir komandų priskyrimas", "V", "3.6, 3.8"],
    ["Pasirengimas, defektai, perdavimo pasas", "V", "3.9–3.11"], ["Operacijų lenta ir eksportas", "V", "3.13"],
    ["Planavimas, pamainos, neatvykimai", "V", "3.14–3.15, 3.20"], ["Pajėgumai, planas ir faktas, ekonomika", "V", "3.12, 3.16–3.19"],
    ["Projekto prognozės", "T", "3.34"], ["Įsipareigojimų persidengimo įspėjimai", "T", "3.35"],
  ],
  img: "project.png", cap: CAP,
});

// ───────────────────────── 16. Darbo žurnalas
featureSlide({
  t: "Darbo žurnalas", sub: "Realus darbas tampa patikrinama patirtimi",
  who: [["Kam", "Darbuotojui (įrašai) ir vadovui ar klientui (patvirtinimas)."], ["Nauda", "Valandos ir atlikti darbai patvirtinami ir patenka į gyvą CV."]],
  items: [
    ["Darbo įrašai, nuotraukos, valandos", "V", "2.19, 2.22–2.23"], ["Vadovo patvirtinimas arba grąžinimas", "V", "2.20"],
    ["8 patikros būsenos, apsauga nuo pakeitimų", "V", "2.21, 2.31"], ["Įgūdžių atpažinimas iš įrašų", "V", "2.13"],
    ["Žurnalo ir valandų eksportas", "V", "2.34"], ["Įmonės valandų puslapis", "V", "3.33"],
    ["Žurnalas balsu", "T", "2.30"], ["Profesijų šablonai", "T", "2.36"],
  ],
  img: "journal.png", cap: CAP,
});

// ───────────────────────── 17. Dokumentai ir patikimumas
{
  const s = slide(); title(s, "Dokumentai ir patikimumas", "Kas įrodyta — atskirta nuo to, kas tik deklaruota");
  const cols = [
    ["Dokumentai", [["Dokumentai ir galiojimo terminai", "V", "2.18"], ["Įmonės dokumentų registras", "V", "3.29"], ["Patirties įrašai ir ginčai", "T", "2.24"]]],
    ["Patikimumas", [["Organizacijų patvirtinimas", "V", "1.7"], ["Įrodymų lygių kopėčios", "V", "2.14"], ["Kitos šalies įvertinimas", "V", "2.32"]]],
    ["Duomenų apsauga", [["Prieigos taisyklės kiekvienai lentelei", "V", "9.8"], ["BDAR eksportas ir ištrynimas", "V", "9.5–9.6"], ["Veiksmų audito žurnalas", "T", "9.9"]]],
  ];
  cols.forEach(([h, items], i) => {
    const x = 0.6 + i * 4.1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.8, w: 3.9, h: 4.3, rectRadius: 0.1, fill: { color: "F2F3F5" }, line: { color: "F2F3F5" } });
    s.addText(h, { x: x + 0.25, y: 1.95, w: 3.4, h: 0.5, fontSize: 18, bold: true, color: C.text1, margin: 0, isTextBox: true });
    items.forEach(([t, st, id], j) => {
      const yy = 2.65 + j * 1.1;
      chip(s, st, x + 0.25, yy, st === "T" ? 2.05 : 1.25);
      s.addText([{ text: t }, { text: "  " + id, options: { color: "9CA3AF", fontSize: 11 } }], { x: x + 0.25, y: yy + 0.35, w: 3.4, h: 0.6, fontSize: 14, color: C.text1, margin: 0, valign: "top", isTextBox: true });
    });
  });
  legend(s);
}

// ───────────────────────── 18. Tarptautinis
section("Rinkos, AI ir mobilumas");
{
  const s = slide(); title(s, "Tarptautinis naudojimas", "ES rinkos, kelios kalbos, šalių reikalavimai");
  featureList(s, [
    ["Sąsaja 6 kalbomis: LT, EN, RU, NL, DE, PL", "V", "8.1"], ["Darbo aprašymų supratimas skirtingomis kalbomis", "V", "8.2"],
    ["Šalių darbo rinkos puslapiai", "V", "8.4"], ["Šalių reikalavimų matrica", "V", "8.6"],
    ["Pasirengimas darbui kitoje šalyje", "V", "6.11"], ["Švedijos ir Norvegijos skelbimai", "V", "10.18–10.19"],
    ["Dar 5 kalbos: SV, DA, NO, ET, LV", "T", "8.5"], ["Automatinis vertimas", "T", "8.3"],
  ], 0.6, 1.8, 7.4, 0.48, 14);
  card(s, 8.4, 1.8, 4.35, 4.3, "Švedijos rinkai šiandien", "Švediški skelbimai jau rodomi ir ieškomi.\n\nSąsaja švedų kalba dar neaktyvuota: trūksta vertimų ir jų peržiūros (savininko sprendimas dėl vertimo šaltinio).\n\nŠvedijos įmonė šiandien gali naudotis platforma anglų kalba.", { fill: "0B0C0E", headColor: "FFA100", bodyColor: "E5E7EB", bodySize: 14 });
  legend(s);
}

// ───────────────────────── 19. ChatGPT ir AI
{
  const s = slide(); title(s, "ChatGPT, Claude ir AI integracijos", "Platforma pasiekiama per MCP: AI asistentas veikia naudotojo teisėmis");
  const L = [["MCP sąsaja: 233 įrankiai", "V", "10.1"], ["Agentų scenarijai per MCP", "V", "10.2"], ["OAuth 2.1 prisijungimas AI klientams", "V", "10.3"], ["Juodraštis → patvirtinimas: AI nieko nedaro be žmogaus", "V", "5.3"], ["Išorinių veiksmų kvitai", "V", "10.17"]];
  const R = [["ChatGPT / Claude katalogų įrašai", "T", "10.5, 10.26"], ["AI pagalba produkte (LLM) — išjungta", "T", "10.6–10.10"], ["MCP leidimų sritys", "P", "10.4"], ["AI agentai kaip dalyviai", "P", "10.16"], ["Agentų vykdymo aplinka", "P", "10.15"]];
  s.addText("Veikia dabar", { x: 0.6, y: 1.75, w: 6, h: 0.4, fontSize: 18, bold: true, color: "1E8E4E", margin: 0, isTextBox: true });
  featureList(s, L, 0.6, 2.25, 6.1, 0.55, 14);
  s.addText("Ruošiama ir planuojama", { x: 6.95, y: 1.75, w: 6, h: 0.4, fontSize: 18, bold: true, color: "2563EB", margin: 0, isTextBox: true });
  featureList(s, R, 6.95, 2.25, 5.8, 0.55, 14);
  s.addText("Pvz.: „Užregistruok šiandien 8 val. darbą objekte“ arba „Parodyk naujus darbo skelbimus Švedijoje“ — asistentas paruošia juodraštį, žmogus patvirtina.", { x: 0.6, y: 5.3, w: 12.1, h: 0.8, fontSize: 15, italic: true, color: "374151", margin: 0, isTextBox: true });
  legend(s);
}

// ───────────────────────── 20. Mobilusis
{
  const s = slide(); title(s, "Mobilusis naudojimas", "Telefone — visa platforma; programėlės jau veikia su produkcija");
  const M = [["Mobilioji svetainė", "Visi pagrindiniai puslapiai pritaikyti telefonui.", "V", "8.11"], ["Diegiama žiniatinklio programėlė (PWA)", "Įsidiegiama į telefono pradžios ekraną.", "V", "8.12"], ["Android programėlė", "Prisijungimas, žurnalas, žinutės, darbai — patikrinta su produkcija.", "V", "8.17"], ["iOS programėlė", "Tie patys pagrindiniai veiksmai — patikrinta su produkcija.", "V", "8.18"]];
  M.forEach(([h, b, st, id], i) => card(s, 0.6 + i * 3.1, 1.8, 2.9, 2.9, h, b + "  (" + id + ")", { st, bodySize: 14 }));
  featureList(s, [["Google Play ir App Store publikavimas (savininko paskyros)", "T", "8.15"], ["Push pranešimai", "T", "5.8"]], 0.6, 5.0, 12.1, 0.5, 14);
  legend(s);
}

// ───────────────────────── 21. Kainodara
{
  const s = slide(); title(s, "Nemokamos ir mokamos galimybės", "Bazė — nemokama; mokamos galimybės tik pagal patvirtintą kainodarą");
  card(s, 0.6, 1.8, 5.9, 3.9, "Nemokamai", "• Darbuotojų registracija, profilis, gyvas CV, darbo žurnalas\n• Įmonės registracija ir organizacija\n• Bazinis poreikio publikavimas: 1 atviras poreikis nemokamame plane (7.2 — tikrinama)\n• Darbo skelbimų paieška ir įspėjimai", { bodySize: 15 });
  card(s, 6.85, 1.8, 5.9, 3.9, "Mokamos papildomos galimybės", "• Planų ir kainų puslapis veikia (7.1)\n• Konkrečios sumos — tik patvirtintos kainodaros puslapyje; šiame pristatyme jos nenurodomos\n• Internetinis apmokėjimas dar neįjungtas (7.5, 7.15)\n• Darbuotojų ir įmonių mokamos pakopos — planuojamos (7.31)", { bodySize: 15 });
  chip(s, "V", 0.85, 5.25, 1.25); chip(s, "T", 7.1, 5.25);
  legend(s);
}

// ───────────────────────── 22. Kas toliau
section("Toliau");
{
  const s = slide(); title(s, "Ką planuojame toliau", "Pirmiausia — aktyvios įmonės, darbuotojai ir realūs užsakymai");
  const R = [
    ["Dabar", "Aktyvios įmonės ir realūs poreikiai; testuotojų grįžtamasis ryšys; švedų ir kitų kalbų aktyvavimas; programėlės parduotuvėse."],
    ["Toliau", "Pažangesnė atitiktis su AI (įjungiama tik po patikros); samdymo sprendimo eiga; internetinis apmokėjimas; žurnalas balsu."],
    ["Vėliau", "Sąskaitos ir darbų priėmimo aktai iš žurnalo; naudotojų automatizacijos; įvertinimai ir ginčai; būstas; gebėjimų pripažinimas (RPL)."],
  ];
  R.forEach(([h, b], i) => card(s, 0.6 + i * 4.1, 1.8, 3.9, 3.8, h, b, { num: i + 1, bodySize: 15 }));
  s.addText("Tai kryptys, ne pažadai su datomis: kiekviena funkcija tampa „veikia“ tik po patikros produkcijoje.", { x: 0.6, y: 5.9, w: 12.1, h: 0.45, fontSize: 14, italic: true, color: "6B7280", margin: 0, isTextBox: true });
}

// ───────────────────────── 23. Švedijos scenarijus
{
  const s = slide(); title(s, "Praktinis scenarijus Švedijoje", "Švedijos įmonei reikia 4 specialistų projektui Gėteborge");
  const st = [
    ["Įmonė sukuria poreikį", "4.1", "V"], ["Darbuotojai, agentūros ir komandos teikia pasiūlymus", "4.3, 4.15, 4.6", "V"],
    ["Įmonė peržiūri: atitiktis ir trumpasis sąrašas", "4.12–4.13", "V"], ["Prasideda pokalbis", "4.16, 5.4", "V"],
    ["Sudaromas bendradarbiavimas: datos, sutikimas, sutartis", "5.13, 6.6", "V"], ["Darbai registruojami ir patvirtinami", "2.19–2.20, 3.6", "V"],
  ];
  st.forEach(([t, id, k], i) => {
    const x = 0.6 + (i % 3) * 4.1, y = 1.8 + Math.floor(i / 3) * 2.05;
    card(s, x, y, 3.9, 1.85, t, id, { num: i + 1, st: k, headSize: 15, bodySize: 11, bodyColor: "9CA3AF" });
  });
  featureList(s, [["Samdymo sprendimas ir poreikio uždarymas vienu veiksmu", "T", "4.30"], ["Sąsaja švedų kalba (dabar — anglų)", "T", "8.5"]], 0.6, 5.95, 12.1, 0.4, 13);
}

// ───────────────────────── 24. Grįžtamasis ryšys
{
  const s = slide("LM_DARK");
  s.addText("Jūsų patirtis ir grįžtamasis ryšys", { x: 0.6, y: 0.5, w: 12, h: 0.8, fontSize: 32, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
  const Q = ["Kas buvo patogu?", "Kas neveikė arba buvo neaišku?", "Kokių funkcijų trūko?", "Ar platforma naudinga Švedijos darbdaviams?", "Ką būtina pakeisti, kad rekomenduotumėte ją kitoms įmonėms?"];
  Q.forEach((q, i) => {
    const y = 1.6 + i * 0.95;
    s.addShape(pres.shapes.OVAL, { x: 0.6, y, w: 0.62, h: 0.62, fill: { color: "FFA100" }, line: { color: "FFA100" } });
    s.addText(String(i + 1), { x: 0.6, y, w: 0.62, h: 0.62, fontSize: 18, bold: true, color: "0B0C0E", align: "center", valign: "middle", margin: 0, isTextBox: true });
    s.addText(q, { x: 1.45, y, w: 11, h: 0.62, fontSize: 22, color: "FFFFFF", valign: "middle", margin: 0, isTextBox: true });
  });
  s.addImage({ path: IMG + "mark_orange.png", x: 12.3, y: 6.75, w: 0.45, h: 0.42, altText: "LabourMarket.ai ženklas" });
}

// ───────────────────────── 25. Tolimesnis bendradarbiavimas
{
  const s = slide(); title(s, "Tolimesnis bendradarbiavimas", "Kviečiame kurti platformą kartu");
  const B = [["Testavimas", "Dalyvauti naujų funkcijų testavime ir pirmiesiems išbandyti švedišką versiją."], ["Patobulinimai", "Siūlyti pakeitimus — jie keliauja tiesiai į funkcijų registrą ir prioritetus."], ["Realūs poreikiai", "Registruoti realius darbo, komandų ir paslaugų poreikius platformoje."], ["Švedijos įmonės", "Pakviesti pažįstamas Švedijos įmones ir agentūras išbandyti platformą."]];
  B.forEach(([h, b], i) => card(s, 0.6 + (i % 2) * 6.15, 1.8 + Math.floor(i / 2) * 2.1, 5.95, 1.9, h, b, { num: i + 1, bodySize: 15 }));
  s.addText("labourmarket.ai", { x: 0.6, y: 6.15, w: 6, h: 0.5, fontSize: 22, bold: true, color: "B45309", margin: 0, isTextBox: true });
}

// ───────────────────────── Priedas A — būsenos pagal sritį
section("Priedas");
{
  const s = slide(); title(s, "Priedas A. Funkcijų būsenos pagal sritį", "287 funkcijos iš funkcijų registro (2026-11-09 duomenys)");
  const labels = AREAS.map((a) => a[0].length > 34 ? a[0].slice(0, 33) + "…" : a[0]);
  s.addChart(pres.charts.BAR, [
    { name: "Veikia", labels, values: AREAS.map((a) => a[1]) },
    { name: "Sukurta / tikrinama", labels, values: AREAS.map((a) => a[2]) },
    { name: "Planuojama", labels, values: AREAS.map((a) => a[3]) },
  ], {
    x: 0.6, y: 1.65, w: 8.6, h: 5.15, barDir: "bar", barGrouping: "stacked", chartColors: ["1E8E4E", "2563EB", "9CA3AF"],
    catAxisOrientation: "maxMin", catAxisLabelFontSize: 10, valAxisLabelFontSize: 9, catAxisLabelColor: "374151", valAxisLabelColor: "6B7280",
    catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", legendFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt",
    valGridLine: { color: "E5E7EB", size: 0.5 }, catGridLine: { style: "none" },
    showLegend: true, legendPos: "b", legendFontSize: 10, showValue: true, dataLabelPosition: "ctr", dataLabelFontSize: 9, dataLabelColor: "FFFFFF",
  });
  const T = AREAS.reduce((a, r) => [a[0] + r[1], a[1] + r[2], a[2] + r[3]], [0, 0, 0]);
  [["Veikia", T[0], "1E8E4E"], ["Sukurta / tikrinama", T[1], "2563EB"], ["Planuojama", T[2], "6B7280"]].forEach(([l, v, c], i) => {
    s.addText(String(v), { x: 9.6, y: 1.8 + i * 1.6, w: 3.1, h: 0.9, fontSize: 54, bold: true, color: c, margin: 0, isTextBox: true });
    s.addText(l, { x: 9.6, y: 2.7 + i * 1.6, w: 3.1, h: 0.4, fontSize: 14, color: "374151", margin: 0, isTextBox: true });
  });
}
// ───────────────────────── Priedas B — metodika
{
  const s = slide(); title(s, "Priedas B. Kaip nustatytos būsenos", "Kiekviena būsena turi šaltinį — nieko neišgalvojome");
  const R = [
    ["VEIKIA", "Funkcijų registre LIVE_VERIFIED: patvirtinta produkcijoje (produkcijos naršyklės eisena su sintetinėmis paskyromis, savininko ar realaus naudotojo veiksmas, realus naudojimas)."],
    ["SUKURTA / TIKRINAMA", "Kodas yra, bet: produkcijoje dar nepatikrinta, praeina tik automatinius testus, laukia savininko sprendimo / paskyros / konfigūracijos arba rasta klaida."],
    ["PLANUOJAMA", "Numatyta plane, dar nesukurta."],
    ["Šaltiniai", "docs/program/FUNCTION_REGISTER.md; apps/web/lib/config/feature-availability.ts ir roles.ts; produkt-truth suvestinė. Pilnas sąrašas — LabourMarket_AI_Funkciju_Katalogas_LT.md."],
    ["Ribos", "Produkcija nebuvo pertikrinta gyvai rengiant pristatymą. Ekrano vaizdai — iš testinių eisenų su sintetiniais duomenimis. PR po 2026-11-09 nevertinti kaip veikiantys."],
  ];
  R.forEach(([k, v], i) => {
    const y = 1.75 + i * 0.98;
    s.addText(k, { x: 0.6, y, w: 2.8, h: 0.85, fontSize: 15, bold: true, color: i < 3 ? Object.values(ST)[i].fill : "B45309", margin: 0, valign: "top", isTextBox: true });
    s.addText(v, { x: 3.5, y, w: 9.25, h: 0.9, fontSize: 14, color: "374151", margin: 0, valign: "top", isTextBox: true });
  });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  const { applyTheme } = require("/root/.claude/skills/synced/8fc6d180-4888-4094-9ff9-7d0dd26207e9_076cb314-e39e-44fd-b2d1-1cd58ad5c6ee/pptx/scripts/apply_theme.js");
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
