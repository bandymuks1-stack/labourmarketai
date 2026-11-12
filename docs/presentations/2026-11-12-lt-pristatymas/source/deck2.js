// LabourMarket.ai — naujas komercinis pristatymas (LT), 12 skaidrių.
// All copy lives in the T object so EN / RU versions only swap T.
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const sizeOf = (p) => { const b = fs.readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

const S = "/tmp/claude-0/-home-user-labourmarketai/9d90af5e-3497-57b2-9ef1-78fd93b719d2/scratchpad";
const P = S + "/prod/";
const IMG = S + "/img/";
const OUT = process.argv[2] || S + "/LabourMarket_AI_Pristatymas_LT_NEW.pptx";

const THEME = {
  name: "LabourMarket.ai 2026",
  headFontFace: "Arial",
  bodyFontFace: "Arial",
  colors: { dk1: "111113", lt1: "FFFFFF", dk2: "000000", lt2: "F4F4F5", accent1: "FFA100", accent2: "8A6A12", accent3: "3F3F46", accent4: "A1A1AA", accent5: "E4E4E7", accent6: "52525B", hlink: "B87300", folHlink: "71717A" },
};
const K = { ink: "111113", muted: "52525B", soft: "A1A1AA", panel: "F4F4F5", line: "E4E4E7", gold: "FFA100", goldDark: "B87300", black: "000000", white: "FFFFFF" };

const T = {
  footer: "labourmarket.ai",
  s1: { title: "Viena platforma visų profesijų darbuotojams ir įmonėms", sub: "Darbas, žmonės, komandos ir paslaugos — nuo poreikio iki patvirtinto rezultato." },
  s2: { eye: "PROBLEMA", title: "Darbo rinka išskaidyta", items: [["Daug kanalų", "Skelbimai, agentūros, subrangovai ir paslaugos — atskirose sistemose ir kalbose."], ["Ilgos grandinės", "Tarp užsakovo ir žmogaus — keli tarpininkai. Lėčiau ir brangiau."], ["Patirtis neįrodoma", "CV — tik deklaracija. Realiai atliktas darbas niekur nesikaupia."]] },
  s3: { eye: "KAIP VEIKIA", title: "Nuo poreikio iki patvirtintos patirties", steps: [["Poreikis", "Įmonė aprašo, ko reikia"], ["Žmonės", "Darbuotojai, komandos, agentūros"], ["Pokalbis", "Tiesioginis kontaktas"], ["Darbas", "Projektas ir priskyrimas"], ["Patvirtinimas", "Vadovas patvirtina"], ["Patirtis", "Gyvas CV auga"]], note: "Kiekvienas atliktas darbas sustiprina kitą atranką — abiem pusėms." },
  s4: { eye: "DARBUOTOJUI", title: "Vienas nemokamas profilis visam karjeros keliui", pts: ["Profilis ir gyvas CV, kuris pildosi iš realaus darbo", "Darbo skelbimai ir įmonių poreikiai vienoje vietoje", "Įmonė susisiekia — kontaktai atskleidžiami tik leidus"], cap: "labourmarket.ai/lt/for-workers · 2026-11-12" },
  s5: { eye: "DARBDAVIUI", title: "Aprašykite poreikį — gaukite tinkamus žmones", pts: ["Užklausa nemokama, net be paskyros", "Kandidatų sąrašas su paaiškinimu, kodėl kiekvienas tinka", "Projektai, priskyrimai, valandos ir ataskaitos — toje pačioje vietoje"], cap: "labourmarket.ai/lt/for-companies · 2026-11-12" },
  s6: { eye: "ĮMONĖS KARTU", title: "Įmonės, agentūros ir komandos dirba kartu", cards: [["Komandos ir brigados", "Siūlomos ir priskiriamos projektui kaip vienas vienetas."], ["Agentūros", "Skelbia pasiūlą, kviečia klientus ir siūlo kandidatus."], ["Paslaugos tarp įmonių", "Užklausos, derybos, pasiūlymai ir sutartys platformoje."]], note: "Visi trys keliai veikia atskirai; vientisą srautą nuo užklausos iki sutarties dar baigiame kurti." },
  s7: { eye: "PAIEŠKA IR ATRANKA", title: "Tinkami žmonės — su paaiškinimu", stat: "57 086", statLbl: "aktyvūs darbo skelbimai platformoje", statSrc: "Oficialūs vieši užimtumo šaltiniai (Švedija, Norvegija) · 2026-11-11", pts: ["Atitiktis abiem kryptimis: darbuotojas ↔ poreikis", "Trumpasis sąrašas, pastabos, kontakto užklausa", "Atitikimo peržiūra — net be paskyros"], cap: "labourmarket.ai/lt/match-preview · 2026-11-12" },
  s8: { eye: "PATVIRTINTA PATIRTIS", title: "Realus darbas tampa įrodymu", flow: [["Užrašyta", "Darbuotojas fiksuoja darbą, valandas, nuotraukas"], ["Patvirtinta", "Vadovas ar klientas patvirtina arba grąžina"], ["Gyvas CV", "Patvirtinta patirtis keliauja su žmogumi"]], quote: "Patirtis, kurią galima parodyti — ne tik aprašyti.", sub: "Kiekvienas įrašas žino, kas jį užrašė ir kas patvirtino. Patvirtinta patirtis lieka žmogui, keičiant darbą, projektą ar šalį." },
  s9: { eye: "TARPTAUTIŠKAI", title: "Europos darbo rinkai", langs: ["LT", "EN", "RU", "DE", "NL", "PL"], langNote: "Platformos kalbos šiandien", next: "Ruošiama: SV · NO · DA · FI · ET · LV", pts: ["Šalių darbo rinkos puslapiai ir reikalavimai", "Darbo skelbimai iš Švedijos ir Norvegijos", "Telefone — visa platforma naršyklėje"], cap: "labourmarket.ai/lt/labour-market · 2026-11-12" },
  s10: { eye: "SCENARIJUS", title: "Nuo poreikio iki bendradarbiavimo", ctx: "Logistikos įmonei reikia 5 sandėlio darbuotojų nuo kito mėnesio", steps: ["Įmonė aprašo poreikį", "Platforma parenka tinkamus žmones", "Įmonė peržiūri ir susisiekia", "Suderinamos datos — žmonės sutinka", "Darbuotojai priskiriami projektui", "Darbas fiksuojamas ir patvirtinamas"], note: "Visi šeši žingsniai išbandyti produkcijoje 2026-11-11–12." },
  s11: { eye: "KAINOS", title: "Pradėti — nemokamai", free: { name: "Nemokamai", price: "0 €", pts: ["Registracija visiems", "1 aktyvi pozicija", "Kandidatų sąrašas, kontaktas", "Projektai, darbo patvirtinimas"] }, org: { name: "Organizacija", price: "99 € / mėn.", pts: ["Be aktyvių pozicijų limito", "Projektų valdymas, ataskaitos", "Vienas planas visoms įmonėms"] }, svc: { name: "Atrankos paslauga", price: "Pagal susitarimą", pts: ["Žmogus patikrina sąrašą", "Mokate tik už rezultatą", "Kaina suderinama iš anksto"] }, note: "Kainos patvirtintos ir skelbiamos labourmarket.ai/lt/pricing. Mokėjimai internetu dar neįjungti — pilotą aktyvuojame tiesiogiai." },
  s12: { title: "Pradėkite šiandien", doors: [["Darbuotojams", "Nemokamas profilis", "labourmarket.ai/lt/for-workers"], ["Įmonėms", "Nemokama darbuotojų užklausa", "labourmarket.ai/lt/company-need"], ["Agentūroms", "Agentūros paskyra", "labourmarket.ai/lt/for-agencies"]] },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "LabourMarket.ai — pristatymas";
pres.author = "LabourMarket.ai";
pres.company = "LabourMarket.ai";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };

pres.defineSlideMaster({
  title: "LM_LIGHT", background: { color: K.white },
  objects: [
    { image: { x: 0.6, y: 6.98, w: 0.27, h: 0.255, path: IMG + "mark_orange.png" } },
    { text: { text: T.footer, options: { x: 0.95, y: 6.95, w: 4, h: 0.32, fontSize: 11, color: K.soft, margin: 0, valign: "middle" } } },
  ],
  slideNumber: { x: 12.2, y: 6.95, w: 0.55, h: 0.32, fontSize: 11, color: K.soft, align: "right" },
});
pres.defineSlideMaster({ title: "LM_DARK", background: { color: K.black }, objects: [] });

let sec = null;
const section = (t) => { pres.addSection({ title: t }); sec = t; };
const slide = (m = "LM_LIGHT") => pres.addSlide({ masterName: m, sectionTitle: sec });
const tb = (s, text, o) => s.addText(text, Object.assign({ margin: 0, isTextBox: true, color: K.ink, fontFace: "Arial" }, o));
function head(s, eye, title, w = 12.1) {
  tb(s, eye, { x: 0.6, y: 0.55, w, h: 0.35, fontSize: 13, bold: true, color: K.goldDark, charSpacing: 3 });
  tb(s, title, { x: 0.6, y: 0.95, w, h: 1.05, fontSize: 38, bold: true, valign: "top" });
}
function shot(s, file, x, y, w, h, cap) {
  const d = sizeOf(file); const r = Math.min(w / d.w, h / d.h); const iw = d.w * r, ih = d.h * r;
  const ix = x + (w - iw) / 2, iy = y;
  s.addShape(pres.shapes.RECTANGLE, { x: ix, y: iy, w: iw, h: ih, fill: { color: K.white }, line: { color: K.line, width: 0.75 }, shadow: { type: "outer", color: "000000", opacity: 0.18, blur: 18, offset: 4, angle: 90 } });
  s.addImage({ path: file, x: ix, y: iy, w: iw, h: ih, altText: cap ? "Platformos ekranas: " + cap : "Platformos ekranas" });
  if (cap) tb(s, cap, { x: ix, y: iy + ih + 0.12, w: iw, h: 0.3, fontSize: 11, color: K.soft });
  return { ix, iy, iw, ih };
}
function points(s, arr, x, y, w, fs = 20, gap = 0.95) {
  arr.forEach((t, i) => {
    s.addShape(pres.shapes.OVAL, { x, y: y + i * gap + 0.1, w: 0.16, h: 0.16, fill: { color: K.gold }, line: { color: K.gold } });
    tb(s, t, { x: x + 0.38, y: y + i * gap, w: w - 0.38, h: gap - 0.1, fontSize: fs, valign: "top", color: K.ink });
  });
}

// 1 — Cover
section("Pristatymas");
{
  const s = slide("LM_DARK");
  const lg = sizeOf(IMG + "logo_block.png");
  s.addImage({ path: IMG + "logo_block.png", x: 0.75, y: 0.9, w: 6.2, h: 6.2 * lg.h / lg.w, altText: "LabourMarket.ai logotipas" });
  tb(s, T.s1.title, { x: 0.9, y: 3.0, w: 11.4, h: 1.9, fontSize: 46, bold: true, color: K.white, valign: "top" });
  tb(s, T.s1.sub, { x: 0.9, y: 5.0, w: 10.5, h: 0.9, fontSize: 22, color: "D4D4D8", valign: "top" });
  tb(s, "labourmarket.ai", { x: 0.9, y: 6.55, w: 6, h: 0.4, fontSize: 16, bold: true, color: K.gold });
}

// 2 — Problem
{
  const s = slide(); head(s, T.s2.eye, T.s2.title);
  T.s2.items.forEach(([h, b], i) => {
    const x = 0.6 + i * 4.1;
    tb(s, "0" + (i + 1), { x, y: 2.55, w: 3.8, h: 0.9, fontSize: 48, bold: true, color: K.gold });
    tb(s, h, { x, y: 3.55, w: 3.75, h: 0.6, fontSize: 26, bold: true });
    tb(s, b, { x, y: 4.25, w: 3.6, h: 1.6, fontSize: 18, color: K.muted, valign: "top" });
  });
}

// 3 — How it works
{
  const s = slide(); head(s, T.s3.eye, T.s3.title);
  const n = T.s3.steps.length, x0 = 1.2, span = 10.1, step = span / (n - 1), y = 2.8;
  s.addShape(pres.shapes.LINE, { x: x0 + 0.45, y: y + 0.45, w: span, h: 0, line: { color: K.line, width: 3 } });
  T.s3.steps.forEach(([h, b], i) => {
    const cx = x0 + i * step;
    s.addShape(pres.shapes.OVAL, { x: cx, y, w: 0.9, h: 0.9, fill: { color: i === n - 1 ? K.gold : K.ink }, line: { color: K.white, width: 3 } });
    tb(s, String(i + 1), { x: cx, y, w: 0.9, h: 0.9, fontSize: 22, bold: true, color: i === n - 1 ? K.ink : K.white, align: "center", valign: "middle" });
    tb(s, h, { x: cx - 0.55, y: y + 1.15, w: 2.0, h: 0.45, fontSize: 19, bold: true, align: "center" });
    tb(s, b, { x: cx - 0.55, y: y + 1.6, w: 2.0, h: 0.8, fontSize: 15, color: K.muted, align: "center", valign: "top" });
  });
  tb(s, T.s3.note, { x: 0.6, y: 5.55, w: 12.1, h: 0.5, fontSize: 18, italic: true, color: K.goldDark, align: "center" });
}

// 4 / 5 — Worker / Employer (text left, real screen right)
// Title on these slides is long: give it 2 lines in a narrower column
function benefitSlide2(d, file) {
  const s = slide();
  tb(s, d.eye, { x: 0.6, y: 0.75, w: 5.2, h: 0.35, fontSize: 13, bold: true, color: K.goldDark, charSpacing: 3 });
  tb(s, d.title, { x: 0.6, y: 1.15, w: 5.2, h: 1.7, fontSize: 34, bold: true, valign: "top" });
  points(s, d.pts, 0.6, 3.2, 5.1, 19, 1.05);
  shot(s, file, 6.2, 1.15, 6.55, 5.3, d.cap);
}
section("Vertė");
benefitSlide2(T.s4, P + "c_workers.png");
benefitSlide2(T.s5, P + "c_companies.png");

// 6 — B2B
{
  const s = slide(); head(s, T.s6.eye, T.s6.title);
  T.s6.cards.forEach(([h, b], i) => {
    const x = 0.6 + i * 4.1;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 2.45, w: 3.85, h: 3.1, fill: { color: K.panel }, line: { color: K.panel } });
    s.addShape(pres.shapes.OVAL, { x: x + 0.35, y: 2.8, w: 0.7, h: 0.7, fill: { color: K.gold }, line: { color: K.gold } });
    tb(s, String(i + 1), { x: x + 0.35, y: 2.8, w: 0.7, h: 0.7, fontSize: 20, bold: true, align: "center", valign: "middle" });
    tb(s, h, { x: x + 0.35, y: 3.7, w: 3.25, h: 0.85, fontSize: 21, bold: true, valign: "top" });
    tb(s, b, { x: x + 0.35, y: 4.6, w: 3.25, h: 0.9, fontSize: 16, color: K.muted, valign: "top" });
  });
  tb(s, T.s6.note, { x: 0.6, y: 5.9, w: 12.1, h: 0.5, fontSize: 15, italic: true, color: K.muted });
}

