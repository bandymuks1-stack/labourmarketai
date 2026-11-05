#!/usr/bin/env node
/**
 * FUNCTION MAP — one self-contained HTML page GENERATED from FUNCTION_REGISTER.md
 * (owner order 2026-11-05, result 2). The register stays the ONE source of truth:
 * nothing here stores a status, and the page is an output, never edited or committed.
 *
 *   node .github/scripts/function-map.mjs --out <file.html>
 *
 * READ-ONLY and offline: reads one checked-in file, no network, no clock, no
 * production data. Same register, same bytes (lib/guards/function-map-tool.test.ts).
 *
 * Relations the rows do not hold (dependencies, data movement, stages, Lithuanian
 * names) come from the optional `## Function map data` section of the register. Until
 * a table there is filled, the page derives what it can and labels it as derived.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REGISTER_PATH = join(ROOT, "docs", "program", "FUNCTION_REGISTER.md");
export const COORDINATION_PATH = join(ROOT, "docs", "program", "COORDINATION_REGISTER.md");

export const STATUSES = [
  "LIVE_VERIFIED",
  "PASS_CI_ONLY",
  "NOT_VERIFIED",
  "BLOCKED",
  "FAIL",
  "NOT_IMPLEMENTED",
  "OPTIONAL_TEST",
  "DUPLICATE",
];

const STATUS_LT = {
  LIVE_VERIFIED: "Veikia, patikrinta gamyboje",
  PASS_CI_ONLY: "Tik automatiniai testai",
  NOT_VERIFIED: "Dar nepatikrinta",
  BLOCKED: "Laukia sprendimo ar paskyros",
  FAIL: "Neveikia",
  NOT_IMPLEMENTED: "Nesukurta",
  OPTIONAL_TEST: "Papildomas testas",
  DUPLICATE: "Dublikatas",
};

/** Fallback only: the register's `Map: groups` table wins as soon as it has the row. */
const GROUP_LT = {
  1: "Tapatybė, registracija, organizacijos",
  2: "Darbuotojo profilis, darbo žurnalas, gyvas CV",
  3: "Įmonės darbas ir projektai",
  4: "Poreikiai, darbo skelbimai, atranka",
  5: "Pokalbiai ir bendravimas",
  6: "Prekyvietė",
  7: "Planai ir mokėjimai",
  8: "Kalbos ir rinkos",
  9: "Administravimas, privatumas, saugumas",
  10: "MCP ir AI agentai",
  11: "Mokymasis",
  12: "Rinkos įžvalgos",
  13: "Infrastruktūra ir priežiūra",
};

/** Fallback only: the register's `Map: journeys` table wins. */
const JOURNEY_LT = {
  "J-1": "Darbuotojas prisijungia ir įrašo pirmą darbą į gyvą CV",
  "J-2": "Vadovas patvirtina darbo įrašą, ir jis atsiranda gyvame CV",
  "J-3": "Darbuotojas randa poreikį, įmonė su juo susisiekia",
  "J-4": "Darbo paieška, skelbimas, perėjimas pas šaltinį",
  "J-5": "Įmonė prisijungia, skelbia poreikį ir randa žmones",
  "J-6": "Įmonė pakviečia žmogų, ir jis tampa nariu",
  "J-7": "Projektas, darbuotojas, valandos objekte, ataskaita",
  "J-8": "Poreikis, pasiūlytos datos, darbuotojas sutinka",
  "J-9": "Agentūra skelbia žmones, klientas gauna pasiūlymą",
  "J-10": "Brigada siūloma ir derinama kaip vienas vienetas",
  "J-11": "Prekė ar paslauga randama, užsakoma, aptariama",
  "J-12": "Mokykla, grupė, mokinys, praktika, kompetencija",
  "J-13": "Pirkėjas pateikia užklausą teikėjui",
  "J-14": "Organizacija pati nusiperka planą",
  "J-15": "Pranešimas apie tinkamą darbą be prisijungimo",
  "J-16": "Pamiršau slaptažodį, nustatau naują",
  "J-17": "Programėlė įdiegiama iš parduotuvės",
  "J-18": "Savo duomenų eksportas ir ištrynimas",
  "J-19": "Augimas: galimi gebėjimai ir mokymosi kryptis",
};

/** The catalogue's human needs, in the owner's order (`Map: functions`, Poreikiai). */
const NEEDS_LT = {
  mokymasis: "Mokymasis",
  "pirmas-darbas": "Pirmas darbas",
  isidarbinimas: "Įsidarbinimas",
  "savarankiskos-paslaugos": "Savarankiškos paslaugos",
  samdymas: "Samdymas",
  projektai: "Projektai",
  "verslo-valdymas": "Verslo valdymas",
  tobulejimas: "Tobulėjimas",
  "karjeros-keitimas": "Karjeros keitimas",
  senjorai: "Senjorai",
};

const BROWSER_LT = {
  eisena: "Automatinė eisena gamyboje (Playwright Chromium, ne žmogus Chrome naršyklėje)",
  savininkas: "Savininkas ar tikras naudotojas naršyklėje",
  api: "Įrodyta gamyboje be naršyklės",
  ne: "Naršyklėje netikrinta",
  "": "NOT VERIFIED: neįvertinta",
};

