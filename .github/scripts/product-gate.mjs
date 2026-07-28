#!/usr/bin/env node
// PRODUCT GATE — Product Constitution enforcement (P0).
//
// Constitution: docs/PRODUCT_CONSTITUTION.md §12 (axioms) + §13 (this gate).
//
// WHAT IT DOES. For every PR it diffs against the base and looks for NEW
// product surfaces: screens, menu items, dashboard elements, popups, modules,
// wizards and persistent cards. Each one must be declared in
// apps/web/lib/product-gate/surface-registry.ts with five answers:
// origin_axiom, purpose, why_not_chat, why_not_existing_component, owner.
//
// It then runs the automatic RED rules (§13.3). Any violation →
// PRODUCT_REVIEW_REQUIRED, exit 1, merge blocked.
//
// It always writes PRODUCT_ARCHITECTURE_DIFF.md so a reviewer sees WHAT
// appeared and WHY, without reading the diff.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not judge taste, it does not
// rewrite code, and it does not pretend the heuristic rules are proofs — the
// report marks each finding `certain` or `heuristic`, and §9 of the audit
// lists what only a human can decide.
//
// Usage:
//   node .github/scripts/product-gate.mjs              # analyse the PR diff
//   node .github/scripts/product-gate.mjs --self-test  # prove the rules fire
//
// Env: BASE_SHA (or BASE_REF) = base to diff against (default origin/main).
// No network, no env secrets, no writes outside PRODUCT_ARCHITECTURE_DIFF.md.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const REPO_ROOT = process.cwd();
const REGISTRY = "apps/web/lib/product-gate/surface-registry.ts";
const AXIOMS = "apps/web/lib/product-gate/axioms.ts";
const NAV = "apps/web/lib/config/navigation.ts";
const MODULES = "apps/web/lib/dashboard/dashboard-module-registry.ts";
const DIFF_OUT = "PRODUCT_ARCHITECTURE_DIFF.md";

// ── detection patterns ──────────────────────────────────────────────────────

const IS_SCREEN = /^apps\/web\/app\/.*\/page\.tsx$/;
const IS_COMPONENT = /^apps\/web\/components\/.*\.tsx$/;

const WIZARD_RE = /\b(currentStep|stepIndex|useWizard|Wizard|<Stepper|activeStep)\b/;
const POPUP_RE = /role=["']dialog["']|<Dialog\b|<Modal\b|showModal\(/;
const FORM_RE = /<form\b|onSubmit=|FormData\(/;
const CARD_RE = /-card\.tsx$/;
const CHAT_ROOT = "apps/web/app/[locale]/dashboard/page.tsx";

/** A screen that behaves as a primary/dashboard surface. */
const DASHBOARD_LIKE = /\/dashboard\/(overview|home|control|visual-os|start|hub|main)\//;
const JOURNAL_MODULE = /\/dashboard\/journal\//;

// ── git helpers ─────────────────────────────────────────────────────────────

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function changedFiles(base) {
  const range = `${base}...HEAD`;
  const added = git(["diff", "--diff-filter=A", "--name-only", range])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const modified = git(["diff", "--diff-filter=M", "--name-only", range])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const deleted = git(["diff", "--diff-filter=D", "--name-only", range])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return { added, modified, deleted };
}

function addedLines(base, file) {
  try {
    const patch = git(["diff", `${base}...HEAD`, "--unified=0", "--", file]);
    return patch
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1));
  } catch {
    return [];
  }
}

function removedLines(base, file) {
  try {
    const patch = git(["diff", `${base}...HEAD`, "--unified=0", "--", file]);
    return patch
      .split("\n")
      .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      .map((l) => l.slice(1));
  } catch {
    return [];
  }
}

function read(file) {
  const p = `${REPO_ROOT}/${file}`;
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

// ── declaration lookup (regex over the registry — no TS runtime needed) ─────

function declaredIds() {
  const src = read(REGISTRY);
  const block = /PRODUCT_SURFACES[\s\S]*?\n\] as const;/.exec(src)?.[0] ?? "";
  return new Set([...block.matchAll(/id:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]));
}

