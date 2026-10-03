import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ACTOR_ONLY_RELATIONS,
  CHILD_TABLES_NOT_EXPORTED,
  EXPORTED_RELATIONS,
  NON_PRODUCT_RELATIONS,
  ROOT_RELATIONS,
  WITHHELD_RELATIONS,
} from "@/lib/privacy/personal-relations";

/**
 * PER-12 — A SUBJECT-ACCESS BUNDLE MAY NOT LIE BY OMISSION.
 *
 * THE DEFECT, MEASURED (production, 2026-09-14). 60 public tables carry a
 * `profile_id` or a `worker_id`. The export read SIX and named four things as
 * deliberately excluded — so roughly thirty relations were neither delivered
 * nor mentioned, while the bundle's shape invited the reader to conclude that
 * anything unmentioned was included.
 *
 * WHAT THIS GUARD DOES. It derives the set of person-keyed tables from the
 * MIGRATIONS — the checked-in schema, not a remembered list — and requires
 * each one to be exported, withheld with a reason, a root relation, or
 * declared not-a-product-relation. A new table with a `profile_id` fails this
 * guard the day its migration lands, which is the only moment the decision is
 * cheap to make.
 *
 * WHAT IT DOES NOT CLAIM. It does not prove the reads succeed against a real
 * database — CI deliberately has none (GOV-3). `lib/privacy/export-data.test.ts`
 * drives the exporter itself for the failed-read-is-not-absence property.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");

/**
 * Person-keyed tables, read out of the create-table statements — and the
 * COLUMNS that key them.
 *
 * THE SECOND DEFECT, MEASURED (2026-09-19). The first sweep counted a table
 * only when its body literally said `profile_id` or `worker_id`. A hundred-odd
 * tables key the person through `recipient_profile_id`, `user_id`,
 * `subject_profile_id`, `owner_id`, `confirmer_id`, `created_by`, … and were
 * invisible to the guard by construction — so the guard passed while the
 * bundle omitted the person's notifications, consent ledger, disclosures, the
 * experience records written about them and their own billing rows. A guard
 * that cannot see a class of table cannot protect against it.
 *
 * Now a column counts when it REFERENCES `public.profiles`, `public.workers`
 * or `auth.users`, or is an e-mail / phone column. Each column is further
 * classed as SUBJECT (the row is about, for, or by the person as a party) or
 * ACTOR (the row records that the person performed an action on something
 * else — `created_by`, `actor_id`, `reviewed_by`). A table whose person
 * columns are ALL actor columns may be declared actor-only; any table with a
 * subject column must be exported, withheld with a reason, or a root.
 */
const ACTOR_COLUMN = /(_by|_by_profile_id)$|^(actor_id|actor_profile_id|reviewer_id|reporter_id|assigned_to|canonical_person_link|supplied_by_profile_id|imported_by_profile_id)$/;

type PersonColumn = { readonly name: string; readonly actor: boolean };