// 7 — Search & matching
{
  const s = slide();
  tb(s, T.s7.eye, { x: 0.6, y: 0.75, w: 5.4, h: 0.35, fontSize: 13, bold: true, color: K.goldDark, charSpacing: 3 });
  tb(s, T.s7.title, { x: 0.6, y: 1.15, w: 5.4, h: 1.2, fontSize: 34, bold: true, valign: "top" });
  tb(s, T.s7.stat, { x: 0.6, y: 2.45, w: 5.4, h: 1.0, fontSize: 60, bold: true, color: K.goldDark });
  tb(s, T.s7.statLbl, { x: 0.6, y: 3.45, w: 5.4, h: 0.4, fontSize: 18, bold: true });
  tb(s, T.s7.statSrc, { x: 0.6, y: 3.85, w: 5.4, h: 0.35, fontSize: 11, color: K.soft });
  points(s, T.s7.pts, 0.6, 4.5, 5.3, 17, 0.72);
  shot(s, P + "c_match.png", 6.3, 0.75, 6.45, 5.75, T.s7.cap);
}

// 8 — Verified experience
{
  const s = slide(); head(s, T.s8.eye, T.s8.title);
  T.s8.flow.forEach(([h, b], i) => {
    const x = 0.6 + i * 4.1, y = 2.3;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 3.6, h: 1.55, fill: { color: i === 2 ? K.ink : K.panel }, line: { color: i === 2 ? K.ink : K.panel } });
    tb(s, h, { x: x + 0.3, y: y + 0.2, w: 3.0, h: 0.5, fontSize: 22, bold: true, color: i === 2 ? K.gold : K.ink });
    tb(s, b, { x: x + 0.3, y: y + 0.72, w: 3.05, h: 0.75, fontSize: 15, color: i === 2 ? "D4D4D8" : K.muted, valign: "top" });
    if (i < 2) tb(s, "→", { x: x + 3.62, y: y + 0.45, w: 0.45, h: 0.6, fontSize: 28, bold: true, color: K.gold, align: "center" });
  });
  tb(s, T.s8.quote, { x: 0.6, y: 4.35, w: 12.1, h: 1.2, fontSize: 30, bold: true, color: K.ink, valign: "top" });
  tb(s, T.s8.sub, { x: 0.6, y: 5.55, w: 12.1, h: 0.8, fontSize: 18, color: K.muted, valign: "top" });
}

