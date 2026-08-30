import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ESCO LINKAGE MIGRATION GUARD.
 *
 * `supabase/migrations/20260830100000_esco_canonical_linkage_67.sql` writes
 * the 67 EXACT / HIGH_CONFIDENCE rows of the mapping dry run into
 * skills.esco_uri / professions.esco_uri. This guard pins the migration to
 * the artifact so neither can drift alone:
 *
 *   - exactly the artifact's EXACT/HIGH rows, no more, no fewer;
 *   - no AMBIGUOUS / NO_MATCH slug can sneak in;
 *   - skill rows carry /esco/skill/ URIs, profession rows /esco/occupation/;
 *   - the write is null-guarded, corpus-asserted, and abort-on-conflict;
 *   - no DDL, no deletes, no unique constraint on esco_uri;
 *   - the rollback block lists the same 67 pairs.
 */

const REPO = resolve(process.cwd(), "../..");
const MIGRATION = resolve(
  REPO,
  "supabase/migrations/20260830100000_esco_canonical_linkage_67.sql",
);
const ARTIFACT = resolve(REPO, "docs/taxonomy/esco-mapping-dryrun-2026-08-30.json");

interface ArtifactRow {
  readonly labourmarket_canonical_slug: string;
  readonly esco_uri: string | null;
  readonly confidence: string;
}

const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8")) as {
  skills: ArtifactRow[];
  professions: ArtifactRow[];
};
const sql = readFileSync(MIGRATION, "utf8");

/** Non-comment SQL — the rollback plan at the bottom is commented out. */
const liveSql = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const PLAN_RE = /\('(skill|profession)',\s*'([a-z0-9_-]+)',\s*'(http:\/\/data\.europa\.eu\/esco\/[a-z]+\/[0-9a-f-]{36})'\)/g;
const planPairs = [...liveSql.matchAll(PLAN_RE)].map((m) => ({
  t: m[1],
  slug: m[2],
  uri: m[3],
}));

const approved = (rows: ArtifactRow[]) =>
  rows
    .filter((r) => r.confidence === "EXACT" || r.confidence === "HIGH_CONFIDENCE")
    .map((r) => ({ slug: r.labourmarket_canonical_slug, uri: r.esco_uri }));

describe("esco linkage migration — pinned to the mapping artifact", () => {
  it("contains exactly the artifact's EXACT/HIGH rows: 31 skills + 36 professions", () => {
    const skillPlan = planPairs.filter((p) => p.t === "skill");
    const profPlan = planPairs.filter((p) => p.t === "profession");
    expect(skillPlan).toHaveLength(31);
    expect(profPlan).toHaveLength(36);
    expect(planPairs).toHaveLength(67);

    const key = (x: { slug: string; uri: string | null }) => `${x.slug}→${x.uri}`;
    expect(new Set(skillPlan.map(key))).toEqual(new Set(approved(artifact.skills).map(key)));
    expect(new Set(profPlan.map(key))).toEqual(new Set(approved(artifact.professions).map(key)));
  });

  it("never writes an AMBIGUOUS or NO_MATCH slug", () => {
    const blocked = new Set(
      [...artifact.skills, ...artifact.professions]
        .filter((r) => r.confidence === "AMBIGUOUS" || r.confidence === "NO_MATCH")
        .map((r) => r.labourmarket_canonical_slug),
    );
    for (const p of planPairs) {
      expect(blocked.has(p.slug), `${p.slug} is not approved for apply`).toBe(false);
    }
  });

  it("keeps namespaces apart: skill rows use /esco/skill/, profession rows /esco/occupation/", () => {
    for (const p of planPairs) {
      const expected =
        p.t === "skill"
          ? "http://data.europa.eu/esco/skill/"
          : "http://data.europa.eu/esco/occupation/";
      expect(p.uri.startsWith(expected), `${p.slug}: ${p.uri}`).toBe(true);
    }
  });

  it("write is null-guarded, corpus-asserted per namespace, and aborts on conflict", () => {
    expect(liveSql).toMatch(/update public\.skills[\s\S]*?where slug = r\.slug and esco_uri is null/);
    expect(liveSql).toMatch(/update public\.professions[\s\S]*?where p?\w*\.?slug = r\.slug and esco_uri is null/);
    expect(liveSql).toContain("from public.esco_skills es where es.esco_uri = r.uri");
    expect(liveSql).toContain("from public.esco_occupations eo where eo.esco_uri = r.uri");
    // conflict abort: a different pre-existing non-null value raises
    expect(liveSql).toMatch(/esco_uri is not null and \w+\.esco_uri <> r\.uri/);
    expect(liveSql).toContain("raise exception");
  });

  it("is UPDATE-only: no DDL, no deletes, no inserts, no unique constraint, no URI-tail parsing", () => {
    const lower = liveSql.toLowerCase();
    for (const forbidden of [
      "drop ",
      "delete from",
      "insert into",
      "create unique",
      "add constraint",
      "alter table",
      "create policy",
      "substring(",
    ]) {
      expect(lower.includes(forbidden), `forbidden statement: ${forbidden}`).toBe(false);
    }
  });

  it("ships a mechanical rollback listing the same 67 pairs", () => {
    const rollbackSection = sql.slice(sql.indexOf("ROLLBACK"));
    expect(rollbackSection).toContain("set esco_uri = null");
    for (const p of planPairs) {
      expect(rollbackSection.includes(p.uri), `rollback missing ${p.slug}`).toBe(true);
    }
  });

  it("only slugs that exist in the canonical name registries are written", () => {
    const skillNames = JSON.parse(
      readFileSync(resolve(REPO, "apps/web/messages/en/skill-names.json"), "utf8"),
    ) as Record<string, string>;
    const profNames = JSON.parse(
      readFileSync(resolve(REPO, "apps/web/messages/en/professions.json"), "utf8"),
    ) as Record<string, string>;
    for (const p of planPairs) {
      const reg = p.t === "skill" ? skillNames : profNames;
      expect(reg[p.slug], `${p.slug} missing from ${p.t} registry`).toBeDefined();
    }
  });
});