function personKeyedTablesFromMigrations(): Map<string, PersonColumn[]> {
  const found = new Map<string, PersonColumn[]>();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    // `create table [if not exists] public.<name> ( … );` — non-greedy to the
    // first `\n);` so one statement never swallows the next.
    const re =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const [, table, body] = m;
      const cols: PersonColumn[] = [];
      // One declaration per chunk. A column may continue onto deeper-indented
      // lines (`recipient_profile_id uuid not null\n    references public.profiles`),
      // so the body is split where a line starts a new declaration at the
      // column indent, and comment lines are dropped first.
      const clean = body
        .split("\n")
        .filter((line) => !/^\s*--/.test(line))
        .join("\n");
      // Column indent = the indent of the first declaration; deeper-indented
      // lines are continuations of the declaration above them.
      const indent = clean.match(/^\n?([ \t]+)\S/)?.[1] ?? "  ";
      const declarations = clean.split(
        new RegExp(`\\n(?=${indent}(?![ \\t])[a-z0-9_]+\\s)`, "i"),
      );
      for (const decl of declarations) {
        const head = decl.match(/^\s*([a-z0-9_]+)\s+([a-z]+)/i);
        if (!head) continue;
        const [, name, type] = head;
        if (/^(constraint|unique|primary|foreign|check|exclude)$/i.test(name)) continue;
        const refs = /references\s+(?:public\.profiles|public\.workers|auth\.users)\b/i.test(decl);
        const legacy = /^(profile_id|worker_id)$/i.test(name) && /^uuid$/i.test(type);
        const contact =
          /^(email|phone|contact_email|contact_phone)$/i.test(name) && /^text$/i.test(type);
        if (!refs && !legacy && !contact) continue;
        // `profiles.id` references auth.users: the root, not a person key.
        if (table === "profiles" && name === "id") continue;
        cols.push({ name, actor: ACTOR_COLUMN.test(name) });
      }
      if (cols.length === 0) continue;
      const prev = found.get(table) ?? [];
      const merged = [...prev];
      for (const c of cols) if (!merged.some((x) => x.name === c.name)) merged.push(c);
      found.set(table, merged);
    }
  }
  return found;
}

/**
 * PER-12 (2026-10-03): person columns added AFTER the create-table (`alter
 * table public.x add column [if not exists] col uuid references
 * public.profiles(id)`) were invisible to the sweep above: `projects` has
 * carried `responsible_profile_id` since 20260817152000 and no guard knew.
 * Parsed here with the same reference rule and merged into the sweep.
 */
function alterAddedPersonColumns(): Map<string, PersonColumn[]> {
  const found = new Map<string, PersonColumn[]>();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const re =
    /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.([a-z0-9_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+uuid([^;,]*)/gi;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8")
      .split("\n")
      .filter((l) => !/^\s*--/.test(l))
      .join("\n");
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const [, table, name, rest] = m;
      if (!/references\s+(?:public\.profiles|public\.workers|auth\.users)/i.test(rest)) continue;
      const prev = found.get(table) ?? [];
      if (!prev.some((c) => c.name === name)) prev.push({ name, actor: ACTOR_COLUMN.test(name) });
      found.set(table, prev);
    }
  }
  return found;
}

/** Every column of every table, and the parent tables each column points at. */
function tableShapes(): Map<string, { columns: Set<string>; parents: Map<string, string> }> {
  const out = new Map<string, { columns: Set<string>; parents: Map<string, string> }>();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    const re =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const [, table, body] = m;
      const shape = out.get(table) ?? { columns: new Set<string>(), parents: new Map<string, string>() };
      for (const line of body.split("\n")) {
        if (/^\s*--/.test(line)) continue;
        const col = line.match(/^\s{1,4}([a-z0-9_]+)\s+[a-z]/i);
        if (!col || /^(constraint|unique|primary|foreign|check|exclude)$/i.test(col[1])) continue;
        shape.columns.add(col[1]);
      }
      // Single-column FKs (the `references` may sit on the next line) and
      // composite `foreign key (a, b) references public.t (...)` constraints.
      const single = /\b([a-z0-9_]+)\s+uuid\b[^,]*?references\s+public\.([a-z0-9_]+)/gi;
      let fk: RegExpExecArray | null;
      while ((fk = single.exec(body)) !== null) shape.parents.set(fk[1], fk[2]);
      const composite = /foreign\s+key\s*\(([^)]*)\)\s*references\s+public\.([a-z0-9_]+)/gi;
      while ((fk = composite.exec(body)) !== null) {
        for (const c of fk[1].split(",")) shape.parents.set(c.trim(), fk[2]);
      }
      out.set(table, shape);
    }
  }
  return out;
}

