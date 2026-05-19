/**
 * labourmarket.ai — foundation guards.
 *
 * Fails the build if the canonical structure is violated. Run: `npm run check`.
 *
 * NOTE: this file intentionally contains the forbidden phrases inside its own
 * patterns, so it MUST never scan itself. The wording scan is hard-scoped to
 * SCAN_ROOTS (src, docs, README.md) and the scripts/ directory is excluded.
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename, relative } from "node:path";

const ROOT = process.cwd();
const SRC_APP = join(ROOT, "src", "app");
const SRC_COMPONENTS = join(ROOT, "src", "components");

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  "scripts",
  "dist",
  "build",
]);

const failures: string[] = [];
function fail(rule: string, detail: string) {
  failures.push(`✗ [${rule}] ${detail}`);
}

async function walk(
  dir: string,
  match: (f: string) => boolean,
): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, match)));
    else if (match(full)) out.push(full);
  }
  return out;
}

/** Route segment names that have a page.tsx under src/app. */
async function routeSegments(): Promise<{ seg: string; path: string }[]> {
  const pages = await walk(SRC_APP, (f) => basename(f) === "page.tsx");
  return pages.map((p) => {
    const rel = relative(SRC_APP, p).replace(/\\/g, "/");
    const parts = rel.split("/");
    parts.pop(); // drop page.tsx
    const seg = parts.length ? parts[parts.length - 1] : "(root)";
    return { seg, path: rel };
  });
}

async function checkRoutes() {
  const segs = await routeSegments();

  const profileRoutes = segs.filter((s) => /^profile$/i.test(s.seg));
  if (profileRoutes.length !== 1) {
    fail(
      "single-profile-route",
      `expected exactly 1 profile route, found ${profileRoutes.length}: ${profileRoutes
        .map((r) => r.path)
        .join(", ")}`,
    );
  }

  const avatarRoutes = segs.filter((s) => /avatar/i.test(s.seg));
  if (avatarRoutes.length > 0) {
    fail(
      "no-separate-avatar-route",
      `avatar must not be a route (it is part of the player card): ${avatarRoutes
        .map((r) => r.path)
        .join(", ")}`,
    );
  }

  const COMM = /^(communication|inbox|messages?|dm|chat|conversations?|threads?)$/i;
  const commRoutes = segs.filter((s) => COMM.test(s.seg));
  if (commRoutes.length !== 1 || commRoutes[0].seg !== "communication") {
    fail(
      "single-communication-route",
      `expected exactly 1 communication route named "communication", found: ${commRoutes
        .map((r) => `${r.seg} (${r.path})`)
        .join(", ")}`,
    );
  }
}

/** Wording + fake-AI scan. Hard-scoped — never includes scripts/. */
async function checkWording() {
  const SCAN_ROOTS = [join(ROOT, "src"), join(ROOT, "docs")];
  const files: string[] = [];
  for (const r of SCAN_ROOTS) {
    files.push(
      ...(await walk(r, (f) => /\.(tsx?|css|md|mdx)$/i.test(f))),
    );
  }
  const readme = join(ROOT, "README.md");
  if (existsSync(readme)) files.push(readme);

  // Built from fragments so the literal phrases never sit in this source as
  // one scannable string — defence-in-depth even though scripts/ is excluded.
  const banned: { rule: string; re: RegExp }[] = [
    { rule: "no-manual-" + "review", re: new RegExp("manual\\s+review", "i") },
    {
      rule: "no-manual-" + "approval",
      re: new RegExp("manual\\s+approval", "i"),
    },
    { rule: "no-owner-" + "review", re: new RegExp("owner\\s+review", "i") },
  ];

  const fakeAi: RegExp[] = [
    /\bai[-\s]?powered\b/i,
    /\bpowered\s+by\s+ai\b/i,
    /\bai[-\s]?driven\b/i,
    /\bour\s+ai\b/i,
    /\bai\s+(engine|model|brain|magic|matching)\b/i,
    /\bgpt-?\d/i,
    /\bchatgpt\b/i,
    /\bllm\b/i,
    /\bneural\s+net/i,
    /\bmachine[-\s]learning\b/i,
  ];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    for (const b of banned) {
      if (b.re.test(text)) fail(b.rule, `forbidden wording in ${rel}`);
    }
    for (const re of fakeAi) {
      if (re.test(text)) {
        fail("no-fake-ai-claims", `AI capability claim in ${rel} (${re})`);
        break;
      }
    }
  }
}

/** Exactly one ProfilePlayerCard + one CompanyPlayerCard; no other *PlayerCard. */
async function checkPlayerCards() {
  const files = await walk(SRC_COMPONENTS, (f) => /\.tsx?$/.test(f));
  const defs = new Map<string, string[]>();
  const def =
    /export\s+(?:async\s+)?(?:function|const)\s+(\w*PlayerCard)\b/g;

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    for (const m of text.matchAll(def)) {
      const name = m[1];
      defs.set(name, [...(defs.get(name) ?? []), rel]);
    }
    if (/export\s+(?:async\s+)?(?:function|const)\s+\w*Avatar\b/.test(text)) {
      fail(
        "no-separate-avatar-logic",
        `avatar must not be its own component (use the player card): ${rel}`,
      );
    }
  }

  const allowed = new Set(["ProfilePlayerCard", "CompanyPlayerCard"]);
  for (const [name, where] of defs) {
    if (!allowed.has(name)) {
      fail(
        "no-duplicate-player-card",
        `unexpected canonical card component "${name}" in ${where.join(", ")}`,
      );
    } else if (where.length !== 1) {
      fail(
        "no-duplicate-player-card",
        `"${name}" defined ${where.length}× (${where.join(", ")}) — must be 1`,
      );
    }
  }
  for (const need of allowed) {
    if (!defs.has(need)) {
      fail("no-duplicate-player-card", `missing canonical card "${need}"`);
    }
  }
}