/**
 * The function's state, DERIVED and never stored (agreed with J-15, 2026-11-05).
 * `kuriama` needs a pull request named on a blocker or open item about the row.
 */
export function deriveState(status, hasNamedPr = false) {
  if (status === "LIVE_VERIFIED") return "veikianti";
  if (status === "PASS_CI_ONLY" || status === "NOT_VERIFIED") return "testuojama";
  if (status === "BLOCKED" || status === "FAIL") return "užblokuota";
  if (status === "NOT_IMPLEMENTED") return hasNamedPr ? "kuriama" : "planuojama";
  return null;
}

const JOURNEY_STATE_LT = { complete: "Pasiekiama", partial: "Iš dalies", blocked: "Užblokuota", broken: "Nutrūksta" };

const cellsOf = (line) =>
  line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

const scrub = (s) => String(s ?? "").replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]");
const plain = (s) => scrub(s).replace(/\*\*/g, "").replace(/`/g, "");

/** "6.1–6.3, 4.9" → ["6.1", "6.2", "6.3", "4.9"]. */
export function expandIds(text) {
  const out = [];
  for (const m of String(text).matchAll(/(\d+)\.(\d+)(?:\s*[–-]\s*(?:(\d+)\.)?(\d+))?/g)) {
    const [, major, from, major2, to] = m;
    if (to !== undefined && (major2 === undefined || major2 === major)) {
      for (let n = Number(from); n <= Number(to); n++) out.push(`${major}.${n}`);
    } else {
      out.push(`${major}.${from}`);
    }
  }
  return [...new Set(out)];
}

/** Every planned function, read only from the group sections' own tables. */
export function parseFunctions(md) {
  const groups = [];
  let heading = null;
  let inTable = false;
  let group = null;
  for (const line of md.split("\n")) {
    if (line.startsWith("#")) {
      heading = line.replace(/^#+\s*/, "");
      inTable = false;
      group = null;
      continue;
    }
    if (/^\|\s*ID\s*\|\s*Function\s*\|\s*Status\s*\|/.test(line)) {
      inTable = true;
      group = { name: heading, functions: /** @type {any[]} */ ([]) };
      groups.push(group);
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith("|")) {
      if (line.trim() !== "") inTable = false;
      continue;
    }
    const c = cellsOf(line);
    if (!/^\d+\.\d+$/.test(c[0] ?? "")) continue;
    group.functions.push({
      id: c[0],
      name: plain(c[1]),
      status: c[2],
      checked: c[3] ?? "",
      evidence: plain(c[4]),
      inProduction: c[5] ?? "",
      issue: plain(c.slice(6).join(" | ")),
    });
  }
  return groups
    .filter((g) => g.functions.length > 0)
    .map((g) => ({ ...g, number: Number(g.functions[0].id.split(".")[0]) }));
}

export function parseJourneys(md) {
  const out = [];
  for (const line of md.split("\n")) {
    if (!/^\|\s*J-\d+\s*\|/.test(line)) continue;
    const c = cellsOf(line);
    if (!["complete", "partial", "blocked", "broken"].includes(c[2])) continue;
    const parens = [...c[1].matchAll(/\(([^()]*\d+\.\d+[^()]*)\)/g)];
    out.push({
      id: c[0],
      name: plain(c[1].replace(/\s*\([^()]*\d+\.\d+[^()]*\)\s*$/, "")),
      state: c[2],
      why: plain(c[3]),
      functions: parens.length ? expandIds(parens[parens.length - 1][1]) : [],
    });
  }
  return out;
}

export function parseScenarios(md) {
  const out = [];
  for (const line of md.split("\n")) {
    if (!/^\|\s*SC-\d+\s*\|/.test(line)) continue;
    const c = cellsOf(line);
    out.push({ id: c[0], name: plain(c[1]), status: c[2], proof: plain(c[5]), problem: plain(c[6]) });
  }
  return out;
}

/** The `### Every row` table of the FAIL and BLOCKED triage. */
export function parseTriage(md) {
  const out = [];
  let on = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("#")) on = line.startsWith("### Every row");
    if (!on || !line.startsWith("|")) continue;
    const c = cellsOf(line);
    if (c[0] === "ID" || /^-+$/.test(c[0])) continue;
    out.push({ id: c[0], name: plain(c[1]), status: c[2], kind: c[3].replace(/`/g, ""), reason: plain(c[4]), next: plain(c[6]) });
  }
  return out;
}

/** One optional table of `## Function map data`: rows as objects, by its own header. */
export function parseMapTable(md, title) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === `### Map: ${title}`);
  if (start < 0) return [];
  let header = null;
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("#")) break;
    if (!line.startsWith("|")) continue;
    const c = cellsOf(line);
    if (/^-+$/.test(c[0])) continue;
    if (!header) {
      header = c;
      continue;
    }
    rows.push(Object.fromEntries(header.map((h, i) => [h, plain(c[i] ?? "")])));
  }
  return rows;
}

/** `### Open items` of COORDINATION_REGISTER.md; a public file, optional here. */
export function parseOpenItems(md) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === "### Open items");
  if (start < 0) return [];
  let header = null;
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("#")) break;
    if (!line.startsWith("|")) continue;
    const c = cellsOf(line);
    if (/^-+$/.test(c[0])) continue;
    if (!header) {
      header = c;
      continue;
    }
    rows.push(Object.fromEntries(header.map((h, i) => [h, plain(c[i] ?? "")])));
  }
  return rows;
}

