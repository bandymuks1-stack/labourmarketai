#!/usr/bin/env node
/**
 * SYSTEM REGISTER — one generated row per pull request (owner order 2026-11-03):
 * PR → modules → migrations → tests → first VPS deploy → FUNCTION_REGISTER row(s).
 *
 *   node .github/scripts/system-register.mjs            # refresh (incremental cache)
 *   node .github/scripts/system-register.mjs --refresh  # ignore the cache, fetch everything
 *
 * Writes docs/program/SYSTEM_REGISTER.md (+ system-register.json, system-register.csv).
 *
 * READ-ONLY. Sources: local git (`origin/main` first-parent history), the GitHub API through
 * `gh` (pull requests, deploy-vps runs, their jobs and artifact names) and two checked-in files:
 * docs/migrations/production-ledger-snapshot.json and docs/program/FUNCTION_REGISTER.md.
 * No production database, no credentials beyond the caller's own `gh` login, no writes
 * anywhere except the three output files and the cache (node_modules/.cache/system-register).
 *
 * FUNCTION_REGISTER stays the ONE canonical status of the planned functions. This register only
 * cites it: a PR's production state is the deploy run that first shipped its merge commit plus
 * the status of the FUNCTION_REGISTER rows that cite it — never a status of its own.
 *
 * The repository is public: titles are scrubbed of e-mail addresses; nothing is read from
 * production, so no production identifier can enter the output.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs", "program");
const CACHE_DIR = join(ROOT, "node_modules", ".cache", "system-register");
const LEDGER_SNAPSHOT = join(ROOT, "docs", "migrations", "production-ledger-snapshot.json");
const FUNCTION_REGISTER = join(OUT_DIR, "FUNCTION_REGISTER.md");
const DEPLOY_WORKFLOW = "deploy-vps.yml";
const SHIP_STEP = /^Ship \+ activate/;
const OPEN_STALE_DAYS = 14;

// ---------------------------------------------------------------------------
// Pure classification (unit-tested by lib/guards/system-register-tool.test.ts)
// ---------------------------------------------------------------------------

/** Path → module. Coarse on purpose: one module per area, not per file. */
export function moduleOf(path) {
  const p = path.replace(/\\/g, "/");
  let m;
  if ((m = p.match(/^apps\/web\/lib\/([^/]+)\//))) return `lib/${m[1]}`;
  if (p.startsWith("apps/web/lib/")) return "lib";
  if (p.startsWith("apps/web/app/")) {
    const segs = p
      .slice("apps/web/app/".length)
      .split("/")
      .slice(0, -1)
      .filter((s) => !/^\[locale\]$/.test(s) && !/^\(.*\)$/.test(s));
    if (segs.length === 0) return "app/(root)";
    if (segs[0] === "api") return `app/api/${segs[1] ?? ""}`.replace(/\/$/, "");
    return `app/${segs.slice(0, 2).join("/")}`;
  }
  if ((m = p.match(/^apps\/web\/components\/([^/]+)\//))) return `components/${m[1]}`;
  if (p.startsWith("apps/web/messages/")) return "i18n";
  if (p.startsWith("apps/web/e2e/")) return "e2e";
  if ((m = p.match(/^apps\/web\/([^/]+)\//))) return `web/${m[1]}`;
  if (p.startsWith("apps/web/")) return "web/(config)";
  if ((m = p.match(/^apps\/([^/]+)\//))) return `apps/${m[1]}`;
  if (p.startsWith("supabase/migrations/")) return "supabase/migrations";
  if (p.startsWith("supabase/rollbacks/")) return "supabase/rollbacks";
  if ((m = p.match(/^supabase\/([^/]+)\//))) return `supabase/${m[1]}`;
  if (p.startsWith(".github/workflows/")) return ".github/workflows";
  if (p.startsWith(".github/scripts/")) return ".github/scripts";
  if (p.startsWith(".github/")) return ".github";
  if ((m = p.match(/^docs\/([^/]+)\//))) return `docs/${m[1]}`;
  if (p.startsWith("docs/")) return "docs";
  if ((m = p.match(/^([^/]+)\//))) return m[1];
  return "(root)";
}

export const isTest = (path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)e2e\//.test(path);
export const isMigration = (path) => /^supabase\/migrations\/[^/]+\.sql$/.test(path);

/** Public repo: never carry an e-mail address; keep markdown tables intact. */
export const scrub = (s) => String(s ?? "").replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]");

/**
 * A migration file against the checked-in ledger snapshot. The snapshot is a dated read, so a
 * file it cannot know about (merged after the read) is "unknown", never "not applied".
 */
export function ledgerState(file, snapshot, settledAt) {
  const stem = file.replace(/^.*\//, "").replace(/\.sql$/, "");
  const prefix = stem.match(/^(\d+)_/)?.[1] ?? "";
  const suffix = stem.replace(/^\d+_/, "");
  const row = snapshot.rows.find((r) => r.name === suffix || r.name === stem || (prefix.length <= 4 && r.version === prefix));
  if (row) return { ledger: "in_snapshot", version: row.version };
  if (settledAt && settledAt < snapshot.read_at) return { ledger: "not_in_snapshot" };
  return { ledger: "unknown_after_snapshot" };
}

/**
 * First deploy that shipped a commit: main is deployed in first-parent order, so a deploy of
 * sha S ships every commit at or before S. `order` maps a first-parent sha to its index (0 =
 * oldest); `deploys` are runs whose ship step succeeded, oldest first.
 */
export function firstDeploy(mergeSha, order, deploys) {
  const at = order.get(mergeSha);
  if (at === undefined) return null;
  for (const d of deploys) {
    const di = order.get(d.sha);
    if (di !== undefined && di >= at) return d;
  }
  return null;
}

/** FUNCTION_REGISTER rows: `| 1.2 | name | STATUS | … |`, with their PR, sha and path citations. */
export function parseFunctionRegister(md) {
  const rows = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(\d+\.\d+)\s*\|\s*([^|]*?)\s*\|\s*([A-Z_]+)\s*\|/);
    if (!m) continue;
    rows.push({
      id: m[1],
      name: m[2],
      status: m[3],
      prs: new Set([...line.matchAll(/#(\d{2,5})\b/g)].map((x) => Number(x[1]))),
      shas: [...new Set([...line.matchAll(/\b[0-9a-f]{8,40}\b/g)].map((x) => x[0]).filter((s) => /[a-f]/.test(s) && /\d/.test(s)))],
      paths: [...new Set([...line.matchAll(/`([\w.[\]()-]+(?:\/[\w.[\]()-]+)+)`/g)].map((x) => x[1]))],
    });
  }
  return rows;
}

/**
 * Which FUNCTION_REGISTER rows belong to a PR. high = the row cites the PR number;
 * medium = the row cites its merge commit (≥ 8 hex); low = the row names a file it touched.
 */
export function linkFunctions(pr, rows) {
  const out = [];
  for (const r of rows) {
    let confidence = null;
    if (r.prs.has(pr.number)) confidence = "high";
    else if (pr.mergeSha && r.shas.some((s) => pr.mergeSha.startsWith(s))) confidence = "medium";
    else if (r.paths.some((p) => pr.files.some((f) => f.path === p || f.path.endsWith(`/${p}`)))) confidence = "low";
    if (confidence) out.push({ id: r.id, status: r.status, confidence });
  }
  return out;
}

/** One PR → one register row. */
export function buildRow(pr, ctx) {
  const files = pr.files ?? [];
  const modules = new Map();
  for (const f of files) modules.set(moduleOf(f.path), (modules.get(moduleOf(f.path)) ?? 0) + 1);
  const settledAt = pr.mergedAt ?? pr.closedAt ?? null;
  const migrations = files
    .filter((f) => f.changeType === "ADDED" && isMigration(f.path))
    .map((f) => ({ file: f.path.replace(/^.*\//, ""), ...ledgerState(f.path, ctx.snapshot, settledAt) }));
  const tests = files.filter((f) => isTest(f.path)).map((f) => f.path);
  let deploy = null;
  let deployState;
  if (pr.state !== "MERGED") deployState = "n/a";
  else if (pr.baseRefName !== "main") deployState = `merged into ${pr.baseRefName}`;
  else if (!ctx.order.has(pr.mergeSha)) deployState = "not on main first-parent";
  else {
    deploy = firstDeploy(pr.mergeSha, ctx.order, ctx.deploys);
    deployState = deploy ? "deployed" : "not deployed";
  }
  return {
    number: pr.number,
    title: scrub(pr.title),
    state: pr.state,
    draft: Boolean(pr.isDraft),
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt ?? null,
    mergeSha: pr.state === "MERGED" ? pr.mergeSha : null,
    base: pr.baseRefName,
    labels: pr.labels ?? [],
    modules: [...modules.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([m]) => m),
    filesTotal: pr.filesTotal ?? files.length,
    files: files.map((f) => f.path),
    migrations,
    tests,
    deployState,
    deploy: deploy ? { run: deploy.run, sha: deploy.sha, at: deploy.at } : null,
    functions: linkFunctions(pr, ctx.functionRows),
  };
}

export function summarize(rows, now = new Date()) {
  const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
  const byState = count(rows.map((r) => (r.state === "OPEN" && r.draft ? "OPEN (draft)" : r.state)));
  const byModule = count(rows.flatMap((r) => r.modules));
  const merged = rows.filter((r) => r.state === "MERGED");
  const hot = count(merged.flatMap((r) => r.files));
  const cutoff = now.getTime() - OPEN_STALE_DAYS * 86400e3;
  const migrationRows = rows.flatMap((r) => r.migrations.map((m) => ({ pr: r.number, prState: r.state, ...m })));
  const mergedMigrations = migrationRows.filter((m) => m.prState === "MERGED");
  return {
    total: rows.length,
    byState: [...byState.entries()].sort((a, b) => b[1] - a[1]),
    byModule: [...byModule.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    prsWithMigrations: rows.filter((r) => r.migrations.length > 0).length,
    migrationsAdded: migrationRows.length,
    mergedMigrationLedger: [...count(mergedMigrations.map((m) => m.ledger)).entries()].sort((a, b) => b[1] - a[1]),
    notInSnapshot: mergedMigrations.filter((m) => m.ledger === "not_in_snapshot"),
    deployStates: [...count(merged.map((r) => r.deployState)).entries()].sort((a, b) => b[1] - a[1]),
    neverDeployed: merged.filter((r) => r.deployState !== "deployed"),
    openStale: rows
      .filter((r) => r.state === "OPEN" && new Date(r.createdAt).getTime() < cutoff)
      .sort((a, b) => a.number - b.number),
    hotspots: [...hot.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 25),
    withFunctions: rows.filter((r) => r.functions.length > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const day = (iso) => (iso ? iso.slice(0, 10) : "");

function prodState(r) {
  const fns = r.functions.map((f) => `${f.id} ${f.status}${f.confidence === "high" ? "" : ` (${f.confidence})`}`).join("; ");
  const dep =
    r.deployState === "deployed" ? `deployed ${day(r.deploy.at)} run ${r.deploy.run}` : r.deployState === "n/a" ? "" : r.deployState;
  return [dep, fns].filter(Boolean).join(" · ");
}

export function renderMarkdown(rows, s, meta) {
  const L = [];
  const table = (head, body) => {
    L.push(`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`);
    for (const b of body) L.push(`| ${b.map(cell).join(" | ")} |`);
    L.push("");
  };
  L.push(
    "# SYSTEM REGISTER — every pull request: function → module → migration → test → deploy",
    "",
    "> **GENERATED — do not edit by hand.** Regenerate with `node .github/scripts/system-register.mjs`",
    "> (read-only: local git + the GitHub API through your own `gh` login; `--refresh` ignores the cache).",
    "> Machine-readable copies: [`system-register.json`](system-register.json), [`system-register.csv`](system-register.csv).",
    ">",
    "> [`FUNCTION_REGISTER.md`](FUNCTION_REGISTER.md) stays the ONE canonical status of the planned functions. This file",
    "> only cites it: a PR's production state is the `deploy-vps` run that first shipped its merge commit plus the",
    "> FUNCTION_REGISTER status of the rows that cite the PR — never a status of its own.",
    "",
    `Generated ${meta.generatedAt} from \`origin/main\` ${meta.mainSha.slice(0, 9)}.`,
    "",
    "**How each column is derived**",
    "",
    "- **Modules**: touched paths mapped by prefix (`apps/web/lib/<area>` → `lib/<area>`, app routes → `app/<segment>`, `apps/<app>`, `supabase/migrations`, `.github/*`, `docs/<area>`).",
    `- **Migrations**: \`supabase/migrations/*.sql\` files the PR added, against the checked-in ledger snapshot \`docs/migrations/production-ledger-snapshot.json\` (read ${day(meta.snapshotReadAt)}, ${meta.snapshotRows} rows). \`in_snapshot\` = the snapshot has it; \`not_in_snapshot\` = the PR settled before the read and no snapshot row has its name (by name only: a migration applied under a combined or other name lands here too — \`.github/scripts/migration-ledger-parity.mjs\` decides by content); \`unknown_after_snapshot\` = the PR settled after the read, so the snapshot cannot say. No database is read.`,
    "- **Tests**: added or changed `*.test.*` / `*.spec.*` files and anything under `e2e/`.",
    `- **Deploy**: the first \`${DEPLOY_WORKFLOW}\` run whose "Ship + activate" step succeeded for a \`main\` commit at or after the merge commit (first-parent order; the deployed sha is the run's \`standalone-<sha>\` artifact name, else its head sha). Production ran on Vercel before the first VPS deploy (${day(meta.firstDeployAt)}); those deploys are not tracked here, so an older PR shows the first VPS deploy that carried it.`,
    "- **Functions**: FUNCTION_REGISTER rows that cite the PR number (high), its merge commit (medium) or a file it touched (low).",
    "",
    "## Summary",
    "",
  );
  table(["Measure", "Count"], [
    ["Pull requests", s.total],
    ...s.byState.map(([k, v]) => [`— ${k}`, v]),
    ["PRs that add a migration", s.prsWithMigrations],
    ["Migration files added (all PRs)", s.migrationsAdded],
    ...s.mergedMigrationLedger.map(([k, v]) => [`— merged, ledger \`${k}\``, v]),
    ...s.deployStates.map(([k, v]) => [`Merged PRs: ${k}`, v]),
    [`Open PRs older than ${OPEN_STALE_DAYS} days`, s.openStale.length],
    ["PRs cited by a FUNCTION_REGISTER row", s.withFunctions],
  ]);
  L.push("### PRs by module (a PR counts once per module it touches)", "");
  table(["Module", "PRs"], s.byModule.slice(0, 40));
  if (s.byModule.length > 40) L.push(`…and ${s.byModule.length - 40} smaller modules (full list in the JSON).`, "");
  L.push("### Merged migrations not in the ledger snapshot", "");
  if (s.notInSnapshot.length === 0) L.push("None.", "");
  else table(["PR", "File"], s.notInSnapshot.map((m) => [`#${m.pr}`, m.file]));
  L.push("### Merged PRs with no VPS deploy", "");
  if (s.neverDeployed.length === 0) L.push("None.", "");
  else table(["PR", "Merged", "Why", "Title"], s.neverDeployed.map((r) => [`#${r.number}`, day(r.mergedAt), r.deployState, r.title]));
  L.push(`### Open PRs older than ${OPEN_STALE_DAYS} days`, "");
  if (s.openStale.length === 0) L.push("None.", "");
  else
    table(
      ["PR", "Opened", "Draft", "Labels", "Title"],
      s.openStale.map((r) => [`#${r.number}`, day(r.createdAt), r.draft ? "yes" : "", r.labels.join(", "), r.title]),
    );
  L.push("### Hotspots — files touched by the most merged PRs", "");
  table(["File", "Merged PRs"], s.hotspots.map(([f, n]) => [`\`${f}\``, n]));
  L.push("## Register", "");
  table(
    ["PR", "State", "Merged", "Commit", "Modules", "Migrations (ledger)", "Tests", "Production state", "Title"],
    [...rows]
      .sort((a, b) => b.number - a.number)
      .map((r) => [
        `#${r.number}`,
        r.state === "OPEN" && r.draft ? "OPEN draft" : r.state,
        day(r.mergedAt),
        r.mergeSha ? r.mergeSha.slice(0, 9) : "",
        r.modules.slice(0, 4).join(", ") + (r.modules.length > 4 ? ` +${r.modules.length - 4}` : ""),
        r.migrations.map((m) => `${m.file} (${m.ledger})`).join("; "),
        r.tests.length || "",
        prodState(r),
        r.title,
      ]),
  );
  return `${L.join("\n").trimEnd()}\n`;
}

export function renderCsv(rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = [
    "number", "state", "draft", "created_at", "merged_at", "merge_sha", "base", "modules", "files_total", "migrations",
    "tests", "deploy_state", "deploy_run", "deploy_sha", "deploy_at", "functions", "title",
  ];
  const lines = [head.join(",")];
  for (const r of [...rows].sort((a, b) => a.number - b.number)) {
    lines.push(
      [
        r.number, r.state, r.draft, r.createdAt, r.mergedAt, r.mergeSha, r.base, r.modules.join(";"), r.filesTotal,
        r.migrations.map((m) => `${m.file}:${m.ledger}`).join(";"), r.tests.length, r.deployState,
        r.deploy?.run, r.deploy?.sha, r.deploy?.at, r.functions.map((f) => `${f.id}:${f.status}:${f.confidence}`).join(";"), r.title,
      ].map(q).join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Fetching (read-only; cached under node_modules/.cache/system-register)
// ---------------------------------------------------------------------------

const run = promisify(execFile);
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const gh = async (args) => JSON.parse((await run("gh", args, { cwd: ROOT, maxBuffer: 1 << 28 })).stdout);
const readCache = (name, fallback) => {
  const f = join(CACHE_DIR, name);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fallback;
};
const writeCache = (name, data) => {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, name), JSON.stringify(data));
};
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

const PR_QUERY = `query($owner:String!,$name:String!,$after:String,$order:IssueOrderField!,$dir:OrderDirection!){
  repository(owner:$owner,name:$name){pullRequests(first:50,after:$after,orderBy:{field:$order,direction:$dir}){
    pageInfo{hasNextPage endCursor}
    nodes{number title state isDraft createdAt updatedAt closedAt mergedAt baseRefName mergeCommit{oid}
      labels(first:20){nodes{name}} files(first:100){totalCount nodes{path changeType}}}}}}`;

async function fetchPullRequests(owner, name, refresh) {
  const cache = refresh ? { fetchedAt: null, prs: {} } : readCache("prs.json", { fetchedAt: null, prs: {} });
  // Incremental: newest-updated first, back to an hour before the last fetch.
  const since = cache.fetchedAt ? new Date(new Date(cache.fetchedAt).getTime() - 3600e3).toISOString() : null;
  const startedAt = new Date().toISOString();
  let after = null;
  for (;;) {
    const args = ["api", "graphql", "-f", `query=${PR_QUERY}`, "-F", `owner=${owner}`, "-F", `name=${name}`,
      "-F", `order=${since ? "UPDATED_AT" : "CREATED_AT"}`, "-F", `dir=${since ? "DESC" : "ASC"}`];
    if (after) args.push("-F", `after=${after}`);
    const page = (await gh(args)).data.repository.pullRequests;
    let stop = false;
    for (const n of page.nodes) {
      if (since && n.updatedAt < since) {
        stop = true;
        break;
      }
      cache.prs[n.number] = {
        number: n.number, title: n.title, state: n.state, isDraft: n.isDraft, createdAt: n.createdAt, closedAt: n.closedAt,
        mergedAt: n.mergedAt, baseRefName: n.baseRefName, mergeSha: n.mergeCommit?.oid ?? null,
        labels: n.labels.nodes.map((l) => l.name), filesTotal: n.files.totalCount,
        files: n.files.nodes.map((f) => ({ path: f.path, changeType: f.changeType })),
      };
    }
    process.stderr.write(`\rpull requests: ${Object.keys(cache.prs).length}`);
    if (stop || !page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  process.stderr.write("\n");
  // More than 100 files: the merge commit's own diff (squash merges), else the REST file list.
  const big = Object.values(cache.prs).filter((p) => p.filesTotal > p.files.length);
  await pool(big, 4, async (p) => {
    try {
      if (p.state === "MERGED" && p.mergeSha) {
        const out = git("diff-tree", "--no-commit-id", "--name-status", "-r", "--root", "-m", "--first-parent", p.mergeSha);
        p.files = out.split("\n").filter(Boolean).map((l) => {
          const [st, ...paths] = l.split("\t");
          return { path: paths.at(-1), changeType: st[0] === "A" ? "ADDED" : st[0] === "D" ? "DELETED" : "MODIFIED" };
        });
      } else {
        const pages = await gh(["api", "--paginate", "--slurp", `repos/${owner}/${name}/pulls/${p.number}/files?per_page=100`]);
        p.files = pages.flat().map((f) => ({ path: f.filename, changeType: f.status === "added" ? "ADDED" : f.status.toUpperCase() }));
      }
    } catch {
      /* keep the first 100; filesTotal still says how many there were */
    }
  });
  cache.fetchedAt = startedAt;
  writeCache("prs.json", cache);
  return Object.values(cache.prs);
}

async function fetchDeploys(owner, name, refresh) {
  const cache = refresh ? { runs: {} } : readCache("deploys.json", { runs: {} });
  for (let page = 1; ; page++) {
    const r = await gh(["api", `repos/${owner}/${name}/actions/workflows/${DEPLOY_WORKFLOW}/runs?per_page=100&page=${page}`]);
    let fresh = false;
    for (const w of r.workflow_runs) {
      if (cache.runs[w.id]?.status === "completed") continue;
      fresh = true;
      cache.runs[w.id] = { run: w.id, status: w.status, conclusion: w.conclusion, headSha: w.head_sha, at: w.updated_at, event: w.event };
    }
    if (!fresh || r.workflow_runs.length < 100) break;
  }
  // A successful run can still skip shipping (never deploy backwards): read the ship step, and
  // the deployed sha from the artifact name (a manual dispatch may deploy another sha).
  const todo = Object.values(cache.runs).filter((x) => x.status === "completed" && x.conclusion === "success" && x.shipped === undefined);
  await pool(todo, 6, async (x) => {
    const jobs = await gh(["api", `repos/${owner}/${name}/actions/runs/${x.run}/jobs`]);
    const step = jobs.jobs.flatMap((j) => j.steps ?? []).find((st) => SHIP_STEP.test(st.name));
    x.shipped = step?.conclusion === "success";
    if (step?.completed_at) x.at = step.completed_at;
    const arts = await gh(["api", `repos/${owner}/${name}/actions/runs/${x.run}/artifacts`]);
    x.sha = arts.artifacts.map((a) => a.name.match(/^standalone-([0-9a-f]{40})$/)?.[1]).find(Boolean) ?? x.headSha;
  });
  writeCache("deploys.json", cache);
  return Object.values(cache.runs)
    .filter((x) => x.shipped)
    .map((x) => ({ run: x.run, sha: x.sha, at: x.at }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const repo = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], { cwd: ROOT, encoding: "utf8" });
  const [owner, name] = repo.trim().split("/");
  git("fetch", "--quiet", "origin", "main");
  const mainSha = git("rev-parse", "origin/main");
  const order = new Map(git("rev-list", "--first-parent", "--reverse", "origin/main").split("\n").map((sha, i) => [sha, i]));
  const snapshot = JSON.parse(readFileSync(LEDGER_SNAPSHOT, "utf8"));
  const functionRows = parseFunctionRegister(readFileSync(FUNCTION_REGISTER, "utf8"));
  const [prs, deploys] = await Promise.all([fetchPullRequests(owner, name, refresh), fetchDeploys(owner, name, refresh)]);
  const ctx = { snapshot, order, deploys, functionRows };
  const rows = prs.map((p) => buildRow(p, ctx)).sort((a, b) => a.number - b.number);
  const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const s = summarize(rows, new Date(generatedAt));
  const meta = { generatedAt, mainSha, snapshotReadAt: snapshot.read_at, snapshotRows: snapshot.rows.length, firstDeployAt: deploys[0]?.at };
  writeFileSync(join(OUT_DIR, "SYSTEM_REGISTER.md"), renderMarkdown(rows, s, meta));
  writeFileSync(join(OUT_DIR, "system-register.csv"), renderCsv(rows));
  writeFileSync(
    join(OUT_DIR, "system-register.json"),
    `{"generatedAt":${JSON.stringify(generatedAt)},"mainSha":${JSON.stringify(mainSha)},"canonicalStatus":"docs/program/FUNCTION_REGISTER.md","rows":[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]}\n`,
  );
  process.stderr.write(`${rows.length} PRs, ${deploys.length} VPS deploys → docs/program/SYSTEM_REGISTER.md\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
