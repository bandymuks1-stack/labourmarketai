/**
 * RECORDER for lib/conversation/other-languages-unchanged-by-sv.fixture.json.
 *
 * Records what origin/main says for every pinned non-Swedish sentence — the
 * router's intent and score and every reader in
 * lib/conversation/other-languages-unchanged-by-sv.readers.ts — so the test can
 * assert that today's tree, with Swedish in it, still says the same.
 *
 * It must run INSIDE A CHECKOUT OF origin/main (the outputs are main's), with
 * the reader table and the sentence list taken from the branch under test:
 *
 *   git worktree add --detach /tmp/main-wt origin/main
 *   ln -s "$PWD/node_modules" /tmp/main-wt/node_modules
 *   ln -s "$PWD/apps/web/node_modules" /tmp/main-wt/apps/web/node_modules
 *   (cd /tmp/main-wt/apps/web && npx tsx "$OLDPWD/apps/web/scripts/sv-other-languages-fixture.mts" \
 *      "$OLDPWD/apps/web/lib/conversation/other-languages-unchanged-by-sv.readers.ts" \
 *      "$OLDPWD/apps/web/lib/conversation/other-languages-unchanged-by-sv.fixture.json" \
 *      "$(git -C /tmp/main-wt rev-parse HEAD)")
 *   git worktree remove --force /tmp/main-wt
 *
 * Arguments: <readers.ts> <fixture.json — read for its sentences, then
 * rewritten> <main sha> [<sentences.json> — a plain list, for a new fixture].
 *
 * A reader's most common output is stored once as its `default`; a row holds
 * only the outputs that differ from it. No clock and no randomness: the same
 * inputs write the same bytes.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [readersPath, fixturePath, mainSha, sentencesPath] = process.argv.slice(2);
if (!readersPath || !fixturePath || !mainSha) {
  console.error("usage: sv-other-languages-fixture.mts <readers.ts> <fixture.json> <main sha> [sentences.json]");
  process.exit(2);
}

const load = async (file: string) => import(pathToFileURL(file).href);
const { makeReaders, READER_MODULE_PATHS } = await load(path.resolve(readersPath));

// Modules come from THIS checkout (cwd = <main checkout>/apps/web). One that
// does not exist here yet (extracted after main) loads as empty.
const modules: Record<string, unknown> = {};
for (const [key, rel] of Object.entries(READER_MODULE_PATHS as Record<string, string>)) {
  const file = path.join(process.cwd(), rel);
  modules[key] = fs.existsSync(file) ? await load(file) : {};
}
const readers = makeReaders(modules) as Record<string, (s: string) => unknown>;
const names = Object.keys(readers);

const sentences: string[] = sentencesPath
  ? JSON.parse(fs.readFileSync(sentencesPath, "utf8"))
  : (JSON.parse(fs.readFileSync(fixturePath, "utf8")).rows as Array<[string, unknown]>).map((r) => r[0]);

const outputs = sentences.map((sentence) => names.map((name) => JSON.stringify(readers[name](sentence) ?? null)));

const defaults: Record<string, unknown> = {};
names.forEach((name, i) => {
  const counts = new Map<string, number>();
  for (const row of outputs) counts.set(row[i], (counts.get(row[i]) ?? 0) + 1);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  defaults[name] = JSON.parse(top);
});

const rows = sentences.map((sentence, r) => {
  const said: Record<string, unknown> = {};
  names.forEach((name, i) => {
    if (outputs[r][i] !== JSON.stringify(defaults[name])) said[name] = JSON.parse(outputs[r][i]);
  });
  return [sentence, said];
});

const body = [
  "{",
  `"recordedOn": ${JSON.stringify(`origin/main @ ${mainSha}`)},`,
  `"recordedBy": "apps/web/scripts/sv-other-languages-fixture.mts",`,
  `"readers": ${JSON.stringify(names)},`,
  `"defaults": ${JSON.stringify(defaults)},`,
  `"rows": [`,
  rows.map((row) => JSON.stringify(row)).join(",\n"),
  "]",
  "}",
  "",
].join("\n");
fs.writeFileSync(fixturePath, body);
console.log(`${rows.length} sentences x ${names.length} readers recorded on ${mainSha}`);