// 9 — International
section("Rinkos ir pradžia");
{
  const s = slide();
  tb(s, T.s9.eye, { x: 0.6, y: 0.75, w: 5.6, h: 0.35, fontSize: 13, bold: true, color: K.goldDark, charSpacing: 3 });
  tb(s, T.s9.title, { x: 0.6, y: 1.15, w: 5.6, h: 0.8, fontSize: 34, bold: true });
  T.s9.langs.forEach((l, i) => {
    const x = 0.6 + i * 0.9;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 2.2, w: 0.78, h: 0.62, fill: { color: K.ink }, line: { color: K.ink } });
    tb(s, l, { x, y: 2.2, w: 0.78, h: 0.62, fontSize: 18, bold: true, color: K.white, align: "center", valign: "middle" });
  });
  tb(s, T.s9.langNote, { x: 0.6, y: 2.92, w: 5.4, h: 0.3, fontSize: 13, color: K.muted });
  tb(s, T.s9.next, { x: 0.6, y: 3.25, w: 5.4, h: 0.32, fontSize: 13, color: K.soft });
  points(s, T.s9.pts, 0.6, 3.95, 5.4, 18, 0.8);
  shot(s, P + "c_market.png", 6.25, 0.75, 4.15, 5.75, T.s9.cap);
  const ph = shot(s, P + "m_hero.png", 10.65, 0.75, 2.1, 5.2, null);
  tb(s, "Telefone", { x: ph.ix, y: ph.iy + ph.ih + 0.12, w: ph.iw, h: 0.3, fontSize: 11, color: K.soft, align: "center" });
}

