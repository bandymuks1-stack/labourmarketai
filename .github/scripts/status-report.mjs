#!/usr/bin/env node
/**
 * 12-hour full status report (owner order 2026-11-14, P0; schedule 09:38 and 21:38 Europe/Vilnius, owner change 2026-11-14).
 *
 * ONE canonical output: docs/program/STATUS_REPORT.md (overwritten each run; its git history is the
 * report history). Source of truth for every function stays docs/program/FUNCTION_REGISTER.md —
 * this script never invents a status, it only reads the register rows, the Lithuanian function map,
 * the journeys table and the fetched GitHub/production facts, and adds the coordinator's narrative.
 *
 *   node .github/scripts/status-report-fetch.mjs > /tmp/sr.json
 *   node .github/scripts/status-report.mjs --data /tmp/sr.json --narrative <coordinator.md> [--out <file>]
 *
 * The narrative file holds the judgement parts, each after a marker line `<!-- section:NAME -->`:
 * summary (B), groups, cv, product, forecast. A missing section is printed as "not written" —
 * never silently skipped. No database, no network (the fetch script does the reads).
 *
 * Rules carried from the register: a function is "veikia produkcijoje" only when its register row
 * is LIVE_VERIFIED; existing code or a green CI is never counted as working.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTER = join(ROOT, "docs", "program", "FUNCTION_REGISTER.md");
const OUT_DEFAULT = join(ROOT, "docs", "program", "STATUS_REPORT.md");
const REPO_URL = "https://github.com/bandymuks1-stack/labourmarketai";

const args = process.argv.slice(2);
const arg = (n, f) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : f;
};
const DATA = arg("--data");
const NARRATIVE = arg("--narrative");
const OUT = arg("--out", OUT_DEFAULT);
if (!DATA) {
  console.error("usage: status-report.mjs --data <fetch.json> [--narrative <file.md>] [--out <file>]");
  process.exit(2);
}

// ---------------------------------------------------------------- register parsing
const reg = readFileSync(REGISTER, "utf8").split("\n");
const cells = (line) =>
  line
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());

function sectionLines(startRe, endRe) {
  const s = reg.findIndex((l) => startRe.test(l));
  if (s < 0) return [];
  let e = reg.findIndex((l, i) => i > s && endRe.test(l));
  if (e < 0) e = reg.length;
  return reg.slice(s + 1, e);
}

const ROW_ID = /^\| \d+\.\d+ \|/;
// Function rows live in the area sections before "## Function map data".
const mapStart = reg.findIndex((l) => /^## Function map data/.test(l));
const fnStart = reg.findIndex((l) => /^## Identity, sign-up/.test(l));
const rows = [];
const seen = new Set();
let area = "";
for (let i = fnStart; i < mapStart; i++) {
  const l = reg[i];
  if (/^## /.test(l)) area = l.replace(/^## /, "");
  if (!ROW_ID.test(l)) continue;
  // Only the 7-column function tables (ID, Function, Status, Last checked, Evidence, In production, Issue).
  const c = cells(l);
  if (c.length !== 7) continue;
  if (!/^(LIVE_VERIFIED|PASS_CI_ONLY|FAIL|BLOCKED|NOT_VERIFIED|NOT_IMPLEMENTED|OPTIONAL_TEST|DUPLICATE)$/.test(c[2])) continue;
  if (seen.has(c[0])) continue;
  seen.add(c[0]);
  rows.push({ id: c[0], name: c[1], status: c[2], checked: c[3], evidence: c[4], inProd: c[5], issue: c[6], area });
}

const mapRows = new Map();
for (const l of sectionLines(/^### Map: functions/, /^### /)) {
  if (!ROW_ID.test(l)) continue;
  const c = cells(l);
  mapRows.set(c[0], { lt: c[1], what: c[2], who: c[3], where: c[4], executor: c[8] });
}

const groupsLt = new Map();
for (const l of sectionLines(/^### Map: groups/, /^### /)) {
  const c = cells(l);
  if (/^\d+$/.test(c[0])) groupsLt.set(c[0], c[1]);
}

const journeys = new Map();
for (const l of sectionLines(/^### Map: journeys/, /^### |^## /)) {
  const c = cells(l);
  if (!/^J-\d+/.test(c[0])) continue;
  const j = journeys.get(c[0]) ?? { id: c[0], lt: c[1], fns: [] };
  for (const f of c[3].split(/[ ,]+/).filter(Boolean)) j.fns.push(f);
  journeys.set(c[0], j);
}

// Executor / next action from the register's own triage tables.
const nextFromRegister = new Map();
for (const l of sectionLines(/^### NOT VERIFIED function rows/, /^### |^## /)) {
  if (!ROW_ID.test(l)) continue;
  const c = cells(l);
  nextFromRegister.set(c[0], c[3]);
}
for (const l of sectionLines(/^### Every row/, /^### |^## /)) {
  if (!ROW_ID.test(l)) continue;
  const c = cells(l);
  if (!nextFromRegister.has(c[0])) nextFromRegister.set(c[0], c[6]);
}

// Extra checks measured outside the function rows (SEO, GEO, search, UX/UI).
function checkTable(headingRe) {
  const out = {};
  for (const l of sectionLines(headingRe, /^### |^## /)) {
    const c = cells(l);
    if (!/^[A-Z]+-\d+/.test(c[0] ?? "")) continue;
    out[c[2]] = (out[c[2]] ?? 0) + 1;
  }
  return out;
}
const extraChecks = [
  ["SEO", checkTable(/^### SEO \(signed out/), "2026-11-04"],
  ["GEO (AI paieškos varikliai)", checkTable(/^### GEO \(/), "2026-11-04"],
  ["Vidinė paieška", checkTable(/^### Internal search/), "2026-11-04"],
  ["UX/UI (neprisijungus)", checkTable(/^### UX\/UI \(signed out/), "2026-11-04"],
];

// ---------------------------------------------------------------- derived fields
const LT_STATE = {
  LIVE_VERIFIED: "VEIKIA PRODUKCIJOJE",
  PASS_CI_ONLY: "TIK CI PATIKRINTA",
  FAIL: "NEVEIKIA",
  BLOCKED: "BLOKUOTA",
  NOT_IMPLEMENTED: "NEĮGYVENDINTA",
  OPTIONAL_TEST: "PAPILDOMAS TESTAS",
  DUPLICATE: "DUBLIKATAS",
};
const STATE_ORDER = [
  "VEIKIA PRODUKCIJOJE",
  "TIK KODE",
  "TIK CI PATIKRINTA",
  "NEPATIKRINTA",
  "NEVEIKIA",
  "NEĮGYVENDINTA",
  "BLOKUOTA",
];
function state(r) {
  if (r.status === "NOT_VERIFIED") return /^yes/i.test(r.inProd) ? "NEPATIKRINTA" : "TIK KODE";
  return LT_STATE[r.status];
}
const counted = rows.filter((r) => r.status !== "DUPLICATE" && r.status !== "OPTIONAL_TEST");
const yn = (v) => (v === true ? "taip" : v === false ? "ne" : v);

/** Coordinator lane per register group (who drives the next step). */
const LANE = {
  1: "N / B (registracija, laiškai)",
  2: "G / H (#3354 CV)",
  3: "H (organizacijos)",
  4: "A / C (paieška, atranka)",
  5: "E (pranešimai)",
  6: "C (prekyvietė)",
  7: "D (mokėjimai)",
  8: "E / F (kalbos, mobilus)",
  9: "R2 (saugumas)",
  10: "F (AI, MCP)",
  11: "L (mokymasis)",
  12: "koordinatorius",
  13: "M / koordinatorius",
};
const groupOf = (id) => id.split(".")[0];

