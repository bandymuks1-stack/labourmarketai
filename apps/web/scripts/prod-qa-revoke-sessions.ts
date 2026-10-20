/**
 * REVOKE AND DELETE THE MINTED PRODUCTION QA SESSIONS — run after every walk.
 *
 * `prod-qa-mint-session.ts` writes one real session per synthetic identity to
 * `tests/e2e/.storage-state.prod-qa*.json` (gitignored, 0600). The runner is
 * ephemeral, but a session's REFRESH token stays valid at Supabase until it is
 * used or revoked, so a session must not outlive the walk that needed it.
 *
 * For each file: the access token must be an allowlisted synthetic identity
 * issued by the production project (the same rules as tests/e2e/prod-qa-api.ts);
 * then `POST {PRODUCTION_ORIGIN}/auth/v1/logout?scope=local` revokes that
 * session's refresh token, and the file is deleted whatever the answer was.
 * Prints counts and HTTP statuses only — never a token, never an e-mail.
 *
 *   PROD_QA_ANON_KEY=… pnpm exec tsx scripts/prod-qa-revoke-sessions.ts
 */
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

import { PRODUCTION_ORIGIN, PROD_QA_IDENTITIES } from "../lib/testing/prod-qa-guard";

const DIR = resolve(__dirname, "..", "tests", "e2e");
const FILE_RX = /^\.storage-state\.prod-qa(\.[a-z0-9-]{1,24})?\.json$/;

function accessTokenOf(file: string): string | null {
  try {
    const st = JSON.parse(readFileSync(file, "utf8")) as { cookies?: { name: string; value: string }[] };
    const raw = (st.cookies ?? [])
      .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
      .map((c) => c.value)
      .join("");
    if (!raw) return null;
    const b64 = raw.startsWith("base64-") ? raw.slice(7) : raw;
    const session = JSON.parse(Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof session.access_token === "string" ? session.access_token : null;
  } catch {
    return null;
  }
}

function vetted(token: string): boolean {
  try {
    const c = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return (
      typeof c.email === "string" &&
      PROD_QA_IDENTITIES.includes(c.email) &&
      typeof c.iss === "string" &&
      c.iss.startsWith(`${PRODUCTION_ORIGIN}/`)
    );
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const anon = process.env.PROD_QA_ANON_KEY ?? "";
  const files = readdirSync(DIR).filter((f) => FILE_RX.test(f));
  const seen = new Set<string>();
  let revoked = 0;
  let skipped = 0;
  const statuses: number[] = [];
  for (const name of files) {
    const path = join(DIR, name);
    const token = accessTokenOf(path);
    if (token && anon && vetted(token) && !seen.has(token)) {
      seen.add(token);
      try {
        const res = await fetch(`${PRODUCTION_ORIGIN}/auth/v1/logout?scope=local`, {
          method: "POST",
          redirect: "error",
          headers: { apikey: anon, authorization: `Bearer ${token}` },
        });
        statuses.push(res.status);
        if (res.status === 204 || res.status === 200) revoked += 1;
      } catch {
        statuses.push(0);
      }
    } else if (!token || !vetted(token)) {
      skipped += 1;
    }
    unlinkSync(path);
  }
  console.info(
    `[prod-qa-revoke] files=${files.length} deleted=${files.length} sessions_revoked=${revoked}/${seen.size} ` +
      `unvetted_or_unreadable=${skipped} statuses=${statuses.join(",") || "none"}`,
  );
}

main().catch((err) => {
  // Never fail the run on cleanup; say that it did not complete.
  console.error("[prod-qa-revoke] incomplete:", (err as Error).message);
});
