import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recordEntrySkillDecision, retractEntrySkillEvidence } from "./entry-skill-retraction";
import { applyWorkerSkillSourceReconcile } from "./skill-source-apply";
import { withoutDisputedLinks, disputeKey } from "./entry-skill-disputes";

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
      order() {
        return q;
      },
      range(from: number, to: number) {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
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

  it("a failed marker withdraws nothing (the link stays for the retry)", async () => {
    const db = fakeDb(seed());
    const failing = {
      from(table: string) {
        const q = db.client.from(table);
        if (table === "journal_entry_metrics") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (q as any).insert = () => Promise.resolve({ error: { code: "42501" } });
        }
        return q;
      },
    };
    const res = await retractEntrySkillEvidence(failing, { entryId: ENTRY, workerId: WORKER, slugs: ["welding-blueprint"] });
    expect(res.ok).toBe(false);
    expect(db.log.some((l) => l.startsWith("delete:journal_entry_skills"))).toBe(false);
    expect(db.tables.journal_entry_skills).toHaveLength(3);
  });

  it("marker recorded + link delete failed → a retry completes the withdrawal", async () => {
    const db = fakeDb(seed());
    let failDelete = true;
    const flaky = {
      from(table: string) {
        const q = db.client.from(table);
        if (table === "journal_entry_skills" && failDelete) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (q as any).delete = () => ({ eq: () => ({ eq: () => ({ in: () => Promise.resolve({ error: { code: "57014" } }) }) }) });
        }
        return q;
      },
    };
    const first = await retractEntrySkillEvidence(flaky, { entryId: ENTRY, workerId: WORKER, slugs: ["welding-blueprint"] });
    expect(first.ok).toBe(false);
    expect(db.tables.journal_entry_metrics).toHaveLength(1); // the dispute is on record
    failDelete = false;
    const retry = await retractEntrySkillEvidence(flaky, { entryId: ENTRY, workerId: WORKER, slugs: ["welding-blueprint"] });
    expect(retry.ok).toBe(true);
    expect(db.tables.journal_entry_metrics).toHaveLength(1); // still one marker
    expect(db.tables.journal_entry_skills.some((r) => r.skill_id === "s-blue")).toBe(false);
  });

  it("a leftover link under a dispute is never evidence: the tier reads it as unsupported", async () => {
    const tables = seed();
    // The dispute is recorded, the link row is still there.
    tables.journal_entry_metrics.push({
      entry_id: ENTRY,
      metric_slug: "skill_rejected",
      value_text: "welding-blueprint",
      "journal_entries.worker_id": WORKER,
    });
    const db = fakeDb(tables);
    await applyWorkerSkillSourceReconcile(db.client, WORKER);
    expect(db.tables.journal_entry_skills.some((r) => r.skill_id === "s-blue")).toBe(true);
    expect(db.tables.worker_skills.find((r) => r.skill_id === "s-blue")!.source).toBe("self_declared");
    expect(db.tables.worker_skills.find((r) => r.skill_id === "s-weld")!.source).toBe("work_journal");
    // The same pure filter feeds the Living CV and the journal page.
    const links = [
      { journal_entry_id: ENTRY, skill_id: "s-blue" },
      { journal_entry_id: "e2", skill_id: "s-blue" },
    ];
    expect(withoutDisputedLinks(links, new Set([disputeKey(ENTRY, "s-blue")]))).toEqual([
      { journal_entry_id: "e2", skill_id: "s-blue" },
    ]);
    expect(withoutDisputedLinks(links, null)).toEqual(links);
  });

  it("a re-affirmation is written only over a standing rejection, and later than it", async () => {
    const db = fakeDb(seed());
    expect(await recordEntrySkillDecision(db.client, ENTRY, "welding-blueprint", "reaffirmed")).toBe(true);
    expect(db.tables.journal_entry_metrics).toHaveLength(0); // nothing to supersede
    const future = Date.now() + 60_000;
    db.tables.journal_entry_metrics.push({
      entry_id: ENTRY,
      metric_slug: "skill_rejected",
      value_text: "welding-blueprint",
      value_numeric: future,
    });
    expect(await recordEntrySkillDecision(db.client, ENTRY, "welding-blueprint", "reaffirmed")).toBe(true);
    const reaf = db.tables.journal_entry_metrics.find((r) => r.metric_slug === "skill_reaffirmed")!;
    expect(reaf).toMatchObject({ entry_id: ENTRY, value_text: "welding-blueprint", source: "worker_input" });
    expect(reaf.value_numeric as number).toBeGreaterThan(future);
    // …and a second re-affirmation is a no-op (already the latest decision).
    await recordEntrySkillDecision(db.client, ENTRY, "welding-blueprint", "reaffirmed");
    expect(db.tables.journal_entry_metrics.filter((r) => r.metric_slug === "skill_reaffirmed")).toHaveLength(1);
    // A dispute after the re-link is recorded again (decisions alternate).
    await recordEntrySkillDecision(db.client, ENTRY, "welding-blueprint", "rejected");
    expect(db.tables.journal_entry_metrics.filter((r) => r.metric_slug === "skill_rejected")).toHaveLength(2);
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
