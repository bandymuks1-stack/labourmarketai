#!/usr/bin/env tsx
// DB validation readiness doctor — local-only, read-only.
//
// Purpose
//   PR #81 (SR-1 Tier-2 schema) was blocked twice in a row because:
//     1. Docker was not available, so `supabase start` had no local
//        target.
//     2. The Supabase CLI was linked to the PRODUCTION project, so
//        any `--linked` flag — or a CLI version that defaults
//        differently — could have hit prod.
//
//   This doctor checks those preconditions BEFORE any human (or
//   future Claude session) runs a `supabase db reset` / `db push` /
//   `db pull` / `migration up` / `apply_migration` command. It is
//   STRICTLY read-only:
//     - never invokes any `supabase` subcommand
//     - never touches a database
//     - never modifies the link state
//     - never writes any file
//
//   Exit 0 = environment looks safe for local DB validation.
//   Exit 1 = at least one blocker — do NOT proceed.
//
// Scope
//   Detects: Supabase CLI, Docker, and the local link state
//   (`supabase/.temp/linked-project.json`). Flags hard FAIL if the
//   link points at the known production project ref. All paths are
//   relative to the repo root so the script works on Windows + Unix.
//
// Use
//   pnpm -F web check:db-validation-readiness
//
//   See docs/runbooks/local-db-validation-safety.md for the full
//   safe-sequence runbook this doctor gates.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

// Production project ref for labourmarket.ai. Hard-coded so even if
// the linked-project.json is unreadable we recognise the value and
// fail loudly.
const PROD_PROJECT_REF = "gorgitwvdzxbnaxhrsrw";

type Verdict = "PASS" | "WARN" | "FAIL";
type Check = { name: string; verdict: Verdict; detail: string };

function probeCommand(cmd: string): { ok: boolean; out: string } {
  // Pipe both stdio streams so a missing binary throws cleanly and
  // doesn't pollute the doctor's own output. 5s ceiling is generous
  // for a `--version` call.
  try {
    const out = execSync(cmd, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    })
      .toString()
      .trim();
    return { ok: true, out };
  } catch {
    return { ok: false, out: "" };
  }
}

const checks: Check[] = [];

// 1. Supabase CLI presence. WARN only — the doctor itself shouldn't
//    fail just because the CLI is absent (you can still review the
//    SQL by eye). But local DB validation needs it.
{
  const probe = probeCommand("supabase --version");
  if (probe.ok) {
    checks.push({
      name: "Supabase CLI",
      verdict: "PASS",
      detail: `installed (v${probe.out})`,
    });
  } else {
    checks.push({
      name: "Supabase CLI",
      verdict: "FAIL",
      detail:
        "not on PATH. Install via `pnpm dlx supabase --help` or the official installer before continuing.",
    });
  }
}

// 2. Docker presence. Hard requirement for `supabase start` /
//    `db reset` — without it there is no local target and the CLI
//    falls back behaviour is not something we should rely on.
{
  const probe = probeCommand("docker --version");
  if (probe.ok) {
    checks.push({
      name: "Docker",
      verdict: "PASS",
      detail: probe.out,
    });
  } else {
    checks.push({
      name: "Docker",
      verdict: "FAIL",
      detail:
        "not on PATH. Local Supabase stack requires Docker. Install Docker Desktop, or use a different local Postgres target (see runbook).",
    });
  }
}

// 3. Linked-project state. This is the dangerous one — if the CLI
//    is linked to prod, a stray `--linked` flag or a CLI version
//    that changes defaults can route a destructive command at
//    production. The check is structural (read the JSON) so it
//    works even when the CLI itself is missing.
{
  const linkedPath = join(repoRoot, "supabase", ".temp", "linked-project.json");
  if (!existsSync(linkedPath)) {
    checks.push({
      name: "Supabase link state",
      verdict: "PASS",
      detail:
        "no `supabase/.temp/linked-project.json` — CLI is unlinked. Local DB commands have no remote-route fallback.",
    });
  } else {
    let parsed: { ref?: string; name?: string } = {};
    try {
      parsed = JSON.parse(readFileSync(linkedPath, "utf8"));
    } catch (e) {
      checks.push({
        name: "Supabase link state",
        verdict: "WARN",
        detail: `linked-project.json present but unreadable (${(e as Error).message}). Treat as suspicious — assume linked until proven otherwise.`,
      });
    }
    if (parsed.ref) {
      if (parsed.ref === PROD_PROJECT_REF) {
        checks.push({
          name: "Supabase link state",
          verdict: "FAIL",
          detail: `linked to PRODUCTION (ref=${parsed.ref}, name=${parsed.name ?? "?"}). Run \`supabase unlink\` from outside this workflow before any DB command, OR validate from a separate working copy. Never invoke a \`--linked\` command in this state.`,
        });
      } else {
        checks.push({
          name: "Supabase link state",
          verdict: "WARN",
          detail: `linked to ref=${parsed.ref} (name=${parsed.name ?? "?"}). NOT the known prod ref, but verify it is a staging / local-only target before running any DB command.`,
        });
      }
    }
  }
}

// Report.
const ICONS: Record<Verdict, string> = {
  PASS: "[ OK ]",
  WARN: "[WARN]",
  FAIL: "[FAIL]",
};

process.stdout.write(
  "\nDB validation readiness doctor — local-only, read-only.\n",
);
process.stdout.write("Runs no Supabase commands; touches no database.\n\n");

for (const c of checks) {
  process.stdout.write(`  ${ICONS[c.verdict]}  ${c.name}\n`);
  process.stdout.write(`           ${c.detail}\n\n`);
}

const fails = checks.filter((c) => c.verdict === "FAIL");
const warns = checks.filter((c) => c.verdict === "WARN");

if (fails.length === 0 && warns.length === 0) {
  process.stdout.write(
    "VERDICT: PASS — environment looks safe for local DB validation.\n",
  );
  process.stdout.write(
    "Still required before any `supabase db reset`:\n" +
      "  1. `supabase status` to confirm the local stack target.\n" +
      "  2. Re-read docs/runbooks/local-db-validation-safety.md.\n" +
      "  3. Owner approval per the PR #81 checklist.\n",
  );
  process.exit(0);
}

if (fails.length === 0) {
  process.stdout.write(
    `VERDICT: WARN — ${warns.length} warning(s). Resolve before running any DB command. See docs/runbooks/local-db-validation-safety.md.\n`,
  );
  // WARN still exits non-zero so CI / scripted callers treat
  // ambiguity as a stop condition.
  process.exit(1);
}

process.stdout.write(
  `VERDICT: FAIL — ${fails.length} blocker(s)${warns.length ? `, ${warns.length} warning(s)` : ""}. Do NOT run any \`supabase\` DB command on this machine until the FAIL items are resolved.\n`,
);
process.stdout.write(
  "Full safe-sequence runbook: docs/runbooks/local-db-validation-safety.md\n",
);
process.exit(1);
