import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A found person could be shortlisted and contacted from the search result,
 * but the only way to open their page was to type its address. The result
 * card's name is now the link (the shared identity card's own `nameHref`).
 *
 * The link adds no access: the person page reads the raw record only with a
 * working relationship and otherwise the anonymous discovery projection, and
 * shows "Profile unavailable" when neither answers.
 */
const web = join(__dirname, "..", "..");
const scouting = readFileSync(
  join(web, "app/[locale]/dashboard/company/scouting/page.tsx"),
  "utf8",
);
const person = readFileSync(
  join(web, "app/[locale]/dashboard/people/[workerId]/page.tsx"),
  "utf8",
);

describe("search result: the name opens the person page", () => {
  it("both result lists pass the person page as the card's name link", () => {
    expect(scouting).toMatch(/nameHref=\{`\/dashboard\/people\/\$\{c\.workerId\}`/);
    expect(scouting).toMatch(/nameHref=\{`\/dashboard\/people\/\$\{h\.workerId\}`/);
  });

  it("the page it opens still decides visibility itself", () => {
    expect(person).toContain("readDiscoverableWorkers(supabase, [workerId])");
    expect(person).toMatch(/if \(!worker\) \{\s*return <RestrictedState t=\{t\} \/>;/);
    expect(person).toMatch(/const nameVisible = await viewerHasWorkerRelation\(/);
  });
});
