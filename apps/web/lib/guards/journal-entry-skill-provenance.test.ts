import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * PR-C guard — journal_entry_skills link provenance.
 *
 * The link table records THAT an entry supports a skill; since migration
 * 20260727180000_journal_entry_skill_provenance_v1 it also records HOW the
 * link was created ('recognized' | 'confirmed' | 'manual'). This guard pins:
 *
 *   1. every TS insert/upsert into journal_entry_skills goes through the ONE
 *      stamping helper (lib/journal/entry-skill-link-write.ts) — no raw write
 *      may reappear anywhere else;
 *   2. the helper stamps provenance AND degrades honestly (retry unstamped on
 *      undefined_column) while the column is unapplied;
 *   3. each canonical write site declares its true provenance;
 *   4. the migration is the additive GREEN shape it claims to be, with its
 *      paired rollback;
 *   5. the read side prefers the stored provenance when present.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const HELPER_REL = "lib/journal/entry-skill-link-write.ts";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("1. single TS write path into journal_entry_skills", () => {
  it("no file except the helper writes journal_entry_skills directly", () => {
    const files = [
      ...walk(join(APP, "lib")),
      ...walk(join(APP, "app")),
      ...walk(join(APP, "components")),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(APP.length + 1).replace(/\\/g, "/");
      if (rel === HELPER_REL) continue;
      const src = readFileSync(file, "utf8");
      let idx = src.indexOf('from("journal_entry_skills")');
      while (idx !== -1) {
        // A write chained within reach of the from() call is a raw write.
        const window = src.slice(idx, idx + 250);
        if (/\.(insert|upsert)\s*\(/.test(window)) offenders.push(rel);
        idx = src.indexOf('from("journal_entry_skills")', idx + 1);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe("2. the helper stamps provenance and degrades honestly", () => {
  const helper = read(HELPER_REL);

  it("stamps the provenance value onto every row", () => {
    expect(helper).toMatch(/\{ \.\.\.r, provenance \}/);
  });

  it("detects the missing column (42703 / PGRST204) and retries unstamped", () => {
    expect(helper).toContain('"42703"');
    expect(helper).toContain('"PGRST204"');
    expect(helper).toMatch(/isMissingProvenanceColumnError/);
    // The retry re-sends the SAME rows without the provenance field.
    expect(helper).toMatch(/rows\.map\(\(r\) => \(\{ \.\.\.r \}\)\)/);
  });

  it("never fakes success — the caller receives the real final error", () => {
    expect(helper).toMatch(/return \{ error: plain\.error \?\? null, degraded: true \}/);
    expect(helper).toMatch(/return \{ error: stamped\.error, degraded: false \}/);
  });
});

describe("3. each canonical write site declares its true provenance", () => {
  it("pipeline auto-links stamp 'recognized'", () => {
    const src = read("lib/journal/skill-pipeline.ts");
    expect(src).toMatch(
      /writeEntrySkillLinks\(sb, rows, "recognized", "upsert"\)/,
    );
  });

  it("manual link flow stamps 'manual'; on-save recognition stamps 'recognized'", () => {
    const src = read("lib/journal/journal-entry-skills-actions.ts");
    expect(src).toMatch(
      /writeEntrySkillLinks\(supabase, rows, "manual", "insert"\)/,
    );
    expect(src).toMatch(
      /writeEntrySkillLinks\(supabase, rows, "recognized", "upsert"\)/,
    );
  });

  it("worker candidate confirms stamp 'confirmed'", () => {
    const src = read("lib/journal/skill-pipeline-actions.ts");
    expect(src).toMatch(/writeEntrySkillLinks\(\s*sb,[\s\S]{0,200}?"confirmed",\s*"upsert",?\s*\)/);
  });
});

describe("4. migration is additive GREEN with a paired rollback", () => {
  const MIG = "20260727180000_journal_entry_skill_provenance_v1.sql";
  const migPath = join(REPO, "supabase", "migrations", MIG);
  const downPath = join(
    REPO,
    "supabase",
    "rollbacks",
    MIG.replace(/\.sql$/, ".down.sql"),
  );

  it("migration + rollback files exist", () => {
    expect(existsSync(migPath)).toBe(true);
    expect(existsSync(downPath)).toBe(true);
  });

  it("adds ONLY the nullable checked column — no grants, drops, DML or policies", () => {
    const raw = readFileSync(migPath, "utf8");
    // Strip comments before judging executable SQL (same boundary as the
    // migration-safety gate).
    const code = raw.replace(/--[^\n]*/g, " ");
    expect(code).toMatch(
      /alter table public\.journal_entry_skills\s+add column if not exists provenance text/i,
    );
    expect(code).toMatch(/'recognized'/);
    expect(code).toMatch(/'confirmed'/);
    expect(code).toMatch(/'manual'/);
    for (const banned of [
      /\bgrant\s/i,
      /\brevoke\s/i,
      /\bdrop\s/i,
      /\bupdate\s+\w/i,
      /\bdelete\s+from\b/i,
      /\bcreate\s+policy\b/i,
      /\balter\s+policy\b/i,
      /\bsecurity\s+definer\b/i,
      /\bnot\s+null\b/i,
    ]) {
      expect(code, `executable SQL must not match ${banned}`).not.toMatch(banned);
    }
    // In-file rollback pointer required by the safety gate.
    expect(raw).toMatch(/--[^\n]*ROLLBACK/);
  });

  it("rollback drops only the provenance column", () => {
    const down = readFileSync(downPath, "utf8").replace(/--[^\n]*/g, " ");
    expect(down).toMatch(
      /alter table public\.journal_entry_skills\s+drop column if exists provenance/i,
    );
  });
});

describe("5. the read side prefers stored provenance", () => {
  it("classifier consults storedProvenance before the re-derivation", () => {
    const src = read("lib/journal/entry-skill-source.ts");
    expect(src).toMatch(/storedProvenance === "recognized"/);
    expect(src).toMatch(/storedProvenance === "confirmed"/);
    // Verified (a real human confirmation) still outranks link provenance.
    const verifiedIdx = src.indexOf('if (s.verified) return "confirmed_by_person"');
    const provIdx = src.indexOf('s.storedProvenance === "recognized"');
    expect(verifiedIdx).toBeGreaterThan(-1);
    expect(provIdx).toBeGreaterThan(verifiedIdx);
  });

  it("the link read selects provenance with a pre-migration fallback", () => {
    const reader = read("lib/journal/entry-skill-link-read.ts");
    expect(reader).toContain('"journal_entry_id, skill_id, provenance"');
    expect(reader).toContain('"journal_entry_id, skill_id"');
    expect(reader).toContain("parseEntrySkillProvenance");
  });

  it("the journal page consumes the provenance-aware link read", () => {
    const page = read("app/[locale]/dashboard/journal/page.tsx");
    expect(page).toContain("readWorkerEntrySkillLinks");
    expect(page).toContain("provenanceBySkillId: provenanceByEntry.get(e.id)");
  });
});
