import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * THE EVIDENCE STORE PORT — historical timesheet import design v3, PR-2.
 *
 * `import-core.ts` used to talk to PostgREST inline, so the only way to run
 * the SHIPPED import orchestration was against a live database. PR-2 put one
 * port between the orchestration and the data plane:
 *
 *   lib/organization-evidence/evidence-store.ts        the port + production
 *   lib/organization-evidence/testing/memory-store.ts  the in-memory adapter
 *                                                      the synthetic fixture
 *                                                      runs on (TEST-ONLY)
 *
 * What this guard keeps true:
 *
 *   1. The test-only adapter never reaches a production import. It models
 *      the tables without RLS; a route, action or component importing it
 *      would be a second, unguarded data plane.
 *   2. The orchestration writes the five evidence tables ONLY through the
 *      port. An inline `.from("evidence_import_rows").update(` in
 *      `import-core.ts` would write around the port's committed-row
 *      refusal (design §8 P3u) and around the fixture that proves it.
 *   3. The port itself has no update and no delete for records or record
 *      events — the evidence family is append-only, and the port makes that
 *      a type, not a convention.
 *   4. The production adapter's two staging writers carry their guards in
 *      the statement: `updateStagedRow` never touches a committed row, and
 *      `commitStagedRow` sets the final state and `committed` in ONE update
 *      of a row that is still `ready`.
 *
 * Every detector below is run against a PLANTED offender first, so a guard
 * that silently stopped matching would fail here, not go quiet.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8").replace(/\r\n/g, "\n");

const CORE = "lib/organization-evidence/import-core.ts";
const PORT = "lib/organization-evidence/evidence-store.ts";
const MEMORY = "lib/organization-evidence/testing/memory-store.ts";

const EVIDENCE_TABLES = [
  "evidence_import_sessions",
  "evidence_import_events",
  "evidence_import_rows",
  "organization_evidence_records",
  "organization_evidence_events",
] as const;

