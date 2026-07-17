import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildInterestCvStash,
  buildSnapshotContext,
  parseInterestCvStash,
  parseSnapshotContext,
} from "@/lib/opportunities/interest-snapshot";
import {
  buildMyInterestView,
  nextActionFor,
  type LiveNeedFacts,
} from "@/lib/opportunities/my-interest-view";
import type { MyInterestRow } from "@/lib/opportunities/interest";
import {
  cleanShortlistNote,
  SHORTLIST_NOTE_MAX,
  validateShortlistWrite,
} from "@/lib/scouting/shortlist-note";

/**
 * CANONICAL IDEAS INTEGRATION v1 GUARDS.
 *
 * Extension A — "Mano susidomėjimai": the worker's own-signals list renders
 * ONLY own RLS rows, keeps signals of CLOSED demands with an honest label,
 * reuses EXISTING actions (no new mutations), and is NOT a second
 * application centre (no /dashboard/applications route may exist).
 *
 * Extension B — shortlist note: the EXISTING demand_shortlist.note column
 * (≤2000) is written/read; `not_fit` REQUIRES a short reason; the worker can
 * never read shortlist rows (RLS pinned at the migration source).
 *
 * Extension C — tailored-CV stash: {template, need_id, tailored_at} inside
 * the EXISTING match_snapshot jsonb, shape-VALIDATED on read; the tailored
 * CV itself stays the read-time deterministic /cv?need= render.
 *
 * Plus: the demand_interest_seen DRAFT migration stays owner-gated and the
 * deferred spine signal stays UNWIRED until the owner applies it.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

/* ── Extension A — own-signals section ─────────────────────────────────── */

describe("A: my-interest list uses OWN rows only and keeps closed demands honestly", () => {
  it("listMyInterestSignals reads own worker rows only (worker_id filter + RLS)", () => {
    const src = read("lib/opportunities/interest.ts");
    // The one query behind byRequest AND rows pins to the caller's workerId.
    expect(src).toMatch(/\.eq\("worker_id", workerId\)/);
    // The snapshot travels with the row so closed demands keep their facts.
    expect(src).toMatch(/request_id, status, match_snapshot, created_at, updated_at/);
  });

  it("a signal whose demand left the board stays, marked stillOpen=false", () => {
    const rows: MyInterestRow[] = [
      {
        requestId: "11111111-1111-4111-8111-111111111111",
        status: "interested",
        matchSnapshot: {
          context: { role_text: "welder", country: "DE", location_label: null, company_name: "Acme GmbH" },
        },
        createdAt: "2026-07-01T10:00:00Z",
        updatedAt: "2026-07-02T10:00:00Z",
      },
    ];
    const view = buildMyInterestView(rows, new Map());
    expect(view).toHaveLength(1); // never silently dropped
    expect(view[0].stillOpen).toBe(false);
    expect(view[0].roleText).toBe("welder"); // click-time snapshot context
    expect(view[0].companyName).toBe("Acme GmbH");
    expect(view[0].cvTemplate).toBeNull(); // no tailored link on a closed demand
  });

  it("live board facts win over the snapshot when the demand is still open", () => {
    const live = new Map<string, LiveNeedFacts>([
      [
        "11111111-1111-4111-8111-111111111111",
        { roleText: "electrician", companyName: "Live Co", locationLabel: "Vilnius", country: "LT" },
      ],
    ]);
    const view = buildMyInterestView(
      [
        {
          requestId: "11111111-1111-4111-8111-111111111111",
          status: "interested",
          matchSnapshot: { context: { role_text: "stale", country: "DE", location_label: null, company_name: "Old" } },
          createdAt: null,
          updatedAt: null,
        },
      ],
      live,
    );
    expect(view[0].stillOpen).toBe(true);
    expect(view[0].roleText).toBe("electrician");
    expect(view[0].companyName).toBe("Live Co");
  });

  it("an old row without context degrades honestly to nulls (never fabricated)", () => {
    const view = buildMyInterestView(
      [
        {
          requestId: "22222222-2222-4222-8222-222222222222",
          status: "reviewed",
          matchSnapshot: { status_band: "possible" }, // pre-extension snapshot
          createdAt: null,
          updatedAt: null,
        },
      ],
      new Map(),
    );
    expect(view[0].roleText).toBeNull();
    expect(view[0].companyName).toBeNull();
    expect(view[0].stillOpen).toBe(false);
  });

  it("ONE next action per row, existing flows only", () => {
    expect(nextActionFor("contacted", true)).toBe("open_conversation");
    expect(nextActionFor("contacted", false)).toBe("open_conversation");
    expect(nextActionFor("interested", true)).toBe("contact_employer");
    expect(nextActionFor("interested", false)).toBe("withdraw");
    expect(nextActionFor("reviewed", true)).toBe("contact_employer");
    expect(nextActionFor("reviewed", false)).toBe("withdraw");
    expect(nextActionFor("withdrawn", true)).toBe("view_demand");
    expect(nextActionFor("withdrawn", false)).toBe("none");
  });

  it("the section reuses EXISTING server flows only — no new mutations", () => {
    const cmp = read("components/app/worker-my-interest-section.tsx");
    expect(cmp).toMatch(
      /import \{ withdrawInterestAction \} from "@\/lib\/opportunities\/interest-actions"/,
    );
    expect(cmp).toMatch(
      /import \{ contactEmployerAction \} from "@\/lib\/opportunities\/contact-employer"/,
    );
    expect(cmp).not.toMatch(/"use server"/);
    // Honest closed-demand state + internal-signal scope line are rendered.
    expect(cmp).toMatch(/my-interest-closed/);
    expect(cmp).toMatch(/labels\.internalNote/);
  });

  it("the section lives on the EXISTING opportunities board", () => {
    const page = read("app/[locale]/dashboard/opportunities/page.tsx");
    expect(page).toMatch(/<WorkerMyInterestSection/);
    expect(page).toMatch(/myInterestRows/);
  });

  it("NO second application centre exists (route guard)", () => {
    // The own-signals section is a board section, not a new dashboard. A
    // dedicated applications/interest route would be the second application
    // centre the doctrine bans.
    for (const banned of [
      "app/[locale]/dashboard/applications",
      "app/[locale]/dashboard/my-interest",
      "app/[locale]/dashboard/interests",
    ]) {
      expect(existsSync(join(APP_ROOT, banned)), `${banned} must not exist`).toBe(false);
    }
  });
});

