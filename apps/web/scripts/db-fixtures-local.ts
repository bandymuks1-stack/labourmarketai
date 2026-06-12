/**
 * pnpm db:fixtures:local — apply supabase/dev-fixtures.sql to a LOCAL
 * Supabase instance only.
 *
 * HARD GUARD (brief §10.2): refuses to run unless the configured Supabase
 * URL points at a local instance. This keeps throwaway test rows out of the
 * Supabase Cloud project, which must stay real-data-only.
 *
 * Run with cwd = apps/web (pnpm -C apps/web db:fixtures:local).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/** Minimal .env.local loader (tsx does not auto-load dotenv files). */
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
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (val.startsWith("<")) continue; // unfilled .env.example placeholder
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      )
        val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "::1" ||
    host.endsWith(".local")
  );
}

function main(): void {
  loadEnvLocal();
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  if (!url) {
    console.error(
      "Refusing: no Supabase URL found. Set SUPABASE_URL (or " +
        "NEXT_PUBLIC_SUPABASE_URL) to a LOCAL instance in .env.local first.",
    );
    process.exit(1);
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error(`Refusing: "${url}" is not a valid URL.`);
    process.exit(1);
    return;
  }

  if (!isLocalHost(host)) {
    console.error(
      `Refusing to apply dev fixtures: Supabase URL host "${host}" is not ` +
        "local. dev-fixtures.sql is LOCAL-ONLY and must never touch the " +
        "Supabase Cloud project (brief §10.2).",
    );
    process.exit(1);
  }

  const sqlPath = join(
    process.cwd(),
    "..",
    "..",
    "supabase",
    "dev-fixtures.sql",
  );
  if (!existsSync(sqlPath)) {
    console.error(`dev-fixtures.sql not found at ${sqlPath}`);
    process.exit(1);
  }

  const dbUrl =
    process.env.SUPABASE_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  console.log(`Local instance confirmed (${host}). Applying dev fixtures…`);
  const res = spawnSync(
    "psql",
    [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
    { stdio: "inherit" },
  );

  if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
    // No host psql (common on Windows) — fall back to the psql inside the
    // local Supabase db container, feeding the SQL through stdin.
    console.log("`psql` not on PATH — using the supabase db container…");
    const viaDocker = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_labourmarketai",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        "-",
      ],
      { input: readFileSync(sqlPath), stdio: ["pipe", "inherit", "inherit"] },
    );
    if (viaDocker.error || viaDocker.status !== 0) {
      console.error(
        "Container fallback failed too. Install the PostgreSQL client, or " +
          "apply manually:\n" +
          `  psql "${dbUrl}" -f supabase/dev-fixtures.sql\n` +
          "(ensure `supabase start` is running first).",
      );
      process.exit(viaDocker.status ?? 1);
    }
    console.log("Dev fixtures applied to the local instance (via container).");
    return;
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
  console.log("Dev fixtures applied to the local instance.");
}

main();