/** Public UI copy must read human — no internal / technical terms. */
async function checkPublicLexicon() {
  const targets = [join(SRC_APP, "page.tsx")];
  targets.push(
    ...(await walk(join(SRC_COMPONENTS, "landing"), (f) =>
      /\.tsx?$/.test(f),
    )),
  );

  // Built partly from fragments so the banned literals never sit here as one
  // scannable block; scripts/ is excluded from every scan anyway.
  const banned: { rule: string; re: RegExp }[] = [
    { rule: "canonical", re: /\bcanonical\b/i },
    { rule: "deterministic", re: /\bdeterministic\b/i },
    { rule: "source-of-truth", re: new RegExp("source\\s+of\\s+truth", "i") },
    { rule: "architecture", re: /\barchitecture\b/i },
    {
      rule: "reusable-data-model",
      re: /\breusable\s+data\s+model\b/i,
    },
    { rule: "zero-queues", re: /\bzero\s+(?:\w+\s+){0,2}queues?\b/i },
    { rule: "no-duplicate-flows", re: /\bno\s+duplicate\s+flows?\b/i },
    { rule: "connected-board", re: /\bconnected\s+board\b/i },
    { rule: "fabric", re: /\bfabric\b/i },
    { rule: "living-system", re: /\bliving\s+system\b/i },
    { rule: "technical-scaffold", re: /\btechnical\s+scaffold\b/i },
    { rule: "internal-model", re: /\binternal\s+model\b/i },
  ];

  for (const file of targets) {
    if (!existsSync(file)) continue;
    const text = await readFile(file, "utf8");
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    for (const b of banned) {
      if (b.re.test(text)) {
        fail(
          "human-public-copy",
          `technical term "${b.rule}" in public UI copy: ${rel}`,
        );
      }
    }
  }
}

/** Exactly one canonical Profile model file — no duplicate profile source. */
async function checkProfileSource() {
  const files = await walk(join(ROOT, "src"), (f) => /\.tsx?$/.test(f));
  const re = /export\s+(?:interface|type)\s+Profile\b/;
  const where: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (re.test(text)) {
      where.push(relative(ROOT, file).replace(/\\/g, "/"));
    }
  }
  if (where.length !== 1) {
    fail(
      "single-profile-source",
      `expected exactly 1 Profile model file, found ${where.length}: ${where.join(", ")}`,
    );
  }
}

/** One communication area only — no parallel inbox/messages/chat component. */
async function checkCommunicationArea() {
  const files = await walk(SRC_COMPONENTS, (f) => /\.tsx?$/.test(f));
  const parallel =
    /export\s+(?:async\s+)?(?:function|const)\s+(\w*(?:Inbox|Messages|Messaging|Mailbox|Chat|Conversation|DmThread)\w*)\b/;
  const startDef =
    /export\s+(?:async\s+)?(?:function|const)\s+CommunicationStart\b/;
  let starts = 0;
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const m = text.match(parallel);
    if (m) {
      fail(
        "single-communication-area",
        `parallel communication component "${m[1]}" in ${rel}`,
      );
    }
    if (startDef.test(text)) starts += 1;
  }
  if (starts !== 1) {
    fail(
      "single-communication-area",
      `expected exactly 1 CommunicationStart, found ${starts}`,
    );
  }
}

/**
 * Public UI copy must not contradict the locked premium sports / draft /
 * scouting visual direction (constitution §2). Scoped to the public surface
 * only (landing route + landing components), like checkPublicLexicon — docs
 * legitimately say "not a SaaS template" and must not be scanned here.
 */
async function checkPremiumVisualTerms() {
  const targets = [join(SRC_APP, "page.tsx")];
  targets.push(
    ...(await walk(join(SRC_COMPONENTS, "landing"), (f) =>
      /\.tsx?$/.test(f),
    )),
  );

  const contradictory: { rule: string; re: RegExp }[] = [
    { rule: "saas-template", re: /\bsaas\s+template\b/i },
    {
      rule: "generic-template",
      re: /\bgeneric\s+(?:dashboard|saas|template|theme)\b/i,
    },
    { rule: "boilerplate", re: /\bboilerplate\b/i },
    { rule: "lorem-ipsum", re: /\blorem\s+ipsum\b/i },
    { rule: "wireframe", re: /\bwireframe\b/i },
    {
      rule: "placeholder-design",
      re: /\bplaceholder\s+(?:design|text|copy|content)\b/i,
    },
    {
      rule: "off-the-shelf-template",
      re: /\b(?:bootstrap|admin|starter)\s+template\b/i,
    },
    { rule: "default-theme", re: /\bdefault\s+theme\b/i },
    { rule: "template-look", re: /\btemplate[-\s]?look\b/i },
  ];

  for (const file of targets) {
    if (!existsSync(file)) continue;
    const text = await readFile(file, "utf8");
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    for (const c of contradictory) {
      if (c.re.test(text)) {
        fail(
          "premium-visual-direction",
          `term contradicting the locked premium visual direction "${c.rule}": ${rel}`,
        );
      }
    }
  }
}

async function main() {
  await checkRoutes();
  await checkWording();
  await checkPlayerCards();
  await checkPublicLexicon();
  await checkPremiumVisualTerms();
  await checkProfileSource();
  await checkCommunicationArea();

  if (failures.length > 0) {
    console.error("\nFoundation guards FAILED:\n");
    for (const f of failures) console.error("  " + f);
    console.error(`\n${failures.length} violation(s).\n`);
    process.exit(1);
  }
  console.log(
    "✓ Foundation guards passed (routes, wording, player cards, public copy, premium visual, single sources).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