const data = JSON.parse(readFileSync(DATA, "utf8"));
const openNums = new Set(data.prs.map((p) => p.number));

function fnFields(r) {
  const m = mapRows.get(r.id) ?? {};
  const s = state(r);
  const live = r.status === "LIVE_VERIFIED";
  const built = r.status === "NOT_IMPLEMENTED" ? false : r.status === "BLOCKED" ? "nenustatyta" : true;
  const prsInEvidence = [...new Set((r.evidence.match(/#\d{3,5}/g) ?? []).map((x) => Number(x.slice(1))))];
  const openPrs = prsInEvidence.filter((n) => openNums.has(n));
  const runs = (r.evidence.match(/\b4\d{10}\b/g) ?? []).slice(0, 3);
  const build = (r.evidence.match(/\b[0-9a-f]{8,9}\b/g) ?? []).slice(-1)[0];
  const regression = /REGRESSION/.test(r.issue);
  const issue = r.issue && r.issue !== "—" ? r.issue : "";
  const full = live ? (issue ? "dalinai" : "taip") : "ne";
  let next = nextFromRegister.get(r.id) || m.executor || "";
  if (!next) next = live ? (issue ? "Pašalinti likusį trūkumą" : "Nereikia; kartoti tik po susijusio pakeitimo") : "Priskirti krypčiai";
  return {
    id: r.id,
    lt: m.lt || r.name,
    what: m.what || "",
    who: m.who || "",
    scope: r.status === "DUPLICATE" ? "dublikatas" : "taip",
    built: yn(built),
    merged: yn(built),
    deployed: /^yes/i.test(r.inProd) ? "taip" : /^no/i.test(r.inProd) ? "ne" : "nenustatyta",
    ci: live || r.status === "PASS_CI_ONLY" ? "taip" : r.status === "NOT_IMPLEMENTED" ? "ne" : "nenustatyta",
    prod: live ? "taip" : "ne",
    full,
    state: s,
    gaps: (regression ? "REGRESIJA. " : "") + (issue || (live ? "—" : r.status === "NOT_IMPLEMENTED" ? "Nesukurta" : "Nėra produkcijos įrodymo")),
    refs: [
      ...prsInEvidence.slice(0, 4).map((n) => (openNums.has(n) ? `#${n} (atviras)` : `#${n}`)),
      ...runs.map((x) => `run ${x}`),
      build ? `build ${build}` : "",
    ]
      .filter(Boolean)
      .join(", "),
    checked: r.checked,
    lane: LANE[groupOf(r.id)] ?? "koordinatorius",
    next,
    openPrs,
    regression,
  };
}
const fns = rows.filter((r) => r.status !== "DUPLICATE").map(fnFields);
const fnById = new Map(fns.map((f) => [f.id, f]));

// ---------------------------------------------------------------- user groups
const USER_GROUPS = [
  ["Darbuotojas", /darbuotojas|ieškantis darbo|savarankiškas/],
  ["Darbdavys", /įmonė|vadovas|klientas/],
  ["Personalo atrankos / įdarbinimo agentūra", /agentūra/],
  ["Studentas / praktikantas", /besimokantis|student|praktik/],
  ["Mokymo įstaiga", /mokymo įstaiga/],
];

// ---------------------------------------------------------------- product areas (owner list)
const AREAS = [
  ["Registracija", (f) => groupOf(f.id) === "1" && /sign|regist|auth|oauth|invit|e-mail|mail/i.test(f._name)],
  ["Profiliai ir CV", (f) => groupOf(f.id) === "2"],
  ["Darbo paieška", (f) => groupOf(f.id) === "4" && /job|search|board|vacanc|fit|saved/i.test(f._name)],
  ["Poreikių skelbimas", (f) => groupOf(f.id) === "4" && /need|demand|intake|request|post/i.test(f._name)],
  ["Kandidatavimas ir įdarbinimas", (f) => groupOf(f.id) === "4" && /appl|candidate|hire|shortlist|offer|interest|match/i.test(f._name)],
  ["Agentūrų veikla", (f) => /agentūra/.test(f.who)],
  ["Organizacijų valdymas ir projektai", (f) => groupOf(f.id) === "3" || (groupOf(f.id) === "1" && /organi|company|workspace|member|role/i.test(f._name))],
  ["Mokymas ir praktika", (f) => groupOf(f.id) === "11"],
  ["Komunikacija", (f) => groupOf(f.id) === "5"],
  ["Prekyvietė", (f) => groupOf(f.id) === "6"],
  ["Mokėjimai", (f) => groupOf(f.id) === "7"],
  ["AI funkcijos ir MCP", (f) => groupOf(f.id) === "10"],
  ["Kalbos ir mobilus naudojimas", (f) => groupOf(f.id) === "8"],
  ["Saugumas, privatumas ir administravimas", (f) => groupOf(f.id) === "9"],
  ["Rinkos žinios", (f) => groupOf(f.id) === "12"],
  ["Infrastruktūra ir veikimas", (f) => groupOf(f.id) === "13"],
];
for (const f of fns) f._name = rows.find((r) => r.id === f.id).name;

// ---------------------------------------------------------------- PR classification
const PR_AREAS = [
  ["2", /cv|experience|journal|living|history|profile|skill|evidence|recogn/i],
  ["11", /learn|cohort|educat|student|intern|practice|programme|rpl/i],
  ["7", /pay|stripe|billing|price|pricing|plan|vat|invoice|checkout|subscription|fee/i],
  ["1", /sign.?up|signup|auth|login|regist|invit|onboard|oauth|welcome|e-?mail|deliver/i],
  ["4", /job|search|demand|need|vacanc|match|shortlist|candidate|hire|intake|advert/i],
  ["3", /compan|org|project|roster|workspace|team|booking|forecast|timesheet|absence|contract/i],
  ["5", /chat|message|notif|conversation/i],
  ["6", /market|offering|listing|service/i],
  ["8", /locale|i18n|translat|language|mobile|android|ios|390|phone|sv|copy|landing|v3/i],
  ["9", /rls|security|privacy|gdpr|admin|consent|cookie|permission/i],
  ["10", /\bai\b|mcp|agent|assist|llm/i],
  ["12", /market.?intel|insight|stats|analytics|report/i],
  ["13", /ci|deploy|walk|e2e|test|ops|vps|cron|guard|migration|infra|docs|chore/i],
];
function prArea(p) {
  const scope = (p.title.match(/^\w+\(([^)]+)\)/) ?? [])[1] ?? "";
  const hay = `${scope} ${p.title} ${p.branch}`;
  for (const [g, re] of PR_AREAS) if (re.test(hay)) return g;
  return "13";
}
const isRed = (p) => p.labels.includes("needs-human-gate") || /migration|rls|\bRED\b/i.test(p.title);
function prBlocker(p) {
  const v = p.verdicts;
  if (p.mergeableState === "dirty") return "konfliktas su main (reikia rebase)";
  if (p.ci.state === "failure") return `CI nepraėjo: ${p.ci.failed.join(", ")}`;
  if (p.ci.state === "pending") return "CI vyksta";
  if (v.review === "blocks") return "R peržiūra: blokuoja";
  if (isRed(p) && v.security === "blocks") return "R2 saugumo peržiūra: blokuoja";
  if (v.review === "stale") return "R peržiūra senai versijai (nauja versija)";
  if (v.review === "none" && v.security === "none") return "laukia peržiūros";
  if (isRed(p) && v.security !== "no-block") return "RED: laukia R2 saugumo peržiūros dabartinei versijai";
  if (v.review === "unclear") return "peržiūros verdiktas neaiškus";
  if (p.mergeableState === "behind") return "atsilieka nuo main (atnaujinti)";
  if (p.mergeableState === "unknown") return "GitHub dar neapskaičiavo sujungiamumo";
  return p.draft ? "paruoštas (juodraštis, žymėti ir jungti)" : "paruoštas jungti";
}
const prs = data.prs.map((p) => ({ ...p, area: prArea(p), red: isRed(p), blocker: prBlocker(p) }));

// ---------------------------------------------------------------- narrative
const narrative = {};
if (NARRATIVE) {
  const txt = readFileSync(NARRATIVE, "utf8");
  const parts = txt.split(/^<!-- section:(\w+) -->\s*$/m);
  for (let i = 1; i < parts.length; i += 2) narrative[parts[i]] = parts[i + 1].trim();
}
const nar = (k) => narrative[k] || "_Koordinatorius šios dalies šiam laikotarpiui neparašė._";

// ---------------------------------------------------------------- previous report (for "what changed")
const prev = { states: new Map(), live: null, openPrs: null, at: null };
try {
  const old = readFileSync(OUT, "utf8").split("\n");
  const a7 = old.findIndex((l) => /^## A7\./.test(l));
  for (const l of a7 >= 0 ? old.slice(a7) : []) {
    if (!ROW_ID.test(l)) continue;
    const c = cells(l);
    prev.states.set(c[0], { lt: c[1], state: c[10] });
  }
  prev.live = Number((old.find((l) => l.startsWith("**Funkcijos:**"))?.match(/įrodyta\) (\d+)/) ?? [])[1]) || null;
  prev.openPrs = Number((old.find((l) => /^### Atviri PR \(/.test(l))?.match(/\((\d+)\)/) ?? [])[1]) || null;
  prev.at = (old.find((l) => l.startsWith("Sugeneruota "))?.match(/^Sugeneruota ([^(]+)/) ?? [])[1]?.trim() ?? null;
} catch {
  // first report: nothing to compare
}

// ---------------------------------------------------------------- render
const esc = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
const vilnius = (iso) =>
  new Date(iso).toLocaleString("lt-LT", { timeZone: "Europe/Vilnius", dateStyle: "short", timeStyle: "short" });
const countStates = (list) => {
  const c = Object.fromEntries(STATE_ORDER.map((s) => [s, 0]));
  for (const f of list) if (f.state in c) c[f.state]++;
  return c;
};
const stateRow = (label, list) => {
  const c = countStates(list);
  return `| ${label} | ${list.length} | ${STATE_ORDER.map((s) => c[s]).join(" | ")} |`;
};
const stateHead = `| Sritis | Iš viso | ${STATE_ORDER.join(" | ")} |\n|---|---|${STATE_ORDER.map(() => "---").join("|")}|`;

function changesBlock() {
  if (!prev.states.size) return ["Ankstesnės ataskaitos nėra — tai pirmoji; pokyčiai bus rodomi nuo kitos."];
  const out = [`Lyginama su ataskaita, sugeneruota ${prev.at ?? "?"}.`, ""];
  const changed = [];
  for (const f of fns) {
    const p = prev.states.get(f.id);
    if (!p) changed.push(`- **Nauja funkcija** ${f.id} ${f.lt} — ${f.state}`);
    else if (p.state !== f.state) changed.push(`- ${f.id} ${f.lt}: ${p.state} → **${f.state}**`);
  }
  for (const [id, p] of prev.states) if (!fnById.has(id)) changed.push(`- **Išimta iš registro** ${id} ${p.lt}`);
  const liveNow = fns.filter((f) => f.state === "VEIKIA PRODUKCIJOJE").length;
  out.push(
    `- Veikia produkcijoje: ${prev.live ?? "?"} → ${liveNow}.`,
    `- Atvirų PR: ${prev.openPrs ?? "?"} → ${data.prs.length}; sujungta per laikotarpį ${data.merged.length}.`,
    `- Produkcijos diegimų per laikotarpį: ${data.deploys.filter((d) => d.conclusion === "success").length} sėkmingi, ${data.deploys.filter((d) => d.conclusion === "failure").length} nepavykę.`,
    "",
    changed.length ? "Funkcijų būsenų pokyčiai:" : "Funkcijų būsenų pokyčių registre nėra.",
    ...changed,
  );
  return out;
}

const L = [];
const P = (...x) => L.push(...x);
const countedFns = fns.filter((f) => f.state !== "PAPILDOMAS TESTAS");
const total = countStates(countedFns);
const live = total["VEIKIA PRODUKCIJOJE"];

P(
  "# LabourMarket.ai — 12 valandų būklės ataskaita",
  "",
  `Sugeneruota ${vilnius(data.fetchedAt)} (Lietuvos laiku). Laikotarpis: nuo ${vilnius(data.sinceIso)}.`,
  "",
  "Kanoninis dokumentas (savininko nurodymas 2026-11-14, P0). Kiekviena ataskaita perrašo šį failą; ankstesnės ataskaitos — šio failo git istorijoje. " +
    "Funkcijų būsenos imamos tik iš [`FUNCTION_REGISTER.md`](FUNCTION_REGISTER.md) eilučių: funkcija laikoma veikiančia tik tada, kai jos eilutė turi produkcijos įrodymą (`LIVE_VERIFIED`). " +
    "Kodas ar žalias CI veikimo neįrodo. Generatorius: `.github/scripts/status-report.mjs`.",
  "",
  `**Produkcija:** versija \`${data.health?.build ?? "nežinoma"}\`, sveikata ${data.health?.ok ? "gera" : "BLOGA"} (DB ${data.health?.dbMs ?? "?"} ms), patikrinta ${data.health?.at ? vilnius(data.health.at) : "?"}.`,
  "",
  `**Funkcijos:** ${countedFns.length} privalomos apimties funkcijų; veikia produkcijoje (įrodyta) ${live} (${((live / countedFns.length) * 100).toFixed(1)} %). Tai nėra užbaigimo procentas: likusios ${countedFns.length - live} funkcijų išvardytos A7 dalyje.`,
  "",
  "## Pokyčiai nuo ankstesnės ataskaitos",
  "",
  ...changesBlock(),
  "",
  "## B. Trumpa vadovo suvestinė",
  "",
  nar("summary"),
  "",
  "## A1. Būsenos pagal registro grupes",
  "",
  stateHead,
);
const groupIds = [...new Set(countedFns.map((f) => groupOf(f.id)))].sort((a, b) => a - b);
for (const g of groupIds) P(stateRow(`${g}. ${groupsLt.get(g) ?? ""}`, countedFns.filter((f) => groupOf(f.id) === g)));
P(stateRow("**Iš viso**", countedFns), "");

P("## A2. Penkios naudotojų grupės", "", nar("groups"), "", stateHead);
for (const [label, re] of USER_GROUPS) P(stateRow(label, countedFns.filter((f) => re.test(f.who))));
P(
  "",
  "Funkcija priskiriama grupei pagal registro stulpelį „Kam“; viena funkcija gali tarnauti kelioms grupėms. Grupės funkcijos, kurios dar neveikia produkcijoje:",
  "",
);
for (const [label, re] of USER_GROUPS) {
  const open = countedFns.filter((f) => re.test(f.who) && f.state !== "VEIKIA PRODUKCIJOJE");
  P(`- **${label}** (${open.length}): ${open.map((f) => `${f.id} ${f.lt} — ${f.state}`).join("; ") || "nėra"}`);
}
P("", "### Naudotojų scenarijai (visi žingsniai)", "", "| Scenarijus | Žingsnių | Veikia produkcijoje | Neveikiantys žingsniai |", "|---|---|---|---|");
for (const j of journeys.values()) {
  const steps = j.fns.map((id) => fnById.get(id)).filter(Boolean);
  const bad = steps.filter((f) => f.state !== "VEIKIA PRODUKCIJOJE");
  P(
    `| ${j.id} ${esc(j.lt)} | ${steps.length} | ${bad.length ? "ne" : "taip"} | ${esc(bad.map((f) => `${f.id} (${f.state})`).join(", ") || "—")} |`,
  );
}
P("");

P("## A3. Vientisa CV sistema (#3354)", "", nar("cv"), "", "Registro eilutės, kurios sudaro CV sistemą:", "", "| ID | Funkcija | Būsena | Trūkumai |", "|---|---|---|---|");
const cvIds = countedFns.filter((f) => groupOf(f.id) === "2" || f.id === "3.36" || /cv|history|experience|journal/i.test(f._name));
for (const f of cvIds) P(`| ${f.id} | ${esc(f.lt)} | ${f.state} | ${esc(f.gaps)} |`);
P("");

P("## A4. PR ir diegimai", "");
P("### Produkcijos diegimai per laikotarpį", "");
if (!data.deploys.length) P("Diegimų per laikotarpį nebuvo.");
else {
  P("| Versija | Rezultatas | Laikas | Įrašas |", "|---|---|---|---|");
  for (const d of data.deploys) P(`| \`${d.sha}\` | ${d.conclusion ?? d.status} | ${vilnius(d.at)} | [run](${d.url}) |`);
}
const failedDeploys = data.deploys.filter((d) => d.conclusion === "failure");
P("", `Nepavykę diegimai: ${failedDeploys.length ? failedDeploys.map((d) => d.sha).join(", ") : "nėra"}.`, "");
P("### Produkcijos bandymai (walks) per laikotarpį", "");
if (!data.walks.length) P("Nebuvo.");
else {
  P("| Bandymas | Versija | Rezultatas | Laikas |", "|---|---|---|---|");
  for (const w of data.walks)
    P(`| [${esc(w.title)}](${REPO_URL}/actions/runs/${w.id}) | \`${w.sha}\` | ${w.conclusion ?? w.status} | ${vilnius(w.at)} |`);
}
P("", `### Sujungti per laikotarpį (${data.merged.length})`, "");
for (const m of data.merged) P(`- #${m.number} ${esc(m.title)}`);
const by = (pred) => prs.filter(pred);
const conflicts = by((p) => p.mergeableState === "dirty");
const awaitingReview = by((p) => /laukia/.test(p.blocker));
const ready = by((p) => /^paruoštas/.test(p.blocker));
const ciFail = by((p) => p.ci.state === "failure");
P(
  "",
  `### Atviri PR (${prs.length})`,
  "",
  `Paruošti jungti ${ready.length}; konfliktuoja ${conflicts.length}; CI nepraėjo ${ciFail.length}; laukia peržiūros ${awaitingReview.length}; RED (migracijos, RLS, saugumas) ${prs.filter((p) => p.red).length}.`,
  "",
  "PR sugrupuoti pagal funkcinę sritį; srities viduje pirmiausia RED, tada paruošti, tada kiti. Blokatorius — pirmoji iš eilės priežastis (konfliktas, CI, peržiūra).",
  "",
);
for (const g of [...new Set(prs.map((p) => p.area))].sort((a, b) => a - b)) {
  const list = prs
    .filter((p) => p.area === g)
    .sort((a, b) => (b.red - a.red) || (/^paruoštas/.test(b.blocker) - /^paruoštas/.test(a.blocker)) || a.number - b.number);
  P(`#### ${g}. ${groupsLt.get(g) ?? ""} (${list.length})`, "", "| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |", "|---|---|---|---|---|---|");
  for (const p of list)
    P(
      `| [#${p.number}](${REPO_URL}/pull/${p.number}) | ${esc(p.title)}${p.draft ? " (juodraštis)" : ""} | ${p.red ? "RED" : "GREEN"} | ${p.ci.state} | ${p.verdicts.review} / ${p.verdicts.security} | ${esc(p.blocker)} |`,
    );
  P("");
}

P("## A5. Realus produkto veikimas pagal sritis", "", nar("product"), "", stateHead);
for (const [label, pred] of AREAS) P(stateRow(label, countedFns.filter(pred)));
P("", "Papildomos patikros, matuotos ne funkcijų eilutėse (paskutinis matavimas registre):", "", "| Patikra | Matuota | Rezultatai |", "|---|---|---|");
for (const [label, c, when] of extraChecks)
  P(`| ${label} | ${when} | ${Object.entries(c).map(([k, v]) => `${k} ${v}`).join(", ") || "nėra duomenų"} |`);
P("");

P("## A6. Pilnumo kontrolė", "");
P(
  `- Patvirtinta apimtis: ${countedFns.length} funkcijų (registras; dublikatai ir papildomi testai neskaičiuojami).`,
  `- Veikia produkcijoje: ${live}. Neužbaigta: ${countedFns.length - live} (sąrašas žemiau ir A7).`,
  `- Regresijos registre: ${countedFns.filter((f) => f.regression).map((f) => f.id).join(", ") || "nėra"}.`,
  "",
  "### Neužbaigti reikalavimai ir kitas veiksmas",
  "",
  "| ID | Funkcija | Būsena | Trūkumas | Atsakingas | Kitas veiksmas |",
  "|---|---|---|---|---|---|",
);
for (const f of countedFns.filter((f) => f.state !== "VEIKIA PRODUKCIJOJE" || f.full !== "taip"))
  P(`| ${f.id} | ${esc(f.lt)} | ${f.state}${f.full === "dalinai" ? " (dalinai)" : ""} | ${esc(f.gaps)} | ${esc(f.lane)} | ${esc(f.next)} |`);
P("", "### Naujai aptiktos ar patvirtintos funkcijos ir prognozė", "", nar("forecast"), "");

P(
  "## A7. Pilnas vardinis funkcijų registras",
  "",
  "Stulpeliai: Apimtyje · Kode · Sujungta su main · Įdiegta · CI · Patikrinta produkcijoje · Visas scenarijus. Reikšmės išvestos iš registro būsenos; „nenustatyta“ — registras to neįrodo.",
  "",
  "| ID | Pavadinimas | Ką atlieka / kam | Apimt. | Kode | main | Įdiegta | CI | Prod. | Scenarijus | Būsena | Trūkumai | Nuorodos | Atsakingas | Kitas veiksmas |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
);
for (const f of fns)
  P(
    `| ${f.id} | ${esc(f.lt)} | ${esc(f.what)}${f.who ? ` — ${esc(f.who)}` : ""} | ${f.scope} | ${f.built} | ${f.merged} | ${f.deployed} | ${f.ci} | ${f.prod} | ${f.full} | ${f.state} | ${esc(f.gaps)} | ${esc(f.refs)} (tikrinta ${esc(f.checked)}) | ${esc(f.lane)} | ${esc(f.next)} |`,
  );
P("");

writeFileSync(OUT, L.join("\n"));
console.log(`wrote ${OUT}: ${fns.length} functions, ${prs.length} open PRs, live ${live}/${countedFns.length}`);
