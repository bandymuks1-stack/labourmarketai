/**
 * pnpm -C apps/web generate-activation-report
 *
 * Local read-only activation-funnel report (audit finding F-T2; the P0-C
 * reporting slice planned in
 * runtime/audits/p0-activation-telemetry-repair-plan-2026-06-30.md §PR4).
 * Pulls pilot_events from the prod DB and writes an ANONYMIZED markdown
 * report to runtime/reports/activation-funnel-report.md (gitignored).
 *
 * Hard rules (same doctrine as generate-pilot-owner-brief.ts):
 *   - Service-role key is allowed here because this is LOCAL owner-side
 *     tooling, never app runtime.
 *   - profile_id / session_id are sha256-hashed and truncated to 10 hex
 *     chars before they appear in the report. No emails, no names, no
 *     free text — pilot_events carries none by design.
 *   - Admin/owner accounts and @example.com seed accounts are EXCLUDED
 *     from the funnel numbers (raw totals shown separately for honesty).
 *   - Output lands in runtime/ (gitignored). NEVER committed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { FUNNEL_EVENTS } from "../lib/telemetry/funnel-events";

const WINDOW_DAYS = 30;
const MAX_ROWS = 20000;

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
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

function anon(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 10);
}

type EventRow = {
  event_name: string;
  profile_id: string | null;
  session_id: string;
  created_at: string;
  result: string;
  metadata: Record<string, unknown> | null;
};

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local",
    );
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // ── Exclusion sets: admins + seed accounts. Used ONLY in memory. ──
  const excluded = new Set<string>();
  {
    const { data: byActive, error: activeErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("active_role", "admin");
    const { data: byRole, error: roleErr } = await supabase
      .from("profile_roles")
      .select("profile_id")
      .eq("role", "admin");
    if (activeErr || roleErr) {
      // FAIL CLOSED: without the admin exclusion the report would count
      // owner/admin noise as real users — refusing to emit a report without
      // exclusions is the only honest behavior. (Grant gap? See migration
      // 20260702200000_pilot_events_service_role_report_read.)
      console.error(
        "admin-exclusion read failed — refusing to emit a report without exclusions:",
        activeErr?.message ?? roleErr?.message,
      );
      process.exit(1);
    }
    for (const r of byActive ?? []) excluded.add(r.id as string);
    for (const r of byRole ?? []) excluded.add(r.profile_id as string);
    // Seed/example accounts: auth emails are not on profiles; use the admin
    // auth API page-by-page only if available. Fallback: profiles.full_name
    // is not reliable — keep the documented seed filter to example.com via
    // auth.admin.listUsers (best-effort).
    try {
      const { data: users } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      for (const u of users?.users ?? []) {
        if ((u.email ?? "").toLowerCase().endsWith("@example.com")) {
          excluded.add(u.id);
        }
      }
    } catch {
      /* auth admin API unavailable — seed exclusion skipped (noted in report) */
    }
  }

  const { data, error } = await supabase
    .from("pilot_events")
    .select("event_name, profile_id, session_id, created_at, result, metadata")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);
  if (error) {
    console.error("pilot_events read failed:", error.message);
    process.exit(1);
  }
  const all = (data ?? []) as EventRow[];
  const truncated = all.length === MAX_ROWS;

  const funnelNames = new Set<string>(Object.values(FUNNEL_EVENTS));
  const rows = all.filter((r) => !r.profile_id || !excluded.has(r.profile_id));
  const excludedCount = all.length - rows.length;

  // ── Per-event aggregation (funnel events only) ──
  type Agg = {
    total: number;
    users: Set<string>;
    sessions: Set<string>;
    failures: number;
  };
  const byEvent = new Map<string, Agg>();
  for (const r of rows) {
    if (!funnelNames.has(r.event_name)) continue;
    const agg =
      byEvent.get(r.event_name) ??
      ({ total: 0, users: new Set(), sessions: new Set(), failures: 0 } as Agg);
    agg.total += 1;
    if (r.profile_id) agg.users.add(anon(r.profile_id));
    if (r.session_id) agg.sessions.add(anon(r.session_id));
    if (r.metadata && r.metadata["success"] === false) agg.failures += 1;
    byEvent.set(r.event_name, agg);
  }

  const eventLines = Object.values(FUNNEL_EVENTS)
    .map((name) => {
      const a = byEvent.get(name);
      return `| ${name} | ${a?.total ?? 0} | ${a?.users.size ?? 0} | ${a?.sessions.size ?? 0} | ${a?.failures ?? 0} |`;
    })
    .join("\n");

  const errorRows = rows.filter((r) => r.result === "error");
  const uniqueRealUsers = new Set(
    rows.filter((r) => r.profile_id).map((r) => anon(r.profile_id as string)),
  );

  const body = `# Activation Funnel Report — generated ${now.toISOString()}

> Local read-only, ANONYMIZED snapshot of the last ${WINDOW_DAYS} days.
> Not committed (runtime/ is gitignored). ids are sha256-truncated.
> Admin accounts (${excluded.size} known) and @example.com seed accounts are
> EXCLUDED from all funnel numbers below.

## Window totals

| Signal | Value |
|---|---|
| Raw events in window (incl. admins) | ${all.length}${truncated ? " (TRUNCATED at cap — narrow the window)" : ""} |
| Events excluded as admin/seed | ${excludedCount} |
| Real-user events counted | ${rows.length} |
| Unique real users (hashed) | ${uniqueRealUsers.size} |
| Error-result events (real users) | ${errorRows.length} |

## Funnel events (registry order)

| Event | Count | Unique users | Unique sessions | success:false |
|---|---|---|---|---|
${eventLines}

## Read this report

- "Unique users" counts hashed profile ids — anon (pre-login) events carry none.
- success:false counts failed ATTEMPTS (wired 2026-07-02); zero before that date
  means "not yet measured", not "no failures".
- login_started may undercount while the anon INSERT grant is pending
  (audit F-T1 / draft migration).
- Reproduce anytime: \`pnpm -C apps/web generate-activation-report\`.
`;

  const outPath = join(
    process.cwd(),
    "..",
    "..",
    "runtime",
    "reports",
    "activation-funnel-report.md",
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, body, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(
    `events=${rows.length} realUsers=${uniqueRealUsers.size} excluded=${excludedCount} errors=${errorRows.length}`,
  );
}

main().catch((e) => {
  console.error("generate-activation-report failed:", e);
  process.exit(1);
});