/* ── Extension C — tailored-CV stash inside match_snapshot ─────────────── */

describe("C: cv stash is shape-validated and read-time deterministic", () => {
  const NEED = "33333333-3333-4333-8333-333333333333";

  it("builds only registered templates (unknown → default), ISO stamp travels", () => {
    const stash = buildInterestCvStash({
      cvTemplate: "compact",
      needId: NEED,
      nowIso: "2026-07-17T10:00:00.000Z",
    });
    expect(stash).toEqual({
      template: "compact",
      need_id: NEED,
      tailored_at: "2026-07-17T10:00:00.000Z",
    });
    expect(
      buildInterestCvStash({ cvTemplate: "fancy-ai-super", needId: NEED, nowIso: "2026-07-17T10:00:00.000Z" })
        .template,
    ).toBe("standard");
  });

  it("parse validates the full shape — any violation → null, never a crash", () => {
    const ok = { cv: { template: "standard", need_id: NEED, tailored_at: "2026-07-17T10:00:00Z" } };
    expect(parseInterestCvStash(ok)).toEqual(ok.cv);
    expect(parseInterestCvStash(null)).toBeNull();
    expect(parseInterestCvStash({})).toBeNull();
    expect(parseInterestCvStash({ cv: null })).toBeNull();
    expect(parseInterestCvStash({ cv: { template: "nope", need_id: NEED, tailored_at: "2026-07-17T10:00:00Z" } })).toBeNull();
    expect(parseInterestCvStash({ cv: { template: "standard", need_id: "not-a-uuid", tailored_at: "2026-07-17T10:00:00Z" } })).toBeNull();
    expect(parseInterestCvStash({ cv: { template: "standard", need_id: NEED, tailored_at: "yesterday" } })).toBeNull();
  });

  it("expressInterest stashes context + cv INSIDE the existing snapshot (no schema change)", () => {
    const src = read("lib/opportunities/interest.ts");
    expect(src).toMatch(/buildSnapshotContext/);
    expect(src).toMatch(/buildInterestCvStash/);
    // Still the ONE canonical snapshot builder underneath.
    expect(src).toMatch(/buildMatchSnapshot\(match, source\)/);
  });

  it("snapshot context carries only worker-visible whitelisted fields", () => {
    const ctx = buildSnapshotContext({
      roleText: "  welder  ",
      country: "DE",
      locationLabel: "",
      companyName: null,
    });
    expect(ctx).toEqual({
      role_text: "welder",
      country: "DE",
      location_label: null,
      company_name: null,
    });
    // Tolerant read of garbage.
    expect(parseSnapshotContext({ context: { role_text: 42 } }).role_text).toBeNull();
    expect(parseSnapshotContext("junk").company_name).toBeNull();
  });

  it("the tailored CV render itself stays untouched (read-time, deterministic)", () => {
    const tailored = read("lib/cv-export/tailored.ts");
    expect(tailored).toMatch(/list_open_demand_for_workers/);
    expect(tailored).toMatch(/computed at\s*\n?\s*\* read time, never persisted/);
  });

  it("employer-side CV link is deliberately ABSENT (no new disclosure semantics)", () => {
    // /cv renders the SIGNED-IN user's own CV; showing a worker's tailored
    // CV to an employer would need new disclosure/token semantics — out of
    // scope for this PR (documented in the PR body + ideas matrix).
    const scouting = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(scouting).not.toMatch(/\/cv\?need=/);
  });
});

