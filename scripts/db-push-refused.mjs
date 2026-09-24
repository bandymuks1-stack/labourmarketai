#!/usr/bin/env node
/**
 * `pnpm db:push` — REFUSED, on purpose.
 *
 * Until 2026-09-23 this script was `supabase db push`. The Supabase CLI pushes
 * to whatever project it is LINKED to (`supabase/.temp/linked-project.json`),
 * and on the owner's machine that link is the PRODUCTION project. The repo's
 * migration filenames do not match the production ledger versions
 * (docs/APPLIED_LEDGER.md), so a push would re-run migrations that are already
 * applied. Nothing in the local checkout can tell the CLI "local only".
 *
 * There is no argument that makes this script push. It exists so that a habit,
 * a stale document or a copied command line stops HERE with an explanation,
 * instead of reaching production.
 *
 * Exit code 2 (not 1): distinguishable from a script that ran and failed.
 */

const LINES = [
  "REFUSED: `pnpm db:push` no longer runs `supabase db push`.",
  "",
  "  `supabase db push` targets the project the local CLI is LINKED to",
  "  (supabase/.temp/linked-project.json) — on the owner's machine that is",
  "  PRODUCTION. Repo migration filenames do not match the production ledger",
  "  versions, so a push would re-run migrations that are already applied.",
  "",
  "  PRODUCTION migrations are applied only via the Supabase MCP",
  "  `apply_migration`, one reviewed migration at a time, after review",
  "  (CLAUDE.md § Migrations; AGENTS.md § PROD APPLY AUTONOMY).",
  "",
  "  LOCAL database (Docker Desktop + the local stack):",
  "    npx supabase start",
  "    npx supabase db reset      # rebuilds the LOCAL db from supabase/migrations",
  "    pnpm db:fixtures:local     # local-only fixtures, loopback-guarded",
  "",
  "  Never `supabase db reset --linked`, never `supabase db push`.",
  "  See docs/DEPLOYMENT.md § Database migrations.",
];

console.error(LINES.join("\n"));
process.exit(2);
