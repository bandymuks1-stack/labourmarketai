#!/usr/bin/env node
// ESCO v1.2.x CSV importer (S2 / esco-taxonomy-foundation).
// Design: docs/product/esco-taxonomy-design.md §7.
//
// Modes:
//   node scripts/esco/import-esco.mjs --dir data/esco --dry-run
//   node scripts/esco/import-esco.mjs --dir data/esco --apply
//
// --dry-run: parse + validate + report counts and language gaps. NO DB.
// --apply:   idempotent upserts into esco_occupations / esco_skills /
//            esco_occupation_skills / esco_labels. Requires SUPABASE_URL +
//            SUPABASE_SERVICE_ROLE_KEY in the environment AT RUN TIME ONLY
//            (never stored in the repo) and the S2 draft migrations applied
//            (via MCP apply_migration, owner-gated). Re-running with a newer
//            ESCO version updates in place (upsert keys: esco_uri / unique
//            label tuple / relation pair).
//
// Attribution (EU licence, mandatory): this service uses the ESCO
// classification of the European Commission.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

export const ESCO_ATTRIBUTION =
  "This service uses the ESCO classification of the European Commission.";

// ALL 28 official ESCO v1.2.1 languages (owner decision 2026-06-10) — the
// esco_labels locale CHECK is widened to this exact set by migration
// 20260610230000. Russian is NOT an official ESCO language (RU practical
// aliases are a separate curated layer, never esco_labels).
export const LOCALES = [
  "ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "ga",
  "hr", "hu", "is", "it", "lt", "lv", "mt", "nl", "no", "pl", "pt", "ro",
  "sk", "sl", "sv", "uk",
];

// ── tiny RFC-4180-ish CSV parser (quoted fields, embedded newlines) ───────
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return { header: [], records: [] };
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, idx) => { o[h] = (r[idx] ?? "").trim(); });
    return o;
  });
  return { header, records };
}

function findFile(dir, names) {
  const files = readdirSync(dir);
  for (const want of names) {
    const hit = files.find((f) => f.toLowerCase() === want.toLowerCase());
    if (hit) return resolve(dir, hit);
  }
  return null;
}

/** Collect per-locale occupation/skill files + the relations file. */
export function discover(dir) {
  const plan = { occupations: {}, skills: {}, relations: null, gaps: [] };
  for (const loc of LOCALES) {
    const occ = findFile(dir, [`occupations_${loc}.csv`]);
    const skl = findFile(dir, [`skills_${loc}.csv`]);
    if (occ) plan.occupations[loc] = occ; else plan.gaps.push(`occupations_${loc}.csv missing`);
    if (skl) plan.skills[loc] = skl; else plan.gaps.push(`skills_${loc}.csv missing`);
  }
  plan.relations = findFile(dir, [
    "occupationSkillRelations.csv",
    "occupationSkillRelations_en.csv",
  ]);
  if (!plan.relations) plan.gaps.push("occupationSkillRelations*.csv missing");
  return plan;
}

const ALT_SEP = /\r?\n|\|/; // ESCO altLabels are newline-separated inside the cell

export function extractConcepts(records, kind) {
  // kind: 'occupation' | 'skill'. Returns { concepts: Map(uri→meta), labels: [] }
  const concepts = new Map();
  const labels = [];
  for (const r of records) {
    const uri = r.conceptUri || r.uri;
    if (!uri) continue;
    if (!concepts.has(uri)) {
      concepts.set(uri, kind === "occupation"
        ? { esco_uri: uri, isco_group: r.iscoGroup || null }
        : { esco_uri: uri, skill_type: normSkillType(r.skillType), reuse_level: r.reuseLevel || null });
    }
    if (r.preferredLabel) {
      labels.push({ uri, label: r.preferredLabel, label_type: "preferred" });
    }
    for (const alt of (r.altLabels || "").split(ALT_SEP)) {
      const a = alt.trim();
      if (a) labels.push({ uri, label: a.slice(0, 400), label_type: "alternative" });
    }
    for (const hid of (r.hiddenLabels || "").split(ALT_SEP)) {
      const h = hid.trim();
      if (h) labels.push({ uri, label: h.slice(0, 400), label_type: "hidden" });
    }
  }
  return { concepts, labels };
}

function normSkillType(v) {
  const s = (v || "").toLowerCase();
  if (s.includes("knowledge")) return "knowledge";
  if (s.includes("language")) return "language";
  if (s.includes("competence")) return "competence";
  if (s.includes("skill")) return "skill";
  return null;
}