// 10 — Scenario
{
  const s = slide(); head(s, T.s10.eye, T.s10.title);
  s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 2.05, w: 12.1, h: 0.75, fill: { color: K.panel }, line: { color: K.panel } });
  tb(s, T.s10.ctx, { x: 0.9, y: 2.05, w: 11.6, h: 0.75, fontSize: 20, bold: true, valign: "middle" });
  T.s10.steps.forEach((t, i) => {
    const col = i % 3, row = Math.floor(i / 3), x = 0.6 + col * 4.1, y = 3.15 + row * 1.35;
    tb(s, String(i + 1), { x, y, w: 0.6, h: 0.9, fontSize: 40, bold: true, color: K.gold, valign: "top" });
    tb(s, t, { x: x + 0.7, y: y + 0.12, w: 3.25, h: 1.0, fontSize: 19, valign: "top" });
  });
  tb(s, T.s10.note, { x: 0.6, y: 6.05, w: 12.1, h: 0.45, fontSize: 14, italic: true, color: K.muted });
}

// 11 — Pricing
{
  const s = slide(); head(s, T.s11.eye, T.s11.title);
  [T.s11.free, T.s11.org, T.s11.svc].forEach((p, i) => {
    const x = 0.6 + i * 4.1, y = 2.1, dark = i === 0;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 3.85, h: 3.75, fill: { color: dark ? K.ink : K.panel }, line: { color: dark ? K.ink : K.panel } });
    tb(s, p.name, { x: x + 0.35, y: y + 0.3, w: 3.2, h: 0.4, fontSize: 17, bold: true, color: dark ? K.gold : K.goldDark });
    tb(s, p.price, { x: x + 0.35, y: y + 0.75, w: 3.3, h: 0.8, fontSize: i === 2 ? 26 : 38, bold: true, color: dark ? K.white : K.ink, valign: "middle" });
    p.pts.forEach((t, j) => tb(s, "—  " + t, { x: x + 0.35, y: y + 1.75 + j * 0.47, w: 3.35, h: 0.45, fontSize: 15, color: dark ? "E4E4E7" : K.muted }));
  });
  tb(s, T.s11.note, { x: 0.6, y: 6.05, w: 12.1, h: 0.5, fontSize: 14, italic: true, color: K.muted });
}