const SUBJECT_CLASSIFIED = new Set<string>([
  ...EXPORTED_RELATIONS.map((r) => r.table),
  ...WITHHELD_RELATIONS.map((r) => r.table),
  ...NON_PRODUCT_RELATIONS,
  ...ROOT_RELATIONS,
]);
const CLASSIFIED = new Set<string>([...SUBJECT_CLASSIFIED, ...ACTOR_ONLY_RELATIONS]);

/**
 * Exported tables whose children can be ABOUT the person. `projects` and
 * `organizations` are exported only because the person is named responsible
 * for / owns one; their children (budgets, stages, facts, templates) are the
 * organization's records, and exporting them would hand over the organization,
 * not the person. They are therefore not parents for the child sweep.
 */
const ORGANIZATION_RECORD_PARENTS = new Set(["projects", "organizations"]);
function personParentTables(): Set<string> {
  return new Set(
    EXPORTED_RELATIONS.map((r) => r.table).filter((t) => !ORGANIZATION_RECORD_PARENTS.has(t)),
  );
}

describe("every person-keyed relation is classified", () => {
  const discovered = personKeyedTablesFromMigrations();
  for (const [table, cols] of alterAddedPersonColumns()) {
    const prev = discovered.get(table) ?? [];
    for (const c of cols) if (!prev.some((x) => x.name === c.name)) prev.push(c);
    discovered.set(table, prev);
  }

  it("the migration sweep finds the schema at all", () => {
    // A broken regex would make every assertion below vacuously pass.
    expect(discovered.size).toBeGreaterThan(100);
    for (const anchor of [
      "journal_entries",
      "worker_skills",
      "consents",
      // The four the first sweep could not see — each keys the person through
      // a column it did not recognise. If the sweep stops seeing them, the
      // guard has regressed to the 2026-09-14 blind spot.
      "notification_events",
      "privacy_consent_events",
      "experience_records",
      "journal_entry_confirmations",
    ]) {
      expect([...discovered.keys()], `sweep missed ${anchor}`).toContain(anchor);
    }
    expect(discovered.get("notification_events")?.map((c) => c.name)).toContain(
      "recipient_profile_id",
    );
    expect(discovered.get("audit_logs")?.every((c) => c.actor)).toBe(true);
  });

  it("no person-keyed table is silently absent from the export register", () => {
    const unclassified = [...discovered.keys()].filter((t) => !CLASSIFIED.has(t)).sort();
    expect(
      unclassified,
      "these tables hold rows keyed to a person and are neither exported, nor " +
        "withheld with a reason, nor declared non-product or actor-only. A " +
        "subject-access bundle that omits them without saying so tells the " +
        "person something false about itself — classify each in " +
        "lib/privacy/personal-relations.ts",
    ).toEqual([]);
  });

  it("a table with a SUBJECT column may not hide in the actor-only class", () => {
    const wrong = ACTOR_ONLY_RELATIONS.filter((t) => {
      const cols = discovered.get(t);
      return !cols || cols.some((c) => !c.actor);
    }).sort();
    expect(
      wrong,
      "each of these carries a column that names the person as a party to the " +
        "row, not merely as the actor — export it or withhold it with a reason",
    ).toEqual([]);
  });

  const CHAINED_KEYS = ["organization_person_id", "organization_evidence_record_id", "parent_row"];

  it("every exported relation names a column that really exists on that table", () => {
    // A typo in `column` would make the exporter read nothing and report the
    // relation as empty: exactly the lie this register exists to prevent.
    const bad = EXPORTED_RELATIONS.filter((r) => {
      if (CHAINED_KEYS.includes(r.key)) return false; // chained keys, checked below
      const cols = discovered.get(r.table)?.map((c) => c.name) ?? [];
      return !cols.includes(r.column ?? r.key);
    }).map((r) => `${r.table}.${r.column ?? r.key}`);
    expect(bad, "exported column not found in any create-table body").toEqual([]);
  });

  it("chained keys point at the tables that carry them", () => {
    const chained = EXPORTED_RELATIONS.filter(
      (r) => r.key === "organization_person_id" || r.key === "organization_evidence_record_id",
    );
    expect(chained.map((r) => r.table).sort()).toEqual([
      "evidence_import_rows",
      "organization_evidence_events",
      "organization_evidence_records",
    ]);
    const sql = readdirSync(MIGRATIONS)
      .filter((f) => f.includes("organization_evidence_import_v1"))
      .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
      .join("\n");
    expect(sql).toMatch(/organization_evidence_records[\s\S]*organization_person_id\s+uuid/);
    expect(sql).toMatch(/organization_evidence_events[\s\S]*record_id\s+uuid/);
    expect(sql).toMatch(/evidence_import_rows[\s\S]*organization_person_id\s+uuid/);
  });

  it("PER-12: every parent_row child names a delivered parent and a real FK column", () => {
    const shapes = tableShapes();
    const byBundleKey = new Map(EXPORTED_RELATIONS.map((r) => [r.as ?? r.table, r]));
    const children = EXPORTED_RELATIONS.filter((r) => r.key === "parent_row");
    expect(children.length).toBeGreaterThanOrEqual(20);
    const problems: string[] = [];
    for (const c of children) {
      const parent = c.parent ? byBundleKey.get(c.parent) : undefined;
      if (!parent) {
        problems.push(`${c.table}: parent bundle key ${c.parent} is not exported`);
        continue;
      }
      const col = c.column;
      const fk = col ? shapes.get(c.table)?.parents.get(col) : undefined;
      if (fk !== parent.table) {
        problems.push(`${c.table}.${col} references ${fk ?? "nothing"}, not ${parent.table}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("PER-12: a redaction names columns that exist on that table", () => {
    const shapes = tableShapes();
    const bad: string[] = [];
    for (const r of EXPORTED_RELATIONS) {
      for (const col of [...(r.redactActors ?? []), ...(r.omitColumns ?? [])]) {
        const cols = shapes.get(r.table)?.columns;
        // `projects` was created in 0001 and widened by later alters; its
        // created_by / owner_id entries are hedges, applied only if present.
        if (cols && !cols.has(col) && r.table !== "projects") bad.push(`${r.table}.${col}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("PER-12: no table whose rows hang off an exported row is silently unexported", () => {
    // THE BLIND SPOT THIS CLOSES. The sweep finds person columns. A child
    // table with only a parent id has none, and several with only an ACTOR
    // column were parked as actor-only, so rows ABOUT the person (their
    // booking's events, their journal entry's metrics) were neither exported
    // nor named. Every table with an FK to an exported table's id must be
    // exported, withheld, or reviewed with a reason in CHILD_TABLES_NOT_EXPORTED.
    const shapes = tableShapes();
    const exportedTables = personParentTables();
    const reviewed = new Map(CHILD_TABLES_NOT_EXPORTED.map((c) => [c.table, c]));
    const unaccounted: string[] = [];
    for (const [table, shape] of shapes) {
      if (SUBJECT_CLASSIFIED.has(table)) continue;
      const parentsHit = [...shape.parents.values()].filter((p) => exportedTables.has(p));
      if (parentsHit.length === 0) continue;
      if (reviewed.has(table)) continue;
      unaccounted.push(`${table} (child of ${[...new Set(parentsHit)].join(", ")})`);
    }
    expect(
      unaccounted.sort(),
      "these tables hang off an exported parent and are neither exported, withheld nor reviewed",
    ).toEqual([]);
  });

  it("PER-12: nothing reviewed-as-not-exported is also exported, and every review gives a reason", () => {
    const exported = new Set(EXPORTED_RELATIONS.map((r) => r.table));
    const shapes = tableShapes();
    for (const c of CHILD_TABLES_NOT_EXPORTED) {
      expect(exported.has(c.table), `${c.table} is both exported and reviewed-away`).toBe(false);
      expect(c.reason.length, `${c.table} needs a real reason`).toBeGreaterThan(20);
      expect(shapes.has(c.table), `${c.table} is not a table in the migrations`).toBe(true);
    }
  });

  it("PER-12: an actor-only table with a parent chain is not hiding rows about the person", () => {
    const shapes = tableShapes();
    const exportedTables = personParentTables();
    const reviewed = new Set(CHILD_TABLES_NOT_EXPORTED.map((c) => c.table));
    const hiding = ACTOR_ONLY_RELATIONS.filter((t) => {
      const parents = [...(shapes.get(t)?.parents.values() ?? [])];
      return parents.some((p) => exportedTables.has(p)) && !reviewed.has(t);
    });
    expect(
      hiding,
      "actor-only tables that hang off an exported parent must be exported (chained) or reviewed with a reason",
    ).toEqual([]);
  });

  it("bundle keys are unique — two reads of one table never overwrite each other", () => {
    const keys = EXPORTED_RELATIONS.map((r) => r.as ?? r.table);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  it("the register names no table that the schema does not have", () => {
    // Guards rot the other way too: a withheld entry for a table that no
    // longer exists is a reason nobody will ever act on.
    // ROOT_RELATIONS are exempt: `profiles` is keyed by `id`, not by a person
    // column, so the sweep cannot see it by construction.
    const roots = new Set(ROOT_RELATIONS);
    // Chained children carry no person column by design (PER-12): their
    // existence and FK are verified by the parent_row test instead.
    const chainedTables = new Set(
      EXPORTED_RELATIONS.filter((r) =>
        ["organization_person_id", "organization_evidence_record_id", "parent_row"].includes(r.key),
      ).map((r) => r.table),
    );
    const ghosts = [...CLASSIFIED]
      .filter((t) => !discovered.has(t) && !roots.has(t) && !chainedTables.has(t))
      .sort();
    expect(
      ghosts,
      "classified but not present as a person-keyed table in any migration",
    ).toEqual([]);
  });
});

describe("withholding is always explained", () => {
  it("every withheld relation carries a real reason", () => {
    for (const w of WITHHELD_RELATIONS) {
      expect(w.reason.length, `${w.table} needs a real reason`).toBeGreaterThan(30);
      // The reason travels to the person, so it must read as an explanation,
      // not as a category label.
      expect(w.reason, `${w.table}'s reason is not a sentence`).toMatch(/\s/);
    }
  });

  it("nothing is both exported and withheld", () => {
    const exported = new Set(EXPORTED_RELATIONS.map((r) => r.table));
    const both = WITHHELD_RELATIONS.map((w) => w.table).filter((t) => exported.has(t));
    expect(both, "a relation cannot be both delivered and withheld").toEqual([]);
  });

  it("the reasons reach the bundle, not just this file", () => {
    const src = readFileSync(
      join(__dirname, "..", "privacy", "export-data.ts"),
      "utf8",
    );
    expect(src).toMatch(/withheld:/);
    expect(src).toMatch(/WITHHELD_RELATIONS/);
    expect(src).toMatch(/reason: w\.reason/);
  });
});

describe("the export grew, and can be seen to have grown", () => {
  it("covers far more than the six relations it started with", () => {
    expect(EXPORTED_RELATIONS.length).toBeGreaterThan(20);
  });

  it("still reads as the person — no service role anywhere in the path", () => {
    for (const rel of ["privacy/export-data.ts", "privacy/personal-relations.ts"]) {
      const src = readFileSync(join(__dirname, "..", rel), "utf8");
      expect(src, `${rel} must not reach for a service-role client`).not.toMatch(
        /service_role|SERVICE_ROLE|createAdminClient|serviceClient/,
      );
    }
  });

  it("every exported relation declares which person column joins it", () => {
    for (const r of EXPORTED_RELATIONS) {
      expect([
        "profile_id",
        "worker_id",
        "organization_person_id",
        "organization_evidence_record_id",
        "parent_row",
      ]).toContain(r.key);
    }
  });
});
