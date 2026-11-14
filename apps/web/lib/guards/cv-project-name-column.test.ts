import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The CV read a project's name from `projects.name`. That column does not
 * exist (a project is named in `title`), the read's error was swallowed, and
 * no job on any CV showed its project. This pins the column the CV asks for
 * against the schema, so the two cannot drift apart silently again.
 */
const web = join(__dirname, "..", "..");
const repo = join(web, "..", "..");
const cv = readFileSync(join(web, "lib/cv-export/verified-cv.ts"), "utf8");
const types = readFileSync(join(web, "lib/supabase/types.ts"), "utf8");

describe("the CV reads a project's name from a column that exists", () => {
  it("every read of `projects` in the CV builder asks for `title`", () => {
    const selects = [...cv.matchAll(/\.from\("projects"\)\s*\.select\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(selects.length).toBeGreaterThanOrEqual(2);
    for (const columns of selects) {
      const list = columns.split(",").map((c) => c.trim());
      expect(list, columns).toContain("title");
      expect(list, columns).not.toContain("name");
    }
  });

  it("the generated types and the migrations agree: `title`, and no `name`", () => {
    const start = types.indexOf("      projects: {");
    expect(start).toBeGreaterThan(-1);
    const row = types.slice(start, types.indexOf("Insert:", start));
    expect(row).toMatch(/\btitle: string/);
    expect(row).not.toMatch(/^\s+name: /m);
    const dir = join(repo, "supabase/migrations");
    const added = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .some((f) => /alter table (public\.)?projects[\s\S]{0,200}add column (if not exists )?name\b/i.test(readFileSync(join(dir, f), "utf8")));
    expect(added, "a migration adds projects.name: revisit this guard").toBe(false);
  });
});
