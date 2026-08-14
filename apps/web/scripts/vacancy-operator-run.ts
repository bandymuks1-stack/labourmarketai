/**
 * VACANCY OPERATOR RUN — the command-line twin of the admin console's
 * dry-run / import buttons, for an operator working from a checkout.
 *
 *   pnpm tsx --conditions=react-server scripts/vacancy-operator-run.ts \
 *     --provider arbetsformedlingen --channel snapshot --mode dry_run
 *
 *   pnpm tsx --conditions=react-server scripts/vacancy-operator-run.ts \
 *     --provider arbetsformedlingen --channel snapshot --mode persist \
 *     --apply --i-understand-this-writes-production
 *
 * Doctrine, unchanged from the admin surface:
 *   - there is NO scheduler; every invocation is a deliberate human act;
 *   - the run goes through `runVacancyIngestionSession` — the SAME runner the
 *     admin buttons call, so kill switches, governance activation, cursor
 *     discipline and exact accounting all apply identically. This script adds
 *     NO capability the admin console lacks; it only removes the need for a
 *     browser session when the operator works from a checkout;
 *   - persist mode requires BOTH --apply and
 *     --i-understand-this-writes-production (the admin-grant-superadmin
 *     pattern) so half a pasted command cannot write production;
 *   - the provider env switch is NOT set here. The operator sets
 *     VACANCY_SOURCE_<KEY>_ENABLED in the invoking environment — the env flip
 *     stays an explicit operator act, and an un-flipped environment gets the
 *     honest `blocked / provider_disabled` result;
 *   - `--conditions=react-server` satisfies the `server-only` markers in the
 *     runner chain — correct here because this IS server-side code, running
 *     with the service-role key.
 *
 * Output: one JSON document with the session result (verbatim runner
 * accounting), the cursor row before/after, and the provider's stored row
 * count before/after. No secrets are ever printed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  runVacancyIngestionSession,
} from "../lib/vacancy-runner/vacancy-ingestion";
import { operatorRunExitCode } from "../lib/vacancy-runner/operator-run-exit";
import { getVacancyProvider } from "../lib/vacancy-sources/vacancy-provider-registry";
import type { VacancyImportChannel } from "../lib/vacancy-sources/vacancy-contract";

function loadEnvLocal(): void {
  const candidates = [
    join(process.cwd(), ".env.local"),
    join(process.cwd(), "..", "..", ".env.local"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

interface Args {
  provider: string | null;
  channel: string | null;
  mode: "dry_run" | "persist";
  apply: boolean;
  understand: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    provider: null,
    channel: null,
    mode: "dry_run",
    apply: false,
    understand: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--provider") args.provider = argv[++i] ?? null;
    else if (a === "--channel") args.channel = argv[++i] ?? null;
    else if (a === "--mode") {
      const m = argv[++i];
      if (m !== "dry_run" && m !== "persist") {
        throw new Error(`unknown --mode: ${m}`);
      }
      args.mode = m;
    } else if (a === "--apply") args.apply = true;
    else if (a === "--i-understand-this-writes-production") {
      args.understand = true;
    } else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

async function countStored(
  client: { from: (t: string) => any },
  providerKey: string,
): Promise<number | "not_provisioned"> {
  const { count, error } = await client
    .from("public_vacancies")
    .select("*", { count: "exact", head: true })
    .eq("provider_key", providerKey);
  if (error) {
    if (error.code === "42P01") return "not_provisioned";
    throw new Error(`count_failed:${error.code ?? "unknown"}`);
  }
  return count ?? 0;
}

async function readCursorRow(
  client: { from: (t: string) => any },
  providerKey: string,
  channel: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await client
    .from("vacancy_import_cursors")
    .select(
      "channel, cursor_value, last_run_at, last_success_at, last_failure_at, last_failure_code, consecutive_failures",
    )
    .eq("provider_key", providerKey)
    .eq("channel", channel)
    .maybeSingle();
  if (error && error.code !== "42P01") {
    throw new Error(`cursor_read_failed:${error.code ?? "unknown"}`);
  }
  return (data as Record<string, unknown> | null) ?? null;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  if (!args.provider || !args.channel) {
    console.error(
      "usage: --provider <key> --channel <snapshot|stream|links> [--mode dry_run|persist] [--apply --i-understand-this-writes-production]",
    );
    process.exitCode = 1;
    return;
  }
  if (args.mode === "persist" && (!args.apply || !args.understand)) {
    console.error(
      "persist mode requires BOTH --apply and --i-understand-this-writes-production",
    );
    process.exitCode = 1;
    return;
  }

  const provider = getVacancyProvider(args.provider);
  if (!provider) {
    console.error(`unknown provider: ${args.provider}`);
    process.exitCode = 1;
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)",
    );
    process.exitCode = 1;
    return;
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const channel = args.channel as VacancyImportChannel;
  const nowIso = new Date().toISOString();

  const before = {
    storedRows: await countStored(client, provider.key),
    cursor: await readCursorRow(client, provider.key, channel),
  };

  const session = await runVacancyIngestionSession(client, provider, {
    channel,
    mode: args.mode,
    nowIso,
  });

  const after = {
    storedRows: await countStored(client, provider.key),
    cursor: await readCursorRow(client, provider.key, channel),
  };

  console.log(
    JSON.stringify(
      {
        operatorRun: {
          providerKey: provider.key,
          channel,
          mode: args.mode,
          nowIso,
        },
        before,
        session,
        after,
      },
      null,
      2,
    ),
  );

  // The accounting above is always printed; the exit code then reports
  // whether the session completed. A `runner_exception` leaves the cursor row
  // untouched (consecutive_failures stays 0), so without a non-zero exit here
  // a failed session has NO failure surface at all — observed 2026-08-14
  // (run 31826082813): status runner_exception, green check.
  process.exitCode = operatorRunExitCode(session.status);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