/** Files under `dir` (recursively) that are neither tests nor fixtures. */
function productionSources(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === ".turbo" || entry === "__fixtures__") continue;
    const p = join(dir, entry);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) productionSources(p, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

/** Does this source import the test-only adapter? */
function importsMemoryStore(src: string): boolean {
  return /from\s+["'][^"']*(?:organization-evidence\/)?testing\/memory-store["']/.test(src);
}

/** Every inline write statement to an evidence table in one source. */
function inlineEvidenceWrites(src: string): string[] {
  const hits: string[] = [];
  const rx = new RegExp(
    `\\.from\\(\\s*["'](${EVIDENCE_TABLES.join("|")})["']\\s*\\)[\\s\\S]{0,200}?\\.(insert|upsert|update|delete)\\(`,
    "g",
  );
  for (const m of src.matchAll(rx)) hits.push(`${m[1]}.${m[2]}`);
  return hits;
}

describe("1. the in-memory adapter is test-only", () => {
  it("ANTI-VACUITY: the detector fires on a planted import", () => {
    expect(importsMemoryStore('import { MemoryEvidenceDb } from "@/lib/organization-evidence/testing/memory-store";')).toBe(true);
    expect(importsMemoryStore('import { MemoryEvidenceDb } from "./testing/memory-store";')).toBe(true);
    expect(importsMemoryStore('import { supabaseEvidenceStore } from "./evidence-store";')).toBe(false);
  });

  it("nothing that ships imports it — only tests and the fixture may", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of productionSources(join(WEB, dir))) {
        const rel = file.slice(WEB.length + 1).replace(/\\/g, "/");
        if (rel === MEMORY) continue;
        if (importsMemoryStore(readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders, `the test-only evidence store reached production code:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the adapter is the data plane the SHIPPED orchestration runs on — no mock of a core function", () => {
    const memory = read(MEMORY);
    expect(memory).toMatch(/implements|: EvidenceStore \{|\): EvidenceStore \{/);
    expect(memory).not.toMatch(/vi\.mock\(|vi\.fn\(|jest\./);
    // It keeps the guarantees the orchestration relies on.
    expect(memory).toMatch(/committedWriteAttempts \+= 1/);
    expect(memory).toMatch(/ON CONFLICT \(session_id, row_index\) DO NOTHING/);
    expect(memory).toMatch(/ON CONFLICT \(organization_id, record_fingerprint\) DO NOTHING/);
  });
});

describe("2. the orchestration writes the evidence tables only through the port", () => {
  it("ANTI-VACUITY: the detector fires on a planted inline write", () => {
    const planted = `
      const upd = await db(caller.supabase)
        .from("evidence_import_rows")
        .update({ status: "committed" })
        .eq("id", id);`;
    expect(inlineEvidenceWrites(planted)).toEqual(["evidence_import_rows.update"]);
    expect(inlineEvidenceWrites('db().from("evidence_import_rows").select("id")')).toEqual([]);
  });

  it("import-core.ts has no inline write to any evidence table", () => {
    expect(inlineEvidenceWrites(read(CORE))).toEqual([]);
  });

  it("every evidence-table write the production adapter performs is a port method", () => {
    const port = read(PORT);
    const writes = inlineEvidenceWrites(port);
    expect(writes.length).toBeGreaterThan(0);
    // Sessions, staging, records, record events and the import trail are
    // written; nothing is deleted anywhere.
    expect(writes).toEqual(expect.arrayContaining([
      "evidence_import_sessions.insert",
      "evidence_import_events.insert",
      "evidence_import_rows.upsert",
      "evidence_import_rows.update",
      "organization_evidence_records.upsert",
      "organization_evidence_events.insert",
    ]));
    expect(writes.some((w) => w.endsWith(".delete"))).toBe(false);
  });
});

describe("3. the port is append-only for records and their events", () => {
  it("declares no update or delete for records or record events", () => {
    const port = read(PORT);
    const iface = port.slice(port.indexOf("export interface EvidenceStore {"), port.indexOf("export type EvidenceCaller"));
    expect(iface).toMatch(/insertRecords\(/);
    expect(iface).toMatch(/insertRecordEvents\(/);
    expect(iface).not.toMatch(/\b(update|delete|remove|patch)Record/);
    expect(iface).not.toMatch(/\b(update|delete|remove)RecordEvent/);
    expect(iface).not.toMatch(/deleteStagedRow|deleteSession/);
  });
});

describe("4. the two staging writers carry their guards in the statement", () => {
  it("updateStagedRow never touches a committed row", () => {
    const port = read(PORT);
    const upd = port.slice(port.indexOf("async updateStagedRow("), port.indexOf("async commitStagedRow("));
    expect(upd).toMatch(/\.from\("evidence_import_rows"\)/);
    expect(upd).toMatch(/\.neq\("status", "committed"\)/);
  });

  it("commitStagedRow writes the final state and `committed` in ONE update of a still-ready row", () => {
    const port = read(PORT);
    const commit = port.slice(port.indexOf("async commitStagedRow("), port.indexOf("async readRoster("));
    expect(commit).toMatch(/\.update\(\{ \.\.\.finalState, status: "committed" \}\)/);
    expect(commit).toMatch(/\.eq\("status", "ready"\)/);
    expect(commit.match(/\.update\(/g)).toHaveLength(1);
  });

  it("the commit marks a row only through commitStagedRow, and only rows whose record THIS call wrote", () => {
    const core = read(CORE);
    const commit = core.slice(core.indexOf("export async function commitImport("), core.indexOf("export interface CommitRowsInput"));
    expect(commit).toMatch(/const toMark = finalState\.filter\(\(f\) => writtenRowIds\.has\(f\.id\)\);/);
    expect(commit).toMatch(/store\.commitStagedRow\(f\.id, f\.state\)/);
    expect(commit).not.toMatch(/updateStagedRow\(/);
    // A mark that fails is said, never swallowed.
    expect(commit).toMatch(/if \(failed\?\.error\) return classify\(failed\.error\);/);
  });
});
