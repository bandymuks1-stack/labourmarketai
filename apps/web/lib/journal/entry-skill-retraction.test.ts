import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { retractEntrySkillEvidence } from "./entry-skill-retraction";

/**
 * A disputed journal reading is recorded AND withdrawn (owner requirement
 * 2026-10-29: the person can dispute a wrong inference; the basis is kept).
 *
 * A tiny in-memory PostgREST stand-in: it records every call so the test can
 * say exactly what was written, deleted and recomputed.
 */
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const log: string[] = [];
  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "delete" | "update" = "select";
    let patch: Row = {};
    const q = {
      select() {
        return q;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return q;
      },
      in(col: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[col]));
        return q;
      },
      delete() {
        op = "delete";
        return q;
      },
      update(p: Row) {
        op = "update";
        patch = p;
        return q;
      },
      insert(rows: Row[]) {
        tables[table] = [...(tables[table] ?? []), ...rows];
        log.push(`insert:${table}:${rows.map((r) => r.value_text ?? "").join(",")}`);
        return Promise.resolve({ error: null });
      },
      then(resolve: (v: { data: Row[] | null; error: null }) => void) {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (op === "delete") {
          tables[table] = (tables[table] ?? []).filter((r) => !rows.includes(r));
          log.push(`delete:${table}:${rows.length}`);
        } else if (op === "update") {
          for (const r of rows) Object.assign(r, patch);
          log.push(`update:${table}:${rows.length}`);
        }
        resolve({ data: rows, error: null });
      },
    };
    return q;
  }
  return { client: { from }, log, tables };
}

const ENTRY = "e1";
const WORKER = "w1";

function seed() {
  return {
    skills: [
      { id: "s-weld", slug: "mig-mag-welding" },
      { id: "s-blue", slug: "welding-blueprint" },
    ],
    journal_entry_skills: [
      { journal_entry_id: ENTRY, worker_id: WORKER, skill_id: "s-weld" },
      { journal_entry_id: ENTRY, worker_id: WORKER, skill_id: "s-blue" },
      { journal_entry_id: "e2", worker_id: WORKER, skill_id: "s-weld" },
    ],
    journal_entry_metrics: [] as Row[],
    worker_skills: [
      { worker_id: WORKER, skill_id: "s-weld", verified: false, source: "work_journal" },
      { worker_id: WORKER, skill_id: "s-blue", verified: false, source: "work_journal" },
    ],
  };
}

describe("retractEntrySkillEvidence", () => {
  it("records the dispute on the entry, withdraws only that entry's link, and lets the tier fall", async () => {
    const db = fakeDb(seed());
    const res = await retractEntrySkillEvidence(db.client, {
      entryId: ENTRY,
      workerId: WORKER,
      slugs: ["welding-blueprint"],
    });
    expect(res).toEqual({ ok: true, markedSlugs: ["welding-blueprint"] });
    // The basis is kept: an append-only marker on THIS entry.
    expect(db.tables.journal_entry_metrics).toEqual([
      expect.objectContaining({
        entry_id: ENTRY,
        metric_slug: "skill_rejected",
        source: "worker_input",
        value_text: "welding-blueprint",
      }),
    ]);
    // Only the disputed link on this entry is gone; other evidence stays.
    expect(db.tables.journal_entry_skills.map((r) => `${r.journal_entry_id}:${r.skill_id}`).sort()).toEqual([
      "e1:s-weld",
      "e2:s-weld",
    ]);
    // The skill row stays (the profile decides), but no longer reads as journal evidence.
    const blue = db.tables.worker_skills.find((r) => r.skill_id === "s-blue")!;
    expect(blue).toMatchObject({ verified: false, source: "self_declared" });
    const weld = db.tables.worker_skills.find((r) => r.skill_id === "s-weld")!;
    expect(weld.source).toBe("work_journal");
  });

  it("is idempotent: a second dispute adds no second marker", async () => {
    const db = fakeDb(seed());
    await retractEntrySkillEvidence(db.client, { entryId: ENTRY, workerId: WORKER, skillIds: ["s-blue"] });
    await retractEntrySkillEvidence(db.client, { entryId: ENTRY, workerId: WORKER, skillIds: ["s-blue"] });
    expect(db.tables.journal_entry_metrics).toHaveLength(1);
  });

  it("deleteLinks:false only records the dispute (the caller already removed the rows)", async () => {
    const db = fakeDb(seed());
    await retractEntrySkillEvidence(db.client, {
      entryId: ENTRY,
      workerId: WORKER,
      skillIds: ["s-blue"],
      deleteLinks: false,
    });
    expect(db.log.some((l) => l.startsWith("delete:journal_entry_skills"))).toBe(false);
    expect(db.tables.journal_entry_metrics).toHaveLength(1);
  });

  it("both dispute doors route through it (no second copy of the rule)", () => {
    const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
    expect(read("skill-pipeline-actions.ts")).toMatch(/retractEntrySkillEvidence\(ctx\.sb,/);
    expect(read("journal-entry-skills-actions.ts")).toMatch(/retractEntrySkillEvidence\(supabase,/);
    // The retraction never verifies, confirms or deletes a skill row.
    const src = read("entry-skill-retraction.ts");
    expect(src).not.toMatch(/verified\s*:\s*true/);
    expect(src).not.toMatch(/manager_confirmed/);
    expect(src).not.toMatch(/from\("worker_skills"\)/);
    expect(src).not.toMatch(/from\("journal_entry_metrics"\)\s*\.\s*delete/);
  });
});
