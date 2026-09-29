import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ONE OPPORTUNITY REALITY (owner continuation 2026-09-29, item 2). Production
 * walk, same worker, same profile: the opportunities page listed Swedish
 * public ads while the chat answered "Švedijoje … nieko nematoma. Matoma: NL"
 * — it decided which countries exist from platform needs ONLY, ignoring the
 * public ads carried by the SAME board read. The chat's country vocabulary
 * now includes those ads' countries; the search itself is unchanged (the one
 * ranking path already narrows the ads by country).
 */
const WEB = join(__dirname, "..", "..");
const flow = readFileSync(join(WEB, "lib/ai-workspace/workflows.ts"), "utf8");
const vocab = readFileSync(join(WEB, "lib/ai-workspace/vocabulary-server.ts"), "utf8");

describe("the chat and the page agree on where work exists", () => {
  it("runFindWork counts the board's public ads' countries", () => {
    const fn = flow.slice(flow.indexOf("export async function runFindWork"));
    expect(fn).toMatch(/board\.externalVacancies\.cards\s*\.map\(\(c\) => c\.view\.country/);
    expect(fn).toMatch(/buildWorkspaceVocabulary\(needs, adCountries\)/);
  });

  it("the vocabulary merges them into the ONE country facet (no second search)", () => {
    expect(vocab).toMatch(/extraCountries: readonly string\[\] = \[\]/);
    expect(vocab).toMatch(/countries: \[\.\.\.new Set\(\[\.\.\.base\.countries, \.\.\.extraCountries/);
    expect(flow).not.toMatch(/loadExternalVacancyCards\(/);
  });
});
