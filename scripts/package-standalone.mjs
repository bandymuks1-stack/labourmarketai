#!/usr/bin/env node
/**
 * Package the Next.js standalone build of apps/web into a self-contained
 * directory that runs with `node apps/web/server.js` on any Node >= 20 host
 * (Hostinger Web Apps "Other" framework with an entry file, a VPS, a container).
 *
 * Why: the full build peaks at ~3.7 GB RAM and ~10.5 min on a desktop, which
 * does not fit a shared host's build sandbox (Hostinger: 15 min per step on a
 * 3 GB plan). Build once elsewhere (Linux, same Node major as the host),
 * then ship the artefact.
 *
 * Usage (after `pnpm -C apps/web build` on Linux):
 *   node scripts/package-standalone.mjs [outDir]
 *
 * It never reads or writes env files: NEXT_PUBLIC_* values are baked in at
 * build time, server-only secrets are supplied by the host's own env store.
 */
import { cpSync, existsSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const webDir = path.join(repoRoot, "apps", "web");
const standalone = path.join(webDir, ".next", "standalone");
const outDir = path.resolve(process.argv[2] ?? path.join(repoRoot, ".standalone-dist"));

const serverJs = path.join(standalone, "apps", "web", "server.js");
if (!existsSync(serverJs)) {
  console.error(`standalone server not found at ${serverJs} — run the build with output: "standalone" first`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
// dereference: never carry a symlink/junction into the artefact.
cpSync(standalone, outDir, { recursive: true, dereference: true });
cpSync(path.join(webDir, ".next", "static"), path.join(outDir, "apps", "web", ".next", "static"), {
  recursive: true,
});
if (existsSync(path.join(webDir, "public"))) {
  cpSync(path.join(webDir, "public"), path.join(outDir, "apps", "web", "public"), { recursive: true });
}

// Strip any env file the tracer may have copied: secrets never ship in the artefact.
for (const dir of [outDir, path.join(outDir, "apps", "web")]) {
  for (const f of readdirSync(dir)) {
    if (f.startsWith(".env")) rmSync(path.join(dir, f), { force: true });
  }
}

// A dependency-free root manifest: the host's install step becomes a no-op and
// nothing tries to resolve the monorepo's pnpm workspace.
writeFileSync(
  path.join(outDir, "package.json"),
  JSON.stringify(
    {
      name: "labourmarket-web-standalone",
      private: true,
      engines: { node: ">=20" },
      scripts: { start: "node apps/web/server.js" },
    },
    null,
    2,
  ) + "\n",
);

console.log(`standalone artefact ready: ${outDir}`);
console.log("start with: node apps/web/server.js   (PORT / HOSTNAME from the host)");