/* ── Extension B — shortlist note + decision reason ────────────────────── */

describe("B: shortlist note bounds + not_fit reason (server-enforced)", () => {
  it("note max mirrors the DB CHECK (2000) and cleaning bounds/trims", () => {
    expect(SHORTLIST_NOTE_MAX).toBe(2000);
    const mig = readRepo("supabase/migrations/20260612220000_demand_shortlist.sql");
    expect(mig).toMatch(/char_length\(note\) <= 2000/);
    expect(cleanShortlistNote("  hi  ")).toBe("hi");
    expect(cleanShortlistNote("")).toBeNull();
    expect(cleanShortlistNote(undefined)).toBeNull();
    expect(cleanShortlistNote("x".repeat(SHORTLIST_NOTE_MAX + 50))!.length).toBe(
      SHORTLIST_NOTE_MAX,
    );
  });

  it("not_fit REQUIRES a reason — from this write or the stored row", () => {
    expect(
      validateShortlistWrite({ status: "not_fit", note: undefined, existingNote: null }),
    ).toEqual({ kind: "reason-required" });
    expect(
      validateShortlistWrite({ status: "not_fit", note: "   ", existingNote: null }),
    ).toEqual({ kind: "reason-required" });
    expect(
      validateShortlistWrite({ status: "not_fit", note: "trūksta patirties", existingNote: null }),
    ).toEqual({ kind: "ok", note: "trūksta patirties" });
    // Stored reason satisfies a re-click without retyping.
    expect(
      validateShortlistWrite({ status: "not_fit", note: undefined, existingNote: "jau įrašyta" }),
    ).toEqual({ kind: "ok", note: undefined });
  });

  it("an omitted note preserves the stored one (undefined ⇒ column untouched)", () => {
    expect(
      validateShortlistWrite({ status: "saved", note: undefined, existingNote: "keep me" }),
    ).toEqual({ kind: "ok", note: undefined });
    const src = read("lib/scouting/scouting.ts");
    expect(src).toMatch(/validateShortlistWrite/);
    expect(src).toMatch(/"reason-required"/);
    // Only a provided note reaches the upsert payload.
    expect(src).toMatch(/if \(validated\.note !== undefined\) payload\.note = validated\.note;/);
  });

  it("runScouting reads the note back and the card shows it", () => {
    const src = read("lib/scouting/scouting.ts");
    expect(src).toMatch(/select\("worker_id, status, note"\)/);
    const buttons = read("components/app/scouting-shortlist-buttons.tsx");
    expect(buttons).toMatch(/scout-shortlist-note-/);
    expect(buttons).toMatch(/SHORTLIST_NOTE_MAX/);
  });

  it("the WORKER can never read shortlist rows (RLS pinned at the migration)", () => {
    const mig = readRepo("supabase/migrations/20260612220000_demand_shortlist.sql")
      .toLowerCase()
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    // SELECT policy: owner or admin only — no worker-side or employer-wide read.
    expect(mig).toMatch(
      /create policy demand_shortlist_select on public\.demand_shortlist for select\s+using \(owner_id = auth\.uid\(\) or public\.is_admin\(\)\);/,
    );
    expect(mig).not.toMatch(/workers\s+w\s+where\s+w\.profile_id/);
  });
});