// 12 — CTA
{
  const s = slide("LM_DARK");
  tb(s, T.s12.title, { x: 0.75, y: 0.9, w: 11.8, h: 1.0, fontSize: 48, bold: true, color: K.white });
  T.s12.doors.forEach(([h, b, u], i) => {
    const x = 0.75 + i * 4.0;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 2.45, w: 3.7, h: 2.55, fill: { color: "18181B" }, line: { color: "3F3F46", width: 1 } });
    tb(s, h, { x: x + 0.35, y: 2.75, w: 3.1, h: 0.55, fontSize: 26, bold: true, color: K.gold });
    tb(s, b, { x: x + 0.35, y: 3.4, w: 3.1, h: 0.8, fontSize: 19, color: K.white, valign: "top" });
    tb(s, u, { x: x + 0.35, y: 4.4, w: 3.2, h: 0.4, fontSize: 12, color: K.soft });
  });
  const lg = sizeOf(IMG + "logo_block.png");
  s.addImage({ path: IMG + "logo_block.png", x: 0.6, y: 5.55, w: 4.2, h: 4.2 * lg.h / lg.w, altText: "LabourMarket.ai logotipas" });
  tb(s, "labourmarket.ai", { x: 8.75, y: 6.3, w: 3.8, h: 0.5, fontSize: 22, bold: true, color: K.gold, align: "right" });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  const { applyTheme } = require("/root/.claude/skills/synced/8fc6d180-4888-4094-9ff9-7d0dd26207e9_076cb314-e39e-44fd-b2d1-1cd58ad5c6ee/pptx/scripts/apply_theme.js");
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