// ── Deterministic label dedupe (fix: "ON CONFLICT DO UPDATE command cannot
//    affect row a second time" — a single upsert batch may not contain the
//    same conflict key twice). DB unique key: (concept_type, concept_id,
//    locale, label, label_type). Two deterministic passes, stable order:
//      1. exact-key dedupe — keep the FIRST occurrence;
//      2. same text under several label_types for one (kind,uri,locale) —
//         keep only the best-ranked type (preferred > alternative > hidden).
//    Pure transform of the in-memory rows; NO schema change, NO deletes of
//    existing DB rows. Returns dropped counts per locale for the report.
const TYPE_RANK = { preferred: 0, alternative: 1, hidden: 2 };

export function dedupeLabelRows(labelRows) {
  const droppedByLocale = new Map(); // locale -> { exact, crossType }
  const bump = (locale, kind) => {
    const d = droppedByLocale.get(locale) ?? { exact: 0, crossType: 0 };
    d[kind] += 1;
    droppedByLocale.set(locale, d);
  };

  // Pass 1 — exact unique key, first stable occurrence wins.
  const byKey = new Map();
  for (const r of labelRows) {
    const key = `${r.kind}${r.uri}${r.locale}${r.label}${r.label_type}`;
    if (byKey.has(key)) bump(r.locale, "exact");
    else byKey.set(key, r);
  }

  // Pass 2 — same text in several label_types: best rank wins.
  const bestByText = new Map();
  for (const r of byKey.values()) {
    const tkey = `${r.kind}${r.uri}${r.locale}${r.label}`;
    const cur = bestByText.get(tkey);
    if (!cur || TYPE_RANK[r.label_type] < TYPE_RANK[cur.label_type]) {
      bestByText.set(tkey, r);
    }
  }
  const rows = [];
  for (const r of byKey.values()) {
    if (bestByText.get(`${r.kind}${r.uri}${r.locale}${r.label}`) === r) {
      rows.push(r);
    } else {
      bump(r.locale, "crossType");
    }
  }
  return { rows, droppedByLocale };
}

// Relations pair dedupe (same batch-collision class; DB key:
// occupation_id,skill_id). Deterministic winner: 'essential' over
// 'optional', else first stable occurrence.
export function dedupeRelations(relations) {
  const byPair = new Map();
  let dropped = 0;
  for (const r of relations) {
    const key = `${r.occupationUri}${r.skillUri}`;
    const cur = byPair.get(key);
    if (!cur) byPair.set(key, r);
    else {
      dropped += 1;
      if (cur.relation_type === "optional" && r.relation_type === "essential") {
        byPair.set(key, r);
      }
    }
  }
  return { rows: [...byPair.values()], dropped };
}

