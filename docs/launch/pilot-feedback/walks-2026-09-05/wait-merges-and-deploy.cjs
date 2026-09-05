// Bounded watcher: waits until the given PRs are MERGED (or closed) and production /api/health serves origin/main,
// then exits 0 with the served SHA. Polls gh every 60 s and health every 20 s; gives up after MAX_MIN minutes (exit 2).
// Usage: node wait-merges-and-deploy.cjs 1536 1537 1538
const { execSync } = require("node:child_process");
const prs = process.argv.slice(2).filter((x) => /^\d+$/.test(x));
const MAX_MIN = Number(process.env.MAX_MIN || 45);
const t0 = Date.now();
const sh = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));
(async () => {
  let open = prs.slice();
  while (open.length && Date.now() - t0 < MAX_MIN * 60000) {
    const still = [];
    for (const n of open) {
      let st = "UNKNOWN";
      try { st = sh(`gh pr view ${n} --json state,mergeable --jq '"\\(.state) \\(.mergeable)"'`); } catch {}
      if (!/^MERGED|^CLOSED/.test(st)) still.push(n);
      if (/CONFLICTING/.test(st)) log({ pr: n, state: st, note: "CONFLICT — needs a rebase" });
    }
    if (still.length) { log({ waitingOn: still }); await new Promise((r) => setTimeout(r, 60000)); }
    open = still;
  }
  if (open.length) { log({ result: "TIMEOUT_PRS_OPEN", open }); process.exit(2); }
  let main = "";
  try { sh("git fetch -q origin"); main = sh("git rev-parse --short=8 origin/main"); } catch {}
  log({ allMerged: true, originMain: main });
  while (Date.now() - t0 < MAX_MIN * 60000) {
    let build = "";
    try { build = (await (await fetch("https://labourmarket.ai/api/health")).json()).build; } catch { build = "err"; }
    if (main && String(build).startsWith(main)) { log({ result: "PROD_ON", build }); process.exit(0); }
    log({ prodBuild: build, want: main });
    await new Promise((r) => setTimeout(r, 20000));
  }
  log({ result: "TIMEOUT_DEPLOY", want: main }); process.exit(2);
})();
