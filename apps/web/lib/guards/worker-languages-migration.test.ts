/**
 * Guard — worker_languages v1 draft migration pair (marketplace precision
 * programme, decision pack MP-1). Pins that:
 *   1. exactly ONE migration (+ its rollback sibling) owns worker_languages
 *      and the two RPCs;
 *   2. the pair stays human-gated (needs-human-gate + @human-gate-approved
 *      visible in the file);
 *   3. the closed vocabularies match the structured-demand matching contract
 *      (11 platform languages; CEFR A1..C2 + native);
 *   4. writes stay RPC-only at the SQL layer;
 *   5. SELECT visibility is the consent-gated can_view_worker path — the
 *      same fail-closed gate worker_skills uses (no blanket employer read);
 *   6. no verified/verification flag exists — languages are self-declared
 *      facts and nothing may render them as verified.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..", "..", "..");
const MP1 = "20260711250000_worker_languages_v1";
const RPC_NAMES = ["save_worker_language_v1", "remove_worker_language_v1"];

const up = readFileSync(join(REPO, "supabase", "migrations", `${MP1}.sql`), "utf8");
const down = readFileSync(
  join(REPO, "supabase", "rollbacks", `${MP1}.down.sql`),
  "utf8",
);

describe("worker_languages migration pair", () => {
  it("only the MP-1 pair mentions worker_languages or its RPCs", () => {
    for (const dir of ["migrations", "rollbacks"]) {
      const abs = join(REPO, "supabase", dir);
      if (!existsSync(abs)) continue;
      for (const f of readdirSync(abs).filter((f) => f.endsWith(".sql"))) {
        if (f.startsWith(MP1)) continue;
        const src = readFileSync(join(abs, f), "utf8");
        expect(src, `${dir}/${f} must not define worker_languages`).not.toMatch(
          /\bworker_languages\b/,
        );
        for (const fn of RPC_NAMES) {
          expect(src, `${dir}/${f} must not define ${fn}`).not.toContain(fn);
        }
      }
    }
  });

  it("stays human-gated with the no-auto-apply doctrine visible", () => {
    expect(up).toContain("needs-human-gate");
    expect(up).toContain("@human-gate-approved");
    expect(up).toContain("Never `db push`");
  });

  it("defines the exact closed vocabularies of the matching contract", () => {
    expect(up).toContain(
      "check (lang in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru'))",
    );
    expect(up).toContain(
      "check (level in ('A1','A2','B1','B2','C1','C2','native'))",
    );
    expect(up).toMatch(/unique \(worker_id, lang\)/);
  });

  it("SELECT is consent-gated via can_view_worker; writes are RPC-only", () => {
    expect(up).toContain("using (public.can_view_worker(worker_id))");
    expect(up).toMatch(
      /revoke insert, update, delete on public\.worker_languages from authenticated/,
    );
    for (const fn of RPC_NAMES) {
      expect(up).toContain(`create or replace function public.${fn}`);
      expect(up).toContain("security definer");
      expect(up).toContain("set search_path = public");
      expect(down).toContain(`drop function if exists public.${fn}`);
    }
    expect(down).toMatch(/drop table if exists public\.worker_languages/);
  });

  it("self-declared only — no verified column exists or may be added here", () => {
    const tableBlock = up.slice(
      up.indexOf("create table if not exists public.worker_languages"),
      up.indexOf(");") + 2,
    );
    expect(tableBlock.length).toBeGreaterThan(0);
    expect(tableBlock).not.toMatch(/verified/i);
    // And no later ALTER sneaks one in.
    expect(up).not.toMatch(/add column[^;]*verified/i);
  });
});