/* ── i18n — every new key in the 5 ACTIVE locales, really translated ───── */

describe("new copy exists in lt/en/ru/nl/de (no [EN] markers)", () => {
  const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;
  const MY_INTEREST_KEYS = ["title", "summary", "intro", "closed", "viewDemand", "cvLink"];
  const MY_INTEREST_STATUSES = ["interested", "reviewed", "contacted", "withdrawn"];
  const NOTE_KEYS = [
    "label",
    "internalHint",
    "add",
    "edit",
    "placeholder",
    "reasonTitle",
    "reasonPlaceholder",
    "reasonRequired",
    "save",
    "cancel",
  ];

  for (const locale of ACTIVE) {
    it(`${locale}: opportunities.myInterest + scouting.shortlistNote complete`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        opportunities: { myInterest: Record<string, unknown> & { status: Record<string, string> } };
        scouting: { shortlistNote: Record<string, string> };
      };
      const mi = json.opportunities.myInterest;
      for (const k of MY_INTEREST_KEYS) {
        expect(typeof mi[k], `myInterest.${k}`).toBe("string");
        expect((mi[k] as string).length).toBeGreaterThan(0);
        expect(mi[k]).not.toMatch(/\[EN\]/);
      }
      for (const s of MY_INTEREST_STATUSES) {
        expect(typeof mi.status[s], `myInterest.status.${s}`).toBe("string");
        expect(mi.status[s]).not.toMatch(/\[EN\]/);
      }
      const note = json.scouting.shortlistNote;
      for (const k of NOTE_KEYS) {
        expect(typeof note[k], `shortlistNote.${k}`).toBe("string");
        expect(note[k].length).toBeGreaterThan(0);
        expect(note[k]).not.toMatch(/\[EN\]/);
      }
    });
  }
});

/* ── Draft seen-model migration — owner-gated, spine stays unwired ─────── */

describe("demand_interest_seen draft migration is gated and shaped right", () => {
  const MIG = join(REPO_ROOT, "supabase", "migrations", "20260717150000_demand_interest_seen_v1.sql");
  const DOWN = join(REPO_ROOT, "supabase", "rollbacks", "20260717150000_demand_interest_seen_v1.down.sql");

  it("migration + paired rollback files exist", () => {
    expect(existsSync(MIG)).toBe(true);
    expect(existsSync(DOWN)).toBe(true);
  });

  it("draft-gated, owner-only RLS, RPC-only writes (mirror of worker_opportunity_seen)", () => {
    const sql = readFileSync(MIG, "utf8");
    expect(sql).toMatch(/DO NOT APPLY automatically/);
    expect(sql).toMatch(/REQUIRES_OWNER_DECISION/);
    expect(sql).toMatch(/primary key \(profile_id, signal_id, seen_status\)/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/profile_id = auth\.uid\(\) or public\.is_admin\(\)/);
    // Exactly ONE policy — SELECT only (writes stay RPC-only).
    const policies = sql.match(/create policy/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(sql).toMatch(/for select/);
    expect(sql).toMatch(
      /revoke insert, update, delete on public\.demand_interest_seen from authenticated/,
    );
    expect(sql).toMatch(/mark_demand_interest_seen_v1/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public/);
    // Own-signal bound: the RPC joins workers.profile_id = caller.
    expect(sql).toMatch(/w\.profile_id = uid/);
    expect(sql).toMatch(/-- DOWN/);
  });

  it("APPLIED_LEDGER carries the deferred entry", () => {
    const ledger = readRepo("docs/APPLIED_LEDGER.md");
    expect(ledger).toContain("20260717150000_demand_interest_seen_v1.sql");
  });

  it("the deferred spine signal stays UNWIRED until the owner applies", () => {
    // Comments may (and do) NAME the deferred signal — only CODE counts.
    const stripComments = (s: string): string =>
      s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const spine = stripComments(read("lib/notifications/spine-signals.ts"));
    expect(spine).not.toMatch(/demand_interest_seen/);
    expect(spine).not.toMatch(/interest[-_]response/i);
    const spineIo = stripComments(read("lib/notifications/spine.ts"));
    expect(spineIo).not.toMatch(/demand_interest_seen/);
  });
});
