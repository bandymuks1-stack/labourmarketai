/**
 * CHAT VISIBILITY AUDIT — permanent CI guard (doctrine §4 default-closed, §7
 * "encode the negative-visibility checks as permanent CI tests so they
 * survive every future refactor").
 *
 * The live, behavioural proof is the hostile negative suite
 * `tests/e2e/chat-visibility-rls.spec.ts` (runs against the local Supabase
 * stack via `pnpm e2e:local`). That suite SKIPS in plain CI (no stack), so
 * THIS static guard pins, in CI, the schema + code invariants that make the
 * negative results hold — if a future refactor weakens any of them, this
 * fails without needing a database.
 *
 * Findings fixed (see docs/audits/CHAT_VISIBILITY_AUDIT.md):
 *   F0 recursion — is_conversation_participant() is SECURITY DEFINER.
 *   F1 revocation — conversation_participants has revoked_at + revoked_by.
 *   F2 revoke path — revoke_conversation_participant() RPC (UPDATE, not DELETE).
 *   F3 own-row UPDATE — narrowed to UPDATE(last_read_at) at the grant layer.
 *   F4 anon grants — anon/public hold zero privileges; authenticated holds
 *      only SELECT/INSERT (+ participants UPDATE(last_read_at)).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const MIG_DIR = join(REPO, "supabase", "migrations");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const readMig = (name: string): string => readFileSync(join(MIG_DIR, name), "utf8");

const BASE_MIG = "0021_communication.sql";
const FIX_MIG = "20260612170000_conversation_participant_revocation.sql";

// Executable SQL only (strip comments — the ROLLBACK block legitimately
// mentions the old definitions).
const exec = (sql: string): string =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("chat visibility — base migration 0021 invariants", () => {
  const sql = exec(readMig(BASE_MIG));

  it("all three tables enable RLS", () => {
    for (const t of [
      "conversations",
      "conversation_participants",
      "conversation_messages",
    ]) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${t} enable row level security`, "i"),
      );
    }
  });

  it("messages are append-only — no UPDATE/DELETE policy on conversation_messages", () => {
    expect(sql).not.toMatch(/create policy[^;]*conversation_messages[^;]*for\s+update/i);
    expect(sql).not.toMatch(/create policy[^;]*conversation_messages[^;]*for\s+delete/i);
  });

  it("no participant DELETE policy exists (revocation is an UPDATE, never a delete)", () => {
    expect(sql).not.toMatch(/create policy[^;]*conversation_participants[^;]*for\s+delete/i);
    expect(exec(readMig(FIX_MIG))).not.toMatch(/for\s+delete/i);
  });

  it("conversation SELECT is participant/creator/admin only — never `using (true)`/to anon", () => {
    expect(sql).toMatch(/conversations_select[\s\S]*is_conversation_participant\(id\)/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/\bto\s+anon\b/i);
  });
});

describe("chat visibility — fix migration (F0–F4) invariants", () => {
  const raw = readMig(FIX_MIG);
  const sql = exec(raw);

  it("filename follows §16 timestamp convention", () => {
    expect(FIX_MIG).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it("F0: is_conversation_participant() is SECURITY DEFINER with a pinned search_path", () => {
    const fn = sql.match(
      /create or replace function public\.is_conversation_participant[\s\S]*?\$\$[\s\S]*?\$\$/i,
    )?.[0];
    expect(fn, "function definition not found").toBeTruthy();
    expect(fn!).toMatch(/security\s+definer/i);
    expect(fn!).toMatch(/set\s+search_path\s*=\s*public/i);
    // and it filters out revoked grants (F1 wired into the helper)
    expect(fn!).toMatch(/revoked_at\s+is\s+null/i);
  });

  it("F1: conversation_participants gains revoked_at + revoked_by", () => {
    expect(sql).toMatch(/add column if not exists revoked_at\s+timestamptz/i);
    expect(sql).toMatch(/add column if not exists revoked_by\s+uuid/i);
  });

  it("F2: revoke RPC is SECURITY DEFINER, creator/admin-gated, an UPDATE, audit-logged", () => {
    const fn = sql.match(
      /create or replace function public\.revoke_conversation_participant[\s\S]*?end \$\$/i,
    )?.[0];
    expect(fn, "revoke RPC not found").toBeTruthy();
    expect(fn!).toMatch(/security\s+definer/i);
    expect(fn!).toMatch(/created_by\b[\s\S]*is_admin\(\)/i); // creator OR admin
    expect(fn!).toMatch(/update public\.conversation_participants[\s\S]*set\s+revoked_at\s*=\s*now\(\)/i);
    expect(fn!).not.toMatch(/delete\s+from/i); // never a delete
    expect(fn!).toMatch(/insert into public\.audit_logs/i); // §3.4
    expect(sql).toMatch(
      /grant execute on function public\.revoke_conversation_participant\(uuid, uuid\) to authenticated/i,
    );
  });

  it("F3: participant UPDATE grant is narrowed to the last_read_at column only", () => {
    expect(sql).toMatch(
      /revoke all on public\.conversation_participants\s+from authenticated/i,
    );
    expect(sql).toMatch(
      /grant update \(last_read_at\)\s+on public\.conversation_participants\s+to authenticated/i,
    );
  });

  it("F4: anon/public lose all privileges; authenticated keeps only SELECT/INSERT", () => {
    for (const t of [
      "conversations",
      "conversation_participants",
      "conversation_messages",
    ]) {
      expect(sql).toMatch(
        new RegExp(`revoke all on public\\.${t}\\s+from anon, public`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`grant select, insert\\s+on public\\.${t}\\s+to authenticated`, "i"),
      );
    }
    // No broad re-grant sneaks back in.
    expect(sql).not.toMatch(/grant\s+all\s+on public\.conversation/i);
    expect(sql).not.toMatch(/\bto\s+anon\b/i);
    // Reversible (RED migrations still ship a rollback).
    expect(raw).toMatch(/--[^\n]*\bROLLBACK\b/i);
  });
});

describe("chat visibility — no service-role bypass in user-facing chat paths", () => {
  // Every file that reads/writes the chat tables through the user session.
  const USER_PATHS = [
    "lib/communication/actions.ts",
    "lib/communication/direct-conversation.ts",
    "lib/communication/translation.ts",
    "app/[locale]/dashboard/communication/page.tsx",
    "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
  ];

  for (const rel of USER_PATHS) {
    it(`${rel} never imports the service-role admin client`, () => {
      const src = read(rel);
      expect(src, `${rel} must not use createAdminClient`).not.toMatch(/createAdminClient/);
      expect(src, `${rel} must not read the service-role key`).not.toMatch(
        /SUPABASE_SERVICE_ROLE_KEY/,
      );
      expect(src).not.toMatch(/from "@\/lib\/supabase\/admin"/);
    });
  }

  it("the ONLY runtime createAdminClient() caller is the anon leads funnel (§17.2)", () => {
    // Audit-pinned inventory: scan the app for runtime createAdminClient()
    // call sites (not the helper definition, not scripts, not tests). If a
    // new one appears, this fails so the audit doc must be updated and the
    // new bypass justified.
    const roots = ["app", "lib"];
    const callers: string[] = [];
    const walk = (absDir: string, relDir: string) => {
      for (const e of readdirSync(absDir, { withFileTypes: true })) {
        const childAbs = join(absDir, e.name);
        const childRel = `${relDir}/${e.name}`;
        if (e.isDirectory()) {
          walk(childAbs, childRel);
        } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
          const src = readFileSync(childAbs, "utf8");
          // a call, not the definition in lib/supabase/admin.ts
          if (/createAdminClient\(\)/.test(src) && childRel !== "/lib/supabase/admin.ts") {
            callers.push(childRel.replace(/^\//, ""));
          }
        }
      }
    };
    for (const r of roots) walk(join(APP, r), `/${r}`);
    // Audited service-role callers:
    //  - app/api/leads/route.ts — the anon leads funnel (§17.2).
    //  - lib/billing/subscription-store.ts — the Stripe TEST webhook write path.
    //    A webhook has NO user session (Stripe calls it), so service-role is the
    //    correct path for the billing tables, which by design carry NO
    //    authenticated write policy (owner/admin SELECT only).
    //  - lib/admin/billing-actions.ts — admin manual pilot-access override
    //    (admin-gated via isSuperadmin); same billing tables, no chat table.
    //  - lib/admin/company-need-intakes.ts — Public Intake Owner Queue v1.
    //    Reads/updates ONLY company_need_public_intakes, which by design
    //    carries NO anon/authenticated RLS policy (PR #678: write-only via
    //    the anon RPC, read-only via service role). Every entry point is
    //    fenced behind an explicit isSuperadmin() re-check; it touches no
    //    chat table and sends nothing outbound.
    //  - lib/admin/launch-readiness.ts — operator launch-readiness view
    //    (launch repair Scope E). READ-ONLY head-counts over workers /
    //    profiles / companies / company_need_public_intakes /
    //    customer_requests / organizations (the intake table has no
    //    anon/authenticated read policy by design, so service role is the
    //    only read path). Fenced behind an explicit isSuperadmin() re-check,
    //    touches no chat table, writes nothing, sends nothing outbound.
    //  - lib/sales/lead-intake.ts — superadmin-gated READ-ONLY waitlist
    //    read (§8.14): `waitlist` carries no authenticated read policy BY
    //    DESIGN (0005 — anon INSERT only, reads restricted to service
    //    role), the call is fenced behind an explicit isSuperadmin()
    //    re-check, SELECTs only `waitlist`, and writes nothing.
    //  - lib/company/claim-public-intake.ts — canonical-journey P3 claim
    //    bridge. Reads company_need_public_intakes rows ONLY where the
    //    caller's AUTHENTICATED email equals contact_email (re-checked on
    //    the claimed row), and updates ONLY that row's status to
    //    'converted' after the owner-scoped save_demand_draft RPC (caller
    //    session, RLS) created the draft. Touches no chat table, exposes no
    //    third-party data, sends nothing outbound.
    //  - lib/opportunities/contact-employer.ts — canonical-journey P1
    //    worker→employer open. After the caller's OWN facts held under
    //    their RLS session (worker row + own active interest signal), one
    //    service-role read resolves the demand owner + verified-company
    //    gate (customer_requests/companies are owner-scoped by design, so
    //    a worker cannot read them directly). The owner's profile id never
    //    reaches the browser; the conversation itself opens through the
    //    gated 0021 backend (rate caps + §8.1 grant), never service-role.
    //  - lib/ai/runtime/audit-store.ts — AI Router v1 append-only run audit.
    //    Best-effort INSERT of one ai_runs row per LIVE AI run + a head-only
    //    COUNT for the daily-run budget. ai_runs by design carries NO
    //    anon/authenticated write path (admin-only SELECT, append-only;
    //    gated draft 20260714150000), so the service role is the only write
    //    path — the billing-webhook pattern. The row carries field NAMES +
    //    a bounded validated-output excerpt, never input content; touches
    //    no chat table, sends nothing outbound.
    //  - lib/billing/offer-store.ts / lib/billing/usage.ts /
    //    lib/billing/cost-engine.ts — Pricing & Payments v1 (Sprint v2
    //    §9–§11), the subscription-store pattern: the billing/usage tables
    //    carry NO anon/authenticated write path by design (gated drafts
    //    20260714190000 + 20260714200000), so the service role is the only
    //    path. offer-store writes ONE idempotent billing_offer_eligibility
    //    row from the webhook chain (automatic Launch Offer 15% memory) +
    //    a superadmin-page read; usage.ts appends bounded append-only
    //    usage_events rows; cost-engine.ts is READ-ONLY rollups over
    //    ai_runs + usage_events. See CHAT_VISIBILITY_AUDIT.md §7.
    // None touch a chat table; they write only billing_* /
    // payment_webhook_events / one intake status column / the append-only
    // ai_runs / usage_events audit rows (the reads write nothing at all).
    expect(
      callers.sort(),
      `unexpected service-role caller(s) — update docs/audits/CHAT_VISIBILITY_AUDIT.md and justify: ${callers.join(", ")}`,
    ).toEqual([
      "app/api/leads/route.ts",
      "lib/admin/billing-actions.ts",
      "lib/admin/company-need-intakes.ts",
      "lib/admin/launch-readiness.ts",
      "lib/ai/runtime/audit-store.ts",
      "lib/billing/cost-engine.ts",
      "lib/billing/offer-store.ts",
      "lib/billing/subscription-store.ts",
      "lib/billing/usage.ts",
      "lib/company/claim-public-intake.ts",
      "lib/opportunities/contact-employer.ts",
      "lib/sales/lead-intake.ts",
    ]);
  });

  it("the anon leads funnel writes only `leads` — never a chat table", () => {
    const src = read("app/api/leads/route.ts");
    const tables = [...src.matchAll(/\.from\(["']([^"']+)["']\)/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) {
      expect(t).toBe("leads");
      expect(t).not.toMatch(/conversation/);
    }
  });
});

describe("chat visibility — the hostile negative e2e exists and is wired", () => {
  const spec = read("tests/e2e/chat-visibility-rls.spec.ts");

  it("covers all six required negative scenarios", () => {
    // 1 same-org non-participant, 2 other-org + ID guess, 3 owner grant+revoke,
    // 4 anon zero access, 6 revocation-not-delete.
    expect(spec).toMatch(/same-organization non-participant sees nothing/i);
    expect(spec).toMatch(/other-organization user sees nothing/i);
    expect(spec).toMatch(/un-revoked grant row/i);
    expect(spec).toMatch(/cannot un-revoke themselves/i);
    expect(spec).toMatch(/anon role has zero access/i);
    expect(spec).toMatch(/cannot be DELETEd/i);
  });

  it("runs serial against the local stack only (never cloud)", () => {
    expect(spec).toMatch(/describe\.configure\(\{ mode: "serial" \}\)/);
    expect(spec).toMatch(/refuses non-local stack/i);
  });
});