/** Route id for a screen file: apps/web/app/[locale]/dashboard/x/page.tsx → /dashboard/x */
function routeOf(file) {
  return (
    "/" +
    file
      .replace(/^apps\/web\/app\//, "")
      .replace(/\/page\.tsx$/, "")
      .replace(/\[locale\]\/?/, "")
      .replace(/\(([^)]+)\)\//g, "")
      .replace(/^\/+/, "")
  );
}

// ── the rules ───────────────────────────────────────────────────────────────

function analyse(base) {
  const { added, modified, deleted } = changedFiles(base);
  const declared = declaredIds();
  const findings = [];
  const surfaces = [];

  const add = (code, axiom, what, detail, certainty) =>
    findings.push({ code, axiom, what, detail, certainty });

  // 1. NEW SCREENS ---------------------------------------------------------
  for (const file of added.filter((f) => IS_SCREEN.test(f))) {
    const route = routeOf(file);
    const src = read(file);
    const isRedirect = /redirect\(/.test(src) && src.length < 2000;
    surfaces.push({ kind: "screen", id: route, file, declared: declared.has(route) });
    if (isRedirect) continue; // an alias is not a new surface

    if (!declared.has(route)) {
      add(
        "undeclared_surface",
        "A-09",
        route,
        "new screen with no declaration in the surface registry (origin_axiom / purpose / why_not_chat / why_not_existing_component / owner)",
        "certain",
      );
    }
    if (DASHBOARD_LIKE.test(file + "/")) {
      add("second_dashboard", "A-01", route, "adds another dashboard-like primary surface", "certain");
    }
    if (JOURNAL_MODULE.test(file)) {
      add("new_journal_module", "A-08", route, "adds another Journal module surface", "certain");
    }
    if (WIZARD_RE.test(src)) {
      add(
        "wizard_replaceable_by_chat",
        "A-04",
        route,
        "new wizard/stepper screen — a conversation collects the same data one question at a time",
        "heuristic",
      );
    }
    if (FORM_RE.test(src) && !declared.has(route)) {
      add(
        "form_replaceable_by_dialog",
        "A-04",
        route,
        "new form screen — the AI dialog is the declared collection path",
        "heuristic",
      );
    }
  }

  // 2. NEW COMPONENTS: popups, wizards, persistent cards -------------------
  for (const file of added.filter((f) => IS_COMPONENT.test(f))) {
    const src = read(file);
    const id = file.replace(/^apps\/web\//, "");
    if (POPUP_RE.test(src)) {
      surfaces.push({ kind: "popup", id, file, declared: declared.has(id) });
      if (!declared.has(id)) {
        add("undeclared_surface", "A-09", id, "new popup/modal with no declaration", "certain");
      }
    }
    if (WIZARD_RE.test(src)) {
      surfaces.push({ kind: "wizard", id, file, declared: declared.has(id) });
      if (!declared.has(id)) {
        add(
          "wizard_replaceable_by_chat",
          "A-04",
          id,
          "new wizard component with no declaration of why a conversation cannot do it",
          "certain",
        );
      }
    }
    if (CARD_RE.test(file)) {
      surfaces.push({ kind: "persistent_card", id, file, declared: declared.has(id) });
      if (!declared.has(id)) {
        add("undeclared_surface", "A-09", id, "new persistent card with no declaration", "certain");
      }
    }
    // A-07: the profile is not a log of completed actions.
    if (/components\/app\/profile/.test(file) && /completed|done|finished|atlikt/i.test(src)) {
      add(
        "profile_shows_completed_action",
        "A-07",
        id,
        "profile surface renders completed-action state — completed work belongs to the journal/engagement record",
        "heuristic",
      );
    }
  }

  // 3. NAVIGATION: a new persistent menu item ------------------------------
  if (modified.includes(NAV) || added.includes(NAV)) {
    const plus = addedLines(base, NAV);
    const newItems = plus.filter((l) => /id:\s*["'`]/.test(l));
    for (const line of newItems) {
      const id = /id:\s*["'`]([^"'`]+)["'`]/.exec(line)?.[1] ?? "unknown";
      surfaces.push({ kind: "menu_item", id, file: NAV, declared: declared.has(id) });
      if (!declared.has(id)) {
        add(
          "new_persistent_menu",
          "A-03",
          id,
          "new persistent navigation item with no declaration — the core loop is chat → journal → calendar → messages",
          "certain",
        );
      }
    }
    // A-01: chat may not lose its place in the core loop.
    const minus = removedLines(base, NAV);
    if (minus.some((l) => /"overview"/.test(l)) && !plus.some((l) => /"overview"/.test(l))) {
      add("chat_importance_reduced", "A-01", NAV, "chat/overview removed from the core navigation", "certain");
    }
  }

  // 4. DASHBOARD MODULES ---------------------------------------------------
  if (modified.includes(MODULES) || added.includes(MODULES)) {
    for (const line of addedLines(base, MODULES)) {
      const id = /^\s*id:\s*["'`]([^"'`]+)["'`]/.exec(line)?.[1];
      if (!id) continue;
      surfaces.push({ kind: "dashboard_element", id, file: MODULES, declared: declared.has(id) });
      if (!declared.has(id)) {
        add("undeclared_surface", "A-09", id, "new dashboard module with no declaration", "certain");
      }
    }
  }

  // 5. CHAT IMPORTANCE -----------------------------------------------------
  if (deleted.includes(CHAT_ROOT)) {
    add("chat_importance_reduced", "A-01", CHAT_ROOT, "the conversation root was deleted", "certain");
  }
  if (modified.includes(CHAT_ROOT)) {
    const minus = removedLines(base, CHAT_ROOT);
    if (minus.some((l) => /ConversationChat/.test(l))) {
      const plus = addedLines(base, CHAT_ROOT);
      if (!plus.some((l) => /ConversationChat/.test(l))) {
        add("chat_importance_reduced", "A-01", CHAT_ROOT, "the conversation component was removed from /dashboard", "certain");
      }
    }
  }

  // 6. REGISTRY SELF-CONSISTENCY -------------------------------------------
  const axiomSrc = read(AXIOMS);
  const knownAxioms = new Set([...axiomSrc.matchAll(/id:\s*"(A-\d\d)"/g)].map((m) => m[1]));
  const regSrc = read(REGISTRY);
  const block = /PRODUCT_SURFACES[\s\S]*?\n\] as const;/.exec(regSrc)?.[0] ?? "";
  for (const m of block.matchAll(/originAxiom:\s*["'`]([^"'`]+)["'`]/g)) {
    if (!knownAxioms.has(m[1])) {
      add("unknown_axiom", "A-09", m[1], "declaration cites an axiom that does not exist", "certain");
    }
  }
  const actions = [...block.matchAll(/ownsAction:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  const dupes = actions.filter((a, i) => actions.indexOf(a) !== i);
  for (const d of new Set(dupes)) {
    add("duplicate_action", "A-08", d, "two surfaces claim to own the same action", "certain");
  }

  return { findings, surfaces, changed: { added, modified, deleted } };
}

// ── architecture diff ───────────────────────────────────────────────────────

function writeArchitectureDiff({ findings, surfaces }, status) {
  const rows =
    surfaces.length === 0
      ? "_No new product surface was added by this PR._"
      : [
          "| What appeared | Kind | Why it appeared | Why it cannot be a conversation | Permitting axiom | Declared |",
          "|---|---|---|---|---|---|",
          ...surfaces.map((s) => {
            const src = read(REGISTRY);
            const dec = new RegExp(
              `id:\\s*["'\`]${s.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`][\\s\\S]*?owner:`,
            ).exec(src)?.[0];
            const field = (name) =>
              dec ? (new RegExp(`${name}:\\s*\n?\\s*["'\`]([^"'\`]+)`).exec(dec)?.[1] ?? "—") : "—";
            return `| \`${s.id}\` | ${s.kind} | ${field("purpose")} | ${field("whyNotChat")} | ${field("originAxiom")} | ${s.declared ? "yes" : "**NO**"} |`;
          }),
        ].join("\n");

  const violations =
    findings.length === 0
      ? "_No axiom violation detected._"
      : [
          "| Finding | Axiom | Where | Certainty | Detail |",
          "|---|---|---|---|---|",
          ...findings.map(
            (f) => `| \`${f.code}\` | ${f.axiom} | \`${f.what}\` | ${f.certainty} | ${f.detail} |`,
          ),
        ].join("\n");

  const body = `# PRODUCT ARCHITECTURE DIFF

> Generated by \`.github/scripts/product-gate.mjs\`. Constitution:
> \`docs/PRODUCT_CONSTITUTION.md\` §12–§13.

**Status: ${status}**

## What appeared

${rows}

## Axiom checks

${violations}

## Rules that were checked

Every rule in \`docs/PRODUCT_CONSTITUTION.md\` §13.3 ran against this diff:
second dashboard · new Journal module · new persistent menu · duplicated action ·
profile showing a completed action · same function in several places · wizard
replaceable by conversation · form replaceable by an AI dialog · reduced chat
importance · UI the constitution does not permit.

\`certainty: heuristic\` means the gate found a pattern a human must judge —
it blocks the merge, and the reviewer either declares the surface or removes it.
`;
  writeFileSync(`${REPO_ROOT}/${DIFF_OUT}`, body, "utf8");
}

// ── self-test: prove each rule can actually fire ────────────────────────────

function selfTest() {
  const cases = [
    ["second_dashboard", DASHBOARD_LIKE.test("apps/web/app/[locale]/dashboard/visual-os/page.tsx/")],
    ["new_journal_module", JOURNAL_MODULE.test("apps/web/app/[locale]/dashboard/journal/voice/page.tsx")],
    ["wizard", WIZARD_RE.test("const [currentStep, setStep] = useState(0)")],
    ["popup", POPUP_RE.test('<div role="dialog">')],
    ["form", FORM_RE.test("<form onSubmit={save}>")],
    ["card", CARD_RE.test("apps/web/components/app/worker-card.tsx")],
    ["screen", IS_SCREEN.test("apps/web/app/[locale]/dashboard/x/page.tsx")],
    ["route", routeOf("apps/web/app/[locale]/dashboard/x/page.tsx") === "/dashboard/x"],
    ["route_group", routeOf("apps/web/app/[locale]/(marketing)/pricing/page.tsx") === "/pricing"],
  ];
  const failed = cases.filter(([, ok]) => !ok).map(([n]) => n);
  if (failed.length > 0) {
    console.error(`::error::product-gate self-test FAILED for: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`product-gate self-test: ${cases.length}/${cases.length} detectors fire correctly.`);
  process.exit(0);
}

// ── main ────────────────────────────────────────────────────────────────────

if (process.argv.includes("--self-test")) selfTest();

const base = process.env.BASE_SHA || process.env.BASE_REF || "origin/main";
let result;
try {
  result = analyse(base);
} catch (e) {
  console.error(`::error::product-gate could not diff against ${base}: ${e.message}`);
  process.exit(1);
}

const { findings, surfaces } = result;
const status = findings.length > 0 ? "PRODUCT_REVIEW_REQUIRED" : "GREEN";
writeArchitectureDiff(result, status);

console.log(`product-gate: ${surfaces.length} new product surface(s) in this diff`);
for (const s of surfaces) {
  console.log(`  • ${s.kind.padEnd(18)} ${s.id} ${s.declared ? "[declared]" : "[UNDECLARED]"}`);
}

if (findings.length === 0) {
  console.log("product-gate: GREEN — no axiom violation.");
  console.log(`product-gate: wrote ${DIFF_OUT}`);
  process.exit(0);
}

console.log("");
for (const f of findings) {
  console.log(
    `::error file=${f.what}::[${f.code}] ${f.axiom} — ${f.detail} (certainty: ${f.certainty})`,
  );
}
console.log("");
console.log(`product-gate: PRODUCT_REVIEW_REQUIRED — ${findings.length} violation(s). Merge blocked.`);
console.log("Declare the surface in apps/web/lib/product-gate/surface-registry.ts");
console.log("(origin_axiom, purpose, why_not_chat, why_not_existing_component, owner) or remove it.");
process.exit(1);
