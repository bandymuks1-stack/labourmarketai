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
 * FAILS LOUDLY (exit 1) when the cleanup did not do its job, so a walk can
 * never look green while a session is still live: any session not revoked
 * with 200/204, any unreadable or unvetted file, or — with
 * PROD_QA_REVOKE_EXPECT_FILES=1 (the mint ran) — no session file at all.
 * Until 2026-10-26 it never failed and the files were deleted before it ran,
 * so it reported a clean 0/0 while every session stayed live.
 *
 * ONE exception, per slot: a walk that signs its own session out through the
 * app (digest-setup S-5) leaves `.storage-state.prod-qa.<slot>.signed-out.json`
 * once the sign-out landed. Supabase then answers 403/404 for that session —
 * it is already ended — and only for THAT slot, only with that marker, such an
 * answer counts as done. Every other slot and every other status stays strict.
 *
 *   PROD_QA_ANON_KEY=… pnpm exec tsx scripts/prod-qa-revoke-sessions.ts
 */
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

import { PRODUCTION_ORIGIN, PROD_QA_IDENTITIES } from "../lib/testing/prod-qa-guard";

const DIR = resolve(__dirname, "..", "tests", "e2e");
const FILE_RX = /^\.storage-state\.prod-qa(\.[a-z0-9-]{1,24})?\.json$/;
/** Left by a walk after its own in-app sign-out of that slot (see the header). */
const SIGNED_OUT_RX = /^\.storage-state\.prod-qa(\.[a-z0-9-]{1,24})?\.signed-out\.json$/;
const slotOf = (name: string, rx: RegExp): string => rx.exec(name)?.[1] ?? "";

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
  const all = readdirSync(DIR);
  const files = all.filter((f) => FILE_RX.test(f));
  const markers = all.filter((f) => SIGNED_OUT_RX.test(f));
  const signedOutSlots = new Set(markers.map((f) => slotOf(f, SIGNED_OUT_RX)));
  const seen = new Set<string>();
  let revoked = 0;
  let endedByOwnSignOut = 0;
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
        else if ((res.status === 403 || res.status === 404) && signedOutSlots.has(slotOf(name, FILE_RX))) endedByOwnSignOut += 1;
      } catch {
        statuses.push(0);
      }
    } else if (!token || !vetted(token)) {
      skipped += 1;
    }
    unlinkSync(path);
  }
  for (const name of markers) unlinkSync(join(DIR, name));
  console.info(
    `[prod-qa-revoke] files=${files.length} deleted=${files.length} sessions_revoked=${revoked}/${seen.size} ` +
      `ended_by_own_signout=${endedByOwnSignOut} unvetted_or_unreadable=${skipped} statuses=${statuses.join(",") || "none"}`,
  );
  const problems: string[] = [];
  if (revoked + endedByOwnSignOut < seen.size) {
    problems.push(`${seen.size - revoked - endedByOwnSignOut} session(s) not revoked`);
  }
  if (skipped > 0) problems.push(`${skipped} unreadable or unvetted session file(s)`);
  if (process.env.PROD_QA_REVOKE_EXPECT_FILES === "1" && files.length === 0) {
    problems.push("sessions were minted but no session file reached the revoke");
  }
  if (!anon && files.length > 0) problems.push("PROD_QA_ANON_KEY missing: nothing could be revoked");
  if (problems.length > 0) {
    console.error(`[prod-qa-revoke] INCOMPLETE: ${problems.join("; ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // A cleanup that did not complete is a failed run, never a quiet pass.
  console.error("[prod-qa-revoke] INCOMPLETE:", (err as Error).message);
  process.exitCode = 1;
});