const inDenominator = (f) => f.status !== "DUPLICATE" && f.status !== "OPTIONAL_TEST";

function countsOf(functions) {
  const by = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const f of functions) by[f.status] = (by[f.status] ?? 0) + 1;
  const counted = functions.filter(inDenominator);
  const built = counted.filter((f) => f.status !== "NOT_IMPLEMENTED").length;
  const verified = counted.filter((f) => f.status === "LIVE_VERIFIED").length;
  const pct = (n) => (counted.length ? Math.round((n / counted.length) * 1000) / 10 : 0);
  return { by, total: counted.length, built, verified, builtPct: pct(built), verifiedPct: pct(verified) };
}

/** Everything the page shows, from the register text alone. Deterministic. */
export function buildModel(rawMd, rawCoordination = "") {
  const md = rawMd.replace(/\r\n/g, "\n");
  const coordination = rawCoordination.replace(/\r\n/g, "\n");
  const groupsLt = new Map(parseMapTable(md, "groups").map((r) => [Number(r.Group), r]));
  const groups = parseFunctions(md).map((g) => ({
    number: g.number,
    name: g.name,
    lt: groupsLt.get(g.number)?.["Lietuviškai"] || GROUP_LT[g.number] || g.name,
    about: groupsLt.get(g.number)?.Trumpai || "",
    functions: g.functions,
    counts: countsOf(g.functions),
  }));
  const openItems = parseOpenItems(coordination);
  const prNamedFor = new Set();
  for (const b of parseMapTable(md, "blockers")) {
    if (/#\d{2,5}/.test(Object.values(b).join(" "))) expandIds(b.Affects ?? "").forEach((id) => prNamedFor.add(id));
  }
  for (const item of openItems) {
    if (/#\d{2,5}/.test(Object.values(item).join(" "))) expandIds(item.Rows ?? "").forEach((id) => prNamedFor.add(id));
  }
  const catalogue = new Map(parseMapTable(md, "functions").map((r) => [r.ID, r]));
  for (const g of groups) {
    g.functions = g.functions.map((f) => {
      const c = catalogue.get(f.id);
      return {
        ...f,
        state: deriveState(f.status, prNamedFor.has(f.id)),
        lt: c?.Pavadinimas || "",
        does: c?.["Ką leidžia"] || "",
        forWhom: c?.Kam || "",
        where: c?.["Kur rasti"] || "",
        needs: (c?.Poreikiai ?? "").split(/,\s*/).filter(Boolean),
        browser: c?.["Naršyklė"] ?? "",
        browserLt: BROWSER_LT[c?.["Naršyklė"] ?? ""] ?? c?.["Naršyklė"] ?? "",
        price: c?.Kaina || "",
        executor: c?.Vykdytojas || "",
      };
    });
  }
  const all = groups.flatMap((g) => g.functions);
  const known = new Set(all.map((f) => f.id));
  // The fourth measure: works AND a browser saw it, over every counted row of the
  // need. A missing catalogue value counts as not done.
  const needs = Object.entries(NEEDS_LT).map(([slug, lt]) => {
    const rows = all.filter((f) => inDenominator(f) && f.needs.includes(slug));
    const done = rows.filter((f) => f.state === "veikianti" && (f.browser === "eisena" || f.browser === "savininkas"));
    return {
      slug,
      lt,
      done: done.length,
      total: rows.length,
      pct: rows.length ? Math.round((done.length / rows.length) * 1000) / 10 : 0,
      ids: rows.map((f) => f.id),
    };
  });
  const unknownNeeds = [...new Set(all.flatMap((f) => f.needs))].filter((n) => !(n in NEEDS_LT));
  const statusOf = new Map(all.map((f) => [f.id, f.status]));

  const mapJourneys = parseMapTable(md, "journeys");
  const journeys = parseJourneys(md).map((j) => {
    const steps = mapJourneys.filter((r) => r.Journey === j.id);
    const functions = steps.length
      ? steps.sort((a, b) => Number(a.Step) - Number(b.Step)).flatMap((r) => expandIds(r.Functions))
      : j.functions;
    return {
      ...j,
      lt: steps[0]?.["Lietuviškai"] || JOURNEY_LT[j.id] || j.name,
      stateLt: JOURNEY_STATE_LT[j.state] ?? j.state,
      steps: functions.map((id) => ({ id, status: statusOf.get(id) ?? "UNKNOWN" })),
    };
  });

  const mapLinks = parseMapTable(md, "links").filter((r) => r.From && r.To);
  const derivedLinks = [];
  const seen = new Set();
  for (const j of journeys) {
    for (let i = 1; i < j.steps.length; i++) {
      const key = `${j.steps[i - 1].id}>${j.steps[i].id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      derivedLinks.push({ from: j.steps[i - 1].id, to: j.steps[i].id, kind: "seka", data: "", journey: j.id });
    }
  }
  const links = mapLinks.length
    ? mapLinks.map((r) => ({ from: r.From, to: r.To, kind: r.Kind, data: r.Data, journey: "" }))
    : derivedLinks;

  const groupOf = (id) => Number(String(id).split(".")[0]);
  const edgeCount = new Map();
  for (const l of links) {
    const a = groupOf(l.from);
    const b = groupOf(l.to);
    if (a === b) continue;
    const key = `${a}>${b}`;
    edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
  }
  const edges = [...edgeCount.entries()]
    .map(([k, n]) => {
      const [from, to] = k.split(">").map(Number);
      return { from, to, n };
    })
    .sort((x, y) => x.from - y.from || x.to - y.to);

  const journeysHaving = (id) => journeys.filter((j) => j.steps.some((s) => s.id === id)).map((j) => j.id);
  const mapBlockers = parseMapTable(md, "blockers");
  const blockers = mapBlockers.length
    ? mapBlockers.map((b) => ({
        id: b.Blocker,
        name: b["Lietuviškai"],
        status: "",
        kind: "",
        reason: "",
        next: b.Who,
        affects: b.Affects.split(/,\s*/).filter(Boolean),
      }))
    : parseTriage(md)
        .filter((t) => t.status === "FAIL" || /USER_BLOCKER/.test(t.kind))
        .map((t) => ({ ...t, affects: journeysHaving(t.id) }));

  const mapStages = parseMapTable(md, "stages");
  const stages = mapStages.length
    ? mapStages.map((s) => ({ name: s["Lietuviškai"] || s.Stage, ids: expandIds(s.Functions) }))
    : [
        { name: "1. Sutaisyti, kas neveikia", ids: all.filter((f) => f.status === "FAIL").map((f) => f.id) },
        {
          name: "2. Patikrinti gamyboje, kas sukurta",
          ids: all.filter((f) => f.status === "NOT_VERIFIED" || f.status === "PASS_CI_ONLY").map((f) => f.id),
        },
        { name: "3. Gauti sprendimus ir paskyras", ids: all.filter((f) => f.status === "BLOCKED").map((f) => f.id) },
        { name: "4. Sukurti, ko dar nėra", ids: all.filter((f) => f.status === "NOT_IMPLEMENTED").map((f) => f.id) },
      ];

  const counts = countsOf(all);
  const complete = journeys.filter((j) => j.state === "complete").length;
  const unknownIds = [
    ...new Set([
      ...journeys.flatMap((j) => j.steps.map((s) => s.id)),
      ...mapLinks.flatMap((l) => [l.From, l.To]),
      ...mapStages.flatMap((s) => expandIds(s.Functions)),
      ...catalogue.keys(),
    ]),
  ].filter((id) => /^\d+\.\d+$/.test(id) && !known.has(id));

  return {
    source: {
      file: "docs/program/FUNCTION_REGISTER.md",
      sha256: createHash("sha256").update(md).digest("hex"),
      latestCheck: all.map((f) => f.checked).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort().at(-1) ?? "",
    },
    partial: {
      links: mapLinks.length === 0,
      data: !mapLinks.some((l) => l.Kind === "data"),
      blockers: mapBlockers.length === 0,
      stages: mapStages.length === 0,
      groups: groupsLt.size === 0,
      catalogue: catalogue.size === 0,
    },
    catalogued: all.filter((f) => catalogue.has(f.id)).length,
    needs,
    unknownNeeds,
    openItems,
    counts,
    journeyTotals: {
      total: journeys.length,
      complete,
      pct: journeys.length ? Math.round((complete / journeys.length) * 1000) / 10 : 0,
    },
    statusLt: STATUS_LT,
    groups,
    journeys,
    scenarios: parseScenarios(md),
    blockers,
    stages,
    links,
    edges,
    unknownIds,
  };
}

const PAGE_JS = String.raw`
const M = JSON.parse(document.getElementById("data").textContent);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ORDER = ["LIVE_VERIFIED", "PASS_CI_ONLY", "NOT_VERIFIED", "BLOCKED", "FAIL", "NOT_IMPLEMENTED"];
const dot = (s) => '<i class="dot s-' + esc(s) + '" aria-hidden="true"></i>';
const bar = (c) => '<span class="bar" aria-hidden="true">' + ORDER.map((s) => c.by[s] ? '<i class="s-' + s + '" style="flex:' + c.by[s] + '"></i>' : "").join("") + "</span>";
const legend = () => '<ul class="legend">' + ORDER.map((s) => "<li>" + dot(s) + esc(M.statusLt[s]) + "</li>").join("") + "</ul>";
const partial = (t) => '<p class="partial"><b>Nepilna.</b> ' + esc(t) + "</p>";
const fn = new Map(M.groups.flatMap((g) => g.functions.map((f) => [f.id, f])));

function measures() {
  const row = (v, l, n) => '<div class="measure"><b>' + v + ' %</b><span>' + l + "</span><small>" + n + "</small></div>";
  return '<div class="measures">' +
    row(M.counts.builtPct, "Sukurta", M.counts.built + " iš " + M.counts.total + " funkcijų: visos, išskyrus nesukurtas") +
    row(M.counts.verifiedPct, "Patikrinta gamyboje", M.counts.verified + " iš " + M.counts.total + " funkcijų: tik su įrodymu gamyboje") +
    row(M.journeyTotals.pct, "Žmogus pasiekia tikslą", M.journeyTotals.complete + " iš " + M.journeyTotals.total + " kelionių: visa kelionė be kliūčių") +
    "</div>";
}

function graph() {
  const n = M.groups.length, W = 640, H = 460, cx = W / 2, cy = H / 2 - 4, rx = 235, ry = 170;
  const pos = new Map(M.groups.map((g, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [g.number, [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]];
  }));
  const lines = M.edges.map((e) => {
    const [x1, y1] = pos.get(e.from) ?? [0, 0], [x2, y2] = pos.get(e.to) ?? [0, 0];
    return '<line data-a="' + e.from + '" data-b="' + e.to + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke-width="' + Math.min(1 + e.n, 5) + '"/>';
  }).join("");
  const nodes = M.groups.map((g) => {
    const [x, y] = pos.get(g.number);
    return '<g class="node" tabindex="0" role="button" data-group="' + g.number + '" aria-label="' + esc(g.lt) + ", patikrinta " + g.counts.verifiedPct + ' procentų"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="27"/><text x="' + x.toFixed(1) + '" y="' + (y - 2).toFixed(1) + '" class="nn">' + g.number + '</text><text x="' + x.toFixed(1) + '" y="' + (y + 12).toFixed(1) + '" class="np">' + Math.round(g.counts.verifiedPct) + " %</text></g>";
  }).join("");
  return '<svg class="graph" viewBox="0 0 ' + W + " " + H + '" role="group" aria-label="Funkcijų grupės ir ryšiai tarp jų">' + lines + nodes + "</svg>";
}

function needsSection() {
  if (M.partial.catalogue) return partial("Žmogaus poreikiai atsiras, kai registre bus užpildyta lentelė „Map: functions“. Kol kas rodomos techninės grupės.");
  const cards = M.needs.map((n) => '<button class="card" data-need="' + esc(n.slug) + '"><strong>' + esc(n.lt) + "</strong><b class=\"big\">" + n.done + " / " + n.total + "</b><small>" + n.pct + " %: veikia ir matyta naršyklėje</small></button>").join("");
  return (M.catalogued < M.counts.total ? partial("Katalogas užpildytas " + M.catalogued + " funkcijų. Neužpildytos skaičiuojamos kaip nepadarytos.") : "") +
    '<p class="rule">Taisyklė: funkcija veikia gamyboje ir ją matė automatinė eisena (Playwright Chromium) ar žmogus naršyklėje, padalinta iš visų to poreikio funkcijų.</p><div class="cards">' + cards + "</div>";
}

function needDetail(slug) {
  const n = M.needs.find((x) => x.slug === slug);
  if (!n) return;
  const box = $("#detail");
  box.innerHTML = '<div class="dh"><h3>' + esc(n.lt) + " · " + n.done + " / " + n.total + '</h3><button id="close" aria-label="Uždaryti">✕</button></div><ul>' +
    n.ids.map((id) => { const f = fn.get(id); return "<li>" + dot(f.status) + "<span>" + esc(f.lt || f.name) + (f.does ? "<br><small>" + esc(f.does) + "</small>" : "") + "</span><small>" + esc(f.state || "") + (f.browserLt ? " · " + esc(f.browserLt) : "") + "</small></li>"; }).join("") + "</ul>";
  box.hidden = false;
  $("#close").onclick = () => { box.hidden = true; };
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function openItemsSection() {
  if (!M.openItems.length) return "";
  const keys = Object.keys(M.openItems[0]);
  return '<section><h2>Atviri darbai</h2><div class="tw"><table><thead><tr>' + keys.map((k) => "<th>" + esc(k) + "</th>").join("") + "</tr></thead><tbody>" + M.openItems.map((r) => "<tr>" + keys.map((k) => "<td>" + esc(r[k]) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div></section>";
}

function groupCards() {
  return '<div class="cards">' + M.groups.map((g) =>
    '<button class="card" data-group="' + g.number + '"><span class="num">' + g.number + "</span><strong>" + esc(g.lt) + "</strong>" + bar(g.counts) +
    "<small>" + g.counts.verified + " iš " + g.counts.total + " patikrinta" + (g.counts.by.FAIL ? " · neveikia " + g.counts.by.FAIL : "") + (g.counts.by.BLOCKED ? " · laukia " + g.counts.by.BLOCKED : "") + "</small></button>").join("") + "</div>";
}

function journeyChain(j, tech) {
  const steps = j.steps.map((s) => '<span class="step" title="' + esc((fn.get(s.id) || {}).name || "") + '">' + dot(s.status) + (tech ? esc(s.id) : "") + "</span>").join('<span class="arr" aria-hidden="true">→</span>');
  return '<li class="journey j-' + esc(j.state) + '"><div><b>' + esc(tech ? j.id + " " + j.name : j.lt) + '</b><em>' + esc(j.stateLt) + "</em></div>" + (steps ? '<div class="chain">' + steps + "</div>" : "") + (tech ? "<small>" + esc(j.why) + "</small>" : "") + "</li>";
}

function blockersList(tech) {
  const rows = M.blockers.map((b) => "<li><b>" + esc(b.id) + " " + esc(b.name) + "</b>" +
    (b.reason ? "<span>" + esc(b.reason) + "</span>" : "") +
    (b.affects.length ? "<small>Paveikia: " + b.affects.map(esc).join(", ") + "</small>" : "") +
    (tech && b.next ? "<small>Kas toliau: " + esc(b.next) + "</small>" : "") + "</li>").join("");
  return '<ul class="blockers">' + rows + "</ul>";
}

function stagesList() {
  return '<ol class="stages">' + M.stages.map((s) => "<li><b>" + esc(s.name) + "</b><span>" + s.ids.length + " funkc.</span></li>").join("") + "</ol>";
}

function owner() {
  return "<section><h2>Kiek padaryta</h2>" + measures() + "</section>" +
    "<section><h2>Pagal žmogaus poreikį</h2>" + needsSection() + "</section>" +
    "<section><h2>Funkcijų grupės</h2>" + legend() + '<p class="rule">Paspausk grupę, kad matytum jos funkcijas. Funkcijų pavadinimai registre kol kas angliški.</p>' + groupCards() + "</section>" +
    "<section><h2>Kaip grupės susijusios</h2>" + (M.partial.links ? partial("Ryšiai kol kas išvesti tik iš žmogaus kelionių eilės. Tikros priklausomybės dar neįrašytos į registrą.") : "") + graph() + "</section>" +
    "<section><h2>Žmogaus kelionės: nuo registracijos iki rezultato</h2><ul class=\"journeys\">" + M.journeys.map((j) => journeyChain(j, false)).join("") + "</ul></section>" +
    "<section><h2>Kas dabar labiausiai trukdo</h2>" + (M.partial.blockers ? partial("Sąrašas paimtas iš registro FAIL ir BLOCKED peržiūros, todėl aprašymai kol kas angliški, o poveikis žinomas ne visur.") : "") + blockersList(false) + "</section>" +
    "<section><h2>Kiti etapai</h2>" + (M.partial.stages ? partial("Etapai išvesti iš būsenų. Savininko patvirtintos eilės registre dar nėra.") : "") + stagesList() + "</section>";
}

function technical() {
  const filter = '<div class="filters"><input id="q" type="search" placeholder="Ieškoti: ID, pavadinimas, įrodymas" aria-label="Ieškoti funkcijų"><select id="st" aria-label="Filtruoti pagal būseną"><option value="">Visos būsenos</option>' + Object.keys(M.statusLt).map((s) => '<option value="' + s + '">' + s + "</option>").join("") + "</select><span id=\"cnt\" role=\"status\"></span></div>";
  const groups = M.groups.map((g) => '<details class="tg" data-group="' + g.number + '"><summary><b>' + g.number + " " + esc(g.name) + "</b>" + bar(g.counts) + "<small>" + g.counts.builtPct + " % sukurta · " + g.counts.verifiedPct + ' % patikrinta</small></summary><div class="tw"><table><thead><tr><th>ID</th><th>Funkcija</th><th>Būsena</th><th>Būklė</th><th>Naršyklė</th><th>Tikrinta</th><th>Įrodymas</th><th>Liko</th></tr></thead><tbody>' +
    g.functions.map((f) => '<tr data-s="' + esc(f.status) + '" data-t="' + esc((f.id + " " + f.name + " " + f.evidence + " " + f.issue).toLowerCase()) + '"><td>' + esc(f.id) + "</td><td>" + esc(f.name) + "</td><td>" + dot(f.status) + esc(f.status) + "</td><td>" + esc(f.state || "") + "</td><td>" + esc(f.browser || "NOT VERIFIED") + "</td><td>" + esc(f.checked) + '</td><td class="ev">' + esc(f.evidence) + '</td><td class="ev">' + esc(f.issue) + "</td></tr>").join("") + "</tbody></table></div></details>").join("");
  const links = M.links.map((l) => "<tr><td>" + esc(l.from) + "</td><td>" + esc(l.to) + "</td><td>" + esc(l.kind) + "</td><td>" + esc(l.data || l.journey) + "</td></tr>").join("");
  const sc = M.scenarios.map((s) => "<tr><td>" + esc(s.id) + "</td><td>" + esc(s.name) + "</td><td>" + esc(s.status) + '</td><td class="ev">' + esc(s.proof) + '</td><td class="ev">' + esc(s.problem) + "</td></tr>").join("");
  return "<section><h2>Būsena ir taisyklė</h2>" + measures() + '<p class="rule">Vardiklis: ' + M.counts.total + " funkcijos, be DUPLICATE ir OPTIONAL_TEST. Sukurta: viskas, išskyrus NOT_IMPLEMENTED. Patikrinta: tik LIVE_VERIFIED. Kelionė: tik tada, kai registre jos būsena complete.</p>" + legend() + "</section>" +
    "<section><h2>Funkcijos</h2>" + filter + groups + "</section>" +
    "<section><h2>Priklausomybės ir duomenų judėjimas</h2>" + (M.partial.links ? partial("Rodoma tik kelionių eilė (seka). Priklausomybės (depends) ir duomenų judėjimas (data) bus iš lentelės „Map: links“ registre.") : "") + '<div class="tw"><table><thead><tr><th>Iš</th><th>Į</th><th>Rūšis</th><th>Duomenys / kelionė</th></tr></thead><tbody>' + links + "</tbody></table></div></section>" +
    "<section><h2>Kelionės</h2><ul class=\"journeys\">" + M.journeys.map((j) => journeyChain(j, true)).join("") + "</ul></section>" +
    "<section><h2>Scenarijai</h2><div class=\"tw\"><table><thead><tr><th>ID</th><th>Scenarijus</th><th>Būsena</th><th>Įrodymas</th><th>Problema</th></tr></thead><tbody>" + sc + "</tbody></table></div></section>" +
    "<section><h2>Kritiniai trukdžiai</h2>" + blockersList(true) + "</section>" +
    "<section><h2>Etapai</h2>" + stagesList() + "</section>" + openItemsSection();
}

function detail(number) {
  const g = M.groups.find((x) => x.number === number);
  if (!g) return;
  const box = $("#detail");
  box.innerHTML = '<div class="dh"><h3>' + g.number + " " + esc(g.lt) + '</h3><button id="close" aria-label="Uždaryti">✕</button></div>' + bar(g.counts) +
    "<ul>" + g.functions.map((f) => "<li>" + dot(f.status) + "<span>" + esc(f.lt || f.name) + "</span><small>" + esc(M.statusLt[f.status] || f.status) + "</small></li>").join("") + "</ul>";
  box.hidden = false;
  document.querySelectorAll(".graph line").forEach((l) => l.classList.toggle("on", l.dataset.a == number || l.dataset.b == number));
  $("#close").onclick = () => { box.hidden = true; };
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function show(view) {
  $("#view").innerHTML = view === "tech" ? technical() : owner();
  document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  document.querySelectorAll("[data-group]").forEach((el) => {
    if (el.tagName === "DETAILS") return;
    el.addEventListener("click", () => detail(Number(el.dataset.group)));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); detail(Number(el.dataset.group)); } });
  });
  document.querySelectorAll("[data-need]").forEach((el) => el.addEventListener("click", () => needDetail(el.dataset.need)));
  const q = $("#q"), st = $("#st");
  if (q) {
    const run = () => {
      const t = q.value.trim().toLowerCase(), s = st.value;
      let n = 0;
      document.querySelectorAll("tr[data-s]").forEach((r) => {
        const on = (!s || r.dataset.s === s) && (!t || r.dataset.t.includes(t));
        r.hidden = !on;
        if (on) n++;
      });
      document.querySelectorAll("details.tg").forEach((d) => { d.open = (t !== "" || s !== "") && d.querySelector("tr[data-s]:not([hidden])") !== null; });
      $("#cnt").textContent = n + " funkc.";
    };
    q.oninput = run;
    st.onchange = run;
    run();
  }
}
document.querySelectorAll("[data-view]").forEach((b) => { b.onclick = () => show(b.dataset.view); });
show("owner");
`;

const PAGE_CSS = `
:root{--bg:#070706;--card:#151513;--card2:#1d1d1a;--line:#2a2a26;--tx:#f5f1e8;--tx2:#cfc9bc;--tx3:#a39c8d;--gold:#d4af37;--ok:#34d399;--ci:#7fb2d9;--nv:#a39c8d;--wait:#ffa552;--bad:#ff5c5c;--none:#5b574e;color-scheme:dark}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#f4f6fb;--card:#fff;--card2:#edf0f6;--line:#bec3cd;--tx:#14130f;--tx2:#3b3932;--tx3:#5f5b50;--gold:#8a6a12;--ok:#107a53;--ci:#2a6a99;--nv:#6b675b;--wait:#a55910;--bad:#b42323;--none:#9a968a;color-scheme:light}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header,main{max-width:1080px;margin:0 auto;padding:16px}h1{font-size:28px;line-height:1.2;margin:8px 0 4px}h2{font-size:20px;margin:0 0 12px}h3{margin:0;font-size:17px}
.meta{color:var(--tx3);font-size:13px;margin:0;overflow-wrap:anywhere}
.switch{display:flex;gap:8px;margin:14px 0 0}.switch button{min-height:44px;padding:0 16px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--tx);font:inherit;cursor:pointer}.switch button[aria-pressed="true"]{background:var(--gold);border-color:var(--gold);color:#14130f;font-weight:600}
section{padding:18px 0;border-top:1px solid var(--line)}
.measures{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.measure{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-direction:column}.measure b{font-size:34px;line-height:1.1;font-variant-numeric:tabular-nums}.measure span{font-weight:600}.measure small,.rule{color:var(--tx3);font-size:13px}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;list-style:none;padding:0;margin:0 0 12px;font-size:13px;color:var(--tx2)}.legend li{display:flex;align-items:center;gap:6px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none;background:var(--none)}.s-LIVE_VERIFIED{background:var(--ok)}.s-PASS_CI_ONLY{background:var(--ci)}.s-NOT_VERIFIED{background:var(--nv)}.s-BLOCKED{background:var(--wait)}.s-FAIL{background:var(--bad)}.s-NOT_IMPLEMENTED{background:var(--none)}.s-OPTIONAL_TEST,.s-DUPLICATE,.s-UNKNOWN{background:transparent;border:1px solid var(--tx3)}
.bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--card2);gap:1px;width:100%}.bar i{display:block}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}.card{text-align:left;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;color:var(--tx);font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:6px}.card:hover,.card:focus-visible{border-color:var(--gold)}.card .num{color:var(--tx3);font-size:13px}.card .big{font-size:24px;font-variant-numeric:tabular-nums}.card small{color:var(--tx3);font-size:13px}
#detail{position:sticky;bottom:0;background:var(--card2);border:1px solid var(--gold);border-radius:10px 10px 0 0;padding:12px 14px;max-height:55vh;overflow:auto;margin:0 auto;max-width:1048px}#detail ul{list-style:none;padding:0;margin:8px 0 0}#detail li{display:grid;grid-template-columns:14px 1fr auto;gap:8px;align-items:center;padding:4px 0;font-size:14px}#detail small{color:var(--tx3);font-size:12px}.dh{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.dh button{min-width:44px;min-height:44px;background:none;border:0;color:var(--tx);font-size:18px;cursor:pointer}
.graph{width:100%;height:auto;display:block;max-width:760px;margin:0 auto}.graph line{stroke:var(--line)}.graph line.on{stroke:var(--gold)}.node{cursor:pointer}.node circle{fill:var(--card);stroke:var(--tx3)}.node:hover circle,.node:focus-visible circle{stroke:var(--gold)}.node text{text-anchor:middle;fill:var(--tx)}.nn{font-size:14px;font-weight:600}.np{font-size:11px;fill:var(--tx3)!important}
.journeys,.blockers{list-style:none;padding:0;margin:0;display:grid;gap:8px}.journey,.blockers li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}.journey>div:first-child{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.journey em{font-style:normal;font-size:13px;color:var(--ok);flex:none}.j-partial em{color:var(--wait)}.j-blocked em,.j-broken em{color:var(--bad)}.journey small,.blockers small{color:var(--tx3);font-size:13px;overflow-wrap:anywhere}.blockers span{color:var(--tx2);font-size:14px}
.chain{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:13px;color:var(--tx3)}.step{display:inline-flex;align-items:center;gap:4px}
.stages{margin:0;padding:0;list-style:none;display:grid;gap:8px}.stages li{display:flex;justify-content:space-between;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}.stages span{color:var(--tx3);flex:none}
.partial{margin:0 0 10px;padding:8px 10px;border:1px dashed var(--wait);border-radius:8px;font-size:14px;color:var(--tx2)}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}.filters input,.filters select{min-height:44px;font:inherit;font-size:16px;background:var(--card);color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:0 10px}.filters input{flex:1 1 220px}
.tg{border:1px solid var(--line);border-radius:10px;margin-bottom:8px;background:var(--card)}.tg summary{padding:10px 12px;cursor:pointer;display:grid;gap:4px;min-height:44px}.tg small{color:var(--tx3);font-size:13px}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-top:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{color:var(--tx3);font-weight:500}td .dot{margin-right:6px}.ev{min-width:220px;max-width:420px;overflow-wrap:anywhere;color:var(--tx2)}tr[hidden]{display:none}
`;

const LINE_SEPARATORS = new RegExp("[\u2028\u2029]", "g");
const safeJson = (o) =>
  JSON.stringify(o)
    .replace(/</g, "\\u003c")
    .replace(LINE_SEPARATORS, " ");

export function renderHtml(model) {
  const incomplete = Object.values(model.partial).some(Boolean);
  return `<!doctype html>
<html lang="lt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Funkcijų žemėlapis</title><style>${PAGE_CSS}</style></head><body>
<header><h1>LabourMarket.ai funkcijų žemėlapis</h1>
<p class="meta">Sugeneruota iš ${model.source.file}. Vėliausias patikrinimas registre: ${model.source.latestCheck}. Registro kontrolinė suma: ${model.source.sha256.slice(0, 12)}.${incomplete ? " Duomenys dar nepilni: kur trūksta, parašyta skiltyje." : ""}</p>
<div class="switch" role="group" aria-label="Rodinys"><button data-view="owner" aria-pressed="true">Savininkui</button><button data-view="tech" aria-pressed="false">Techninis</button></div></header>
<main id="view"></main><aside id="detail" hidden aria-live="polite"></aside>
<script type="application/json" id="data">${safeJson(model)}</script>
<script>${PAGE_JS}</script></body></html>
`;
}

export function generate(md, coordination = "") {
  return renderHtml(buildModel(md, coordination));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf("--out");
  if (i < 0 || !process.argv[i + 1]) {
    console.error("usage: node .github/scripts/function-map.mjs --out <file.html>");
    process.exit(2);
  }
  const model = buildModel(readFileSync(REGISTER_PATH, "utf8"), readFileSync(COORDINATION_PATH, "utf8"));
  if (model.unknownIds.length) console.warn(`function-map: ids not in the register: ${model.unknownIds.join(", ")}`);
  if (model.unknownNeeds.length) console.warn(`function-map: unknown needs: ${model.unknownNeeds.join(", ")}`);
  writeFileSync(process.argv[i + 1], renderHtml(model));
  console.log(
    `function-map: ${process.argv[i + 1]} — ${model.counts.total} functions, ${model.counts.verified} verified, ${model.journeyTotals.complete}/${model.journeyTotals.total} journeys`,
  );
}