async function main() {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  const dir = dirIdx !== -1 ? resolve(args[dirIdx + 1]) : null;
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  if (!dir || !existsSync(dir) || (!dryRun && !apply)) {
    console.error("Usage: import-esco.mjs --dir <csv-dir> (--dry-run | --apply)");
    process.exit(2);
  }
  console.log(ESCO_ATTRIBUTION);
  const plan = discover(dir);

  const occByUri = new Map();
  const sklByUri = new Map();
  const labelRows = []; // { kind, uri, locale, label, label_type }
  for (const [loc, file] of Object.entries(plan.occupations)) {
    const { records } = parseCsv(readFileSync(file, "utf8"));
    const { concepts, labels } = extractConcepts(records, "occupation");
    for (const [uri, meta] of concepts) if (!occByUri.has(uri)) occByUri.set(uri, meta);
    for (const l of labels) labelRows.push({ kind: "occupation", uri: l.uri, locale: loc, label: l.label, label_type: l.label_type });
    console.log(`occupations_${loc}: ${concepts.size} concepts, ${labels.length} labels`);
  }
  for (const [loc, file] of Object.entries(plan.skills)) {
    const { records } = parseCsv(readFileSync(file, "utf8"));
    const { concepts, labels } = extractConcepts(records, "skill");
    for (const [uri, meta] of concepts) if (!sklByUri.has(uri)) sklByUri.set(uri, meta);
    for (const l of labels) labelRows.push({ kind: "skill", uri: l.uri, locale: loc, label: l.label, label_type: l.label_type });
    console.log(`skills_${loc}: ${concepts.size} concepts, ${labels.length} labels`);
  }
  let relations = [];
  if (plan.relations) {
    const { records } = parseCsv(readFileSync(plan.relations, "utf8"));
    relations = records
      .filter((r) => (r.occupationUri || r.occupationURI) && (r.skillUri || r.skillURI))
      .map((r) => ({
        occupationUri: r.occupationUri || r.occupationURI,
        skillUri: r.skillUri || r.skillURI,
        relation_type: (r.relationType || "essential").toLowerCase() === "optional" ? "optional" : "essential",
      }));
    console.log(`relations: ${relations.length}`);
  }

  // Deterministic dedupe before any upsert (and reported in dry-run too).
  const { rows: labelRowsDeduped, droppedByLocale } = dedupeLabelRows(labelRows);
  const { rows: relationsDeduped, dropped: relDropped } = dedupeRelations(relations);
  if (droppedByLocale.size > 0) {
    console.log(`\nDUPLICATE LABELS DROPPED (deterministic: exact-key first occurrence; preferred > alternative > hidden):`);
    let totalDropped = 0;
    for (const [loc, d] of [...droppedByLocale.entries()].sort()) {
      console.log(`  ${loc}: ${d.exact} exact-key + ${d.crossType} cross-type = ${d.exact + d.crossType}`);
      totalDropped += d.exact + d.crossType;
    }
    console.log(`  total dropped: ${totalDropped}; labels remaining: ${labelRowsDeduped.length}`);
  }
  if (relDropped > 0) {
    console.log(`DUPLICATE RELATION PAIRS DROPPED: ${relDropped} (essential preferred); remaining: ${relationsDeduped.length}`);
  }

  console.log(`\nTOTAL: ${occByUri.size} occupations, ${sklByUri.size} skills, ${labelRowsDeduped.length} labels (${labelRows.length} raw), ${relationsDeduped.length} relations (${relations.length} raw)`);
  if (plan.gaps.length > 0) {
    console.log(`LANGUAGE GAPS (no home-made translations are created — handoff rule):`);
    for (const g of plan.gaps) console.log(`  - ${g}`);
  }
  if (dryRun) { console.log("\ndry-run complete — no DB touched."); return; }

  // ── apply ────────────────────────────────────────────────────────────────
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("apply mode needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment (run-time only).");
    process.exit(2);
  }
  const require = createRequire(resolve("apps/web/package.json"));
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });

  async function upsertBatched(table, rows, onConflict) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
      if (error) throw new Error(`${table} upsert failed at batch ${i / 500}: ${error.message}`);
    }
    console.log(`${table}: upserted ${rows.length}`);
  }

  await upsertBatched("esco_occupations", [...occByUri.values()], "esco_uri");
  await upsertBatched("esco_skills", [...sklByUri.values()], "esco_uri");

  // Paginated id-map fetch — PostgREST caps a select at 1000 rows, so a
  // plain select would silently truncate the uri→id map and the label
  // filter below would silently drop most rows (dishonest import).
  async function fetchIdMap(table) {
    const map = new Map();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from(table)
        .select("id, esco_uri")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${table} id fetch failed: ${error.message}`);
      for (const r of data ?? []) map.set(r.esco_uri, r.id);
      if (!data || data.length < PAGE) break;
    }
    return map;
  }
  const occId = await fetchIdMap("esco_occupations");
  const sklId = await fetchIdMap("esco_skills");
  console.log(`id maps: ${occId.size} occupations, ${sklId.size} skills`);

  const labelUpserts = labelRowsDeduped
    .map((l) => ({
      concept_type: l.kind,
      concept_id: l.kind === "occupation" ? occId.get(l.uri) : sklId.get(l.uri),
      locale: l.locale,
      label: l.label,
      label_type: l.label_type,
    }))
    .filter((l) => l.concept_id);
  if (labelUpserts.length < labelRowsDeduped.length) {
    console.log(`labels without a resolved concept id (skipped, reported honestly): ${labelRowsDeduped.length - labelUpserts.length}`);
  }
  await upsertBatched("esco_labels", labelUpserts, "concept_type,concept_id,locale,label,label_type");

  const relUpserts = relationsDeduped
    .map((r) => ({
      occupation_id: occId.get(r.occupationUri),
      skill_id: sklId.get(r.skillUri),
      relation_type: r.relation_type,
    }))
    .filter((r) => r.occupation_id && r.skill_id);
  if (relUpserts.length < relationsDeduped.length) {
    console.log(`relations without resolved ids (skipped, reported honestly): ${relationsDeduped.length - relUpserts.length}`);
  }
  await upsertBatched("esco_occupation_skills", relUpserts, "occupation_id,skill_id");

  console.log("\napply complete (idempotent — re-run safe for ESCO version updates).");
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].split(/[\\/]/).pop(),
);
if (invokedDirectly) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
