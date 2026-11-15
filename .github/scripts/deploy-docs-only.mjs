#!/usr/bin/env node
// May the automatic deploy skip this commit? Yes only when everything between the build production
// serves and this commit is under docs/. It compares with production, not with the previous commit, so
// a code commit whose own deploy failed or was superseded still ships with the next docs commit. Any
// doubt means deploy: this never skips on an error, an unreadable answer or a long list.
//
//   node deploy-docs-only.mjs <sha> [<live build>]
//
// Prints `skip=true` or `skip=false`, a space and the reason. Reads only: public /api/health and the
// compare API. Nothing in docs/ reaches the running app; the Next build traces imports, and no route
// or lib module reads docs/.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** GitHub returns at most 300 files for a comparison; a list that long may be cut. */
export const MAX_FILES = 300;

const isDocs = (path) => typeof path === "string" && path.startsWith("docs/");

/**
 * @param {{ status?: string, files?: { filename?: string, previous_filename?: string }[] }} compare
 * @returns {{ skip: boolean, reason: string }}
 */
export function judgeDocsOnly({ status, files } = {}) {
  if (status !== "ahead") return { skip: false, reason: `not ahead of production (${status ?? "unknown"})` };
  if (!Array.isArray(files) || files.length === 0) return { skip: false, reason: "no file list" };
  if (files.length >= MAX_FILES) return { skip: false, reason: `${files.length} files, the list may be cut` };
  const other = files.find((f) => !isDocs(f.filename) || (f.previous_filename && !isDocs(f.previous_filename)));
  if (other) return { skip: false, reason: `changes ${other.filename}` };
  return { skip: true, reason: `${files.length} files, all under docs/` };
}

/** The build production serves, only from a healthy answer. */
export function liveBuildOf(report) {
  const build = report?.build;
  return report?.ok === true && typeof build === "string" && /^[0-9a-f]{7,40}$/.test(build) ? build : null;
}

function compare(repo, live, sha) {
  const files = [];
  let status;
  for (let page = 1; page <= Math.ceil(MAX_FILES / 100); page++) {
    const body = JSON.parse(
      execFileSync("gh", ["api", `repos/${repo}/compare/${live}...${sha}?per_page=100&page=${page}`], {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      }),
    );
    status = body.status;
    const got = body.files ?? [];
    files.push(...got);
    if (got.length < 100) break;
  }
  return { status, files };
}

async function main() {
  const [sha, given] = process.argv.slice(2);
  const repo = process.env.GITHUB_REPOSITORY ?? "bandymuks1-stack/labourmarketai";
  let live = given;
  if (!live) {
    const res = await fetch("https://labourmarket.ai/api/health", { signal: AbortSignal.timeout(20_000) });
    live = res.ok ? liveBuildOf(await res.json()) : null;
    if (!live) return { skip: false, reason: "production's build is unreadable or it is not healthy" };
  }
  const verdict = judgeDocsOnly(compare(repo, live, sha));
  return { ...verdict, reason: `${verdict.reason}, compared with live ${live.slice(0, 9)}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let verdict;
  try {
    verdict = await main();
  } catch (e) {
    verdict = { skip: false, reason: `check failed (${e?.name ?? "error"})` };
  }
  console.log(`skip=${verdict.skip} ${verdict.reason}`);
}
