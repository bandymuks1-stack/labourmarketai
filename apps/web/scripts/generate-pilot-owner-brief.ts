/**
 * pnpm -C apps/web generate-pilot-owner-brief
 *
 * Local maintenance script. Pulls live counts from the prod DB and
 * writes a markdown brief to runtime/reports/pilot-owner-brief.md
 * (gitignored). Owner reads + decides; the script never acts.
 *
 * Hard rules:
 *   - Uses the service-role key — but this is a LOCAL CLI script, NOT
 *     app runtime. The doctrine forbids service_role in the deployed
 *     web bundle; owner-side tooling is allowed (same pattern as
 *     admin-promote.ts).
 *   - Reads only counts. NEVER pulls private journal / profile / CV
 *     text. NEVER pulls language_feedback.comment bodies.
 *   - Output file is in runtime/ (gitignored). NEVER committed.
 *   - No autonomous actions. No external requests beyond Supabase.
 *
 * Usage: `pnpm -C apps/web generate-pilot-owner-brief`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Set them in apps/web/.env.local (Supabase Dashboard → Settings → API).",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  async function countOr(
    table: string,
    apply: (q: ReturnType<typeof supabase.from>) => unknown,
  ): Promise<number | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (supabase.from as any)(table).select("id", {
        count: "exact",
        head: true,
      });
      const next = apply(q) ?? q;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = (await next) as { count?: number; error?: { message?: string } | null };
      if (res.error) return null;
      return res.count ?? 0;
    } catch {
      return null;
    }
  }

  const [
    profiles,
    pilotEvents24h,
    pilotErrors24h,
    pilotEvents7d,
    journalSaves,
    journalErrors24h,
    languageFeedbackOpen,
    languageFeedbackTotal,
    pilotDrafts,
    conversations,
    conversationMessages,
  ] = await Promise.all([
    countOr("profiles", () => null),
    countOr("pilot_events", (q) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q as any).gte("created_at", since24h),
    ),
    countOr("pilot_events", (q) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q as any).eq("result", "error").gte("created_at", since24h),
    ),
    countOr("pilot_events", (q) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q as any).gte("created_at", since7d),
    ),
    countOr("pilot_events", (q) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q as any).eq("event_name", "journal_save_success"),
    ),
    countOr("pilot_events", (q) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q as any)
        .eq("event_name", "journal_save_error_code")
        .gte("created_at", since24h),
    ),
    countOr("language_feedback", (q) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q as any).eq("status", "open"),
    ),
    countOr("language_feedback", () => null),
    countOr("pilot_drafts", () => null),
    countOr("conversations", () => null),
    countOr("conversation_messages", () => null),
  ]);

  const fmt = (n: number | null) => (n === null ? "—" : String(n));

  const body = `# Pilot Owner Brief — generated ${now.toISOString()}

> Local read-only snapshot. Not committed (runtime/ is gitignored).
> Source: production Supabase via service-role read counts only.
> No private text. No keystrokes. No screenshots.

## Snapshot

| Signal | Count |
|---|---|
| Profiles (lifetime)                          | ${fmt(profiles)} |
| Pilot events — last 24 h                     | ${fmt(pilotEvents24h)} |
| Pilot events — last 7 d                      | ${fmt(pilotEvents7d)} |
| Pilot errors — last 24 h                     | ${fmt(pilotErrors24h)} |
| Journal saves — lifetime                     | ${fmt(journalSaves)} |
| Journal save errors — last 24 h              | ${fmt(journalErrors24h)} |
| Language reports — open                      | ${fmt(languageFeedbackOpen)} |
| Language reports — lifetime                  | ${fmt(languageFeedbackTotal)} |
| Pilot drafts — lifetime                      | ${fmt(pilotDrafts)} |
| Conversations — lifetime                     | ${fmt(conversations)} |
| Conversation messages — lifetime             | ${fmt(conversationMessages)} |

## Read this brief

- "—" means the underlying table is missing or your service key can't see it. Not a zero.
- Any non-zero \`pilot errors last 24 h\` row warrants a glance at \`/lt/dashboard/admin/pilot-telemetry\` → "Top error codes" panel.
- \`language reports — open\` > 0 means there's tester feedback waiting at \`/lt/dashboard/admin/language-feedback\`.
- Use \`docs/pilot/PILOT_FEEDBACK_REVIEW_PROCESS_LT.md\` as the daily 15-min review playbook.

## Honest limits

- Counts only. No row content. No PII.
- Static at the moment of generation. Re-run anytime.
- Not a substitute for the live admin pages (which show recent rows).

## What's deferred (intentionally)

- Trend lines / charts.
- Per-user drill-down.
- Auto-alerts.
`;

  const outPath = join(process.cwd(), "..", "..", "runtime", "reports", "pilot-owner-brief.md");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, body, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log("");
  console.log("Quick read:");
  console.log(
    `  profiles=${fmt(profiles)}  events24h=${fmt(pilotEvents24h)}  errors24h=${fmt(pilotErrors24h)}  language_open=${fmt(languageFeedbackOpen)}  drafts=${fmt(pilotDrafts)}  conversations=${fmt(conversations)}  messages=${fmt(conversationMessages)}`,
  );
}

main().catch((e) => {
  console.error("generate-pilot-owner-brief failed:", e);
  process.exit(1);
});
