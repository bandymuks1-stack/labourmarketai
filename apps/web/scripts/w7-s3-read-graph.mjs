/**
 * W7-S3 — deterministic read-graph counter for `/dashboard/profile`.
 *
 * Counts, from source, the two numbers this slice is judged on:
 *
 *   TOTAL AWAITS   every `await` expression in the render path.
 *   SERIAL STAGES  every point where execution must wait before the NEXT
 *                  await can begin. A `Promise.all([...])` is ONE stage no
 *                  matter how many reads it batches; a bare `await` is one
 *                  stage on its own. This is the number a waterfall is.
 *
 * Deliberately structural: timing on a dev server is too noisy to discriminate
 * (W7-S1 measured 3129→7171 ms for identical code), so the primary proof is a
 * count that cannot drift with machine load.
 *
 * Counts per top-level branch, because a worker and a non-worker walk
 * different paths through the page.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = process.cwd();
const FILES = [
  ["page", "app/[locale]/dashboard/profile/page.tsx"],
  ["hub", "components/app/profile-hub-overview.tsx"],
];

/** Strip comments and string/template literals so their text never counts. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function analyse(src) {
  const c = code(src);
  const awaits = (c.match(/\bawait\b/g) ?? []).length;
  // A stage is one `await`, except that `await Promise.all([...])` collapses
  // the reads inside it into that single stage.
  const batches = [...c.matchAll(/await\s+Promise\.all\(\s*\[/g)].length;
  // Reads batched inside Promise.all blocks — informational, not stages.
  let batched = 0;
  const re = /await\s+Promise\.all\(\s*\[/g;
  let m;
  while ((m = re.exec(c)) !== null) {
    let i = m.index + m[0].length - 1;
    let depth = 0;
    const start = i;
    for (; i < c.length; i++) {
      if (c[i] === "[") depth++;
      else if (c[i] === "]") {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = c.slice(start + 1, i);
    // top-level commas inside the array literal ⇒ entries
    let d = 0;
    let entries = body.trim().length > 0 ? 1 : 0;
    for (const ch of body) {
      if ("([{".includes(ch)) d++;
      else if (")]}".includes(ch)) d--;
      else if (ch === "," && d === 0) entries++;
    }
    batched += entries;
  }
  const translations = (c.match(/await\s+getTranslations\(/g) ?? []).length;
  const getLocale = (c.match(/await\s+getLocale\(/g) ?? []).length;
  const awaitsInJsx = (c.match(/\{\s*await\s|=\{await\s|signals=\{await/g) ?? []).length;
  return {
    awaits,
    stages: awaits, // one stage per await; Promise.all is already ONE await
    promiseAllBatches: batches,
    readsBatched: batched,
    serialTranslations: translations + getLocale,
    awaitsInsideJsx: awaitsInJsx,
  };
}

const out = {};
let totalAwaits = 0;
let totalStages = 0;
for (const [label, rel] of FILES) {
  const a = analyse(readFileSync(join(WEB, rel), "utf8"));
  out[label] = a;
  totalAwaits += a.awaits;
  totalStages += a.stages;
}
out.TOTAL = {
  awaits: totalAwaits,
  serialStages: totalStages,
  readsBatched: out.page.readsBatched + out.hub.readsBatched,
  promiseAllBatches: out.page.promiseAllBatches + out.hub.promiseAllBatches,
  serialTranslations: out.page.serialTranslations + out.hub.serialTranslations,
  awaitsInsideJsx: out.page.awaitsInsideJsx + out.hub.awaitsInsideJsx,
};

// Duplicate-reader detection: the same canonical reader or the same table
// queried more than once across the render path.
const all = FILES.map(([, rel]) => code(readFileSync(join(WEB, rel), "utf8"))).join("\n");
const READERS = [
  "getOwnAvatar",
  "getOwnedOrganizations",
  "getEmployerOwnerProfileId",
  "getOwnTrustSignals",
  "getWorkerPlayerCard",
  "getProfileOpportunitySignal",
  "countTodayJournalEntries",
  "getOwnAvailabilityPrefs",
  "getOwnWorkerLanguages",
  "getOwnExternalProfiles",
  "getOwnWorkerEducation",
  "getOwnWorkerAchievements",
];
out.readerCalls = Object.fromEntries(
  READERS.map((r) => [r, (all.match(new RegExp(`\\b${r}\\(`, "g")) ?? []).length]),
);
out.tableReads = Object.fromEntries(
  [...all.matchAll(/\.from\(\s*""\s*\)/g)].length
    ? []
    : [],
);
// `.from("x")` had its string blanked by code(); count on the raw source instead.
const raw = FILES.map(([, rel]) => readFileSync(join(WEB, rel), "utf8")).join("\n");
const tables = {};
for (const m of raw.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)) {
  tables[m[1]] = (tables[m[1]] ?? 0) + 1;
}
out.tableReads = tables;

console.log(JSON.stringify(out, null, 2));
