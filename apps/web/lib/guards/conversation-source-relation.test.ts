import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CONVERSATION_SOURCE_TYPES,
  isConversationSourceType,
  normalizeConversationSourceHint,
  resolveSourceRoute,
} from "@/lib/communication/conversation-source-model";
import { describeConversationCard } from "@/lib/communication/conversation-display";

/**
 * CONVERSATION SOURCE RELATION v1 — permanent CI guard.
 *
 * Owner-approved (docs/launch/conversation-source-relation-owner-decision-v1.md,
 * YES path); design per docs/launch/conversation-source-relation-review-pack-v1.md.
 * Pins the review pack's §8 test plan:
 *   1. SINGLE WRITE PATH — source_type/source_id are written only inside the
 *      abuse-caps-pinned createConversation;
 *   2. EXACT STAMPING — each of the four gated context callers passes its own
 *      exact sourceHint type and no other; the generic open action and the
 *      support launcher pass none;
 *   3. MIGRATION SHAPE — needs-human-gate DRAFT, exactly one SECURITY DEFINER
 *      function, search_path-pinned, participant re-check, revoke public/anon
 *      + grant authenticated, no policy change, nothing destructive;
 *   4. ROLLBACK SHAPE — drops only the function and the two columns;
 *   5. READER HONESTY — the app resolver calls ONLY conversation_source_context,
 *      degrades to an empty map, never forwards a raw source_id;
 *   6. UI HONEST DEGRADATION — no context → exactly today's neutral card;
 *      42703 write fallback + 42883/any-error read fallback;
 *   7. LOCALE PARITY — lt/en/ru source labels exist, non-empty, no [EN];
 *   8. E2E RLS PROBE — the hostile spec probes the RPC as non-participant/anon.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const stripSql = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const stripTs = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const MODEL = "lib/communication/conversation-source-model.ts";
const READER = "lib/communication/conversation-source.ts";
const COMM_ACTIONS = "lib/communication/actions.ts";
const DIRECT = "lib/communication/direct-conversation.ts";
const OPEN_ACTION = "lib/communication/open-conversation-action.ts";
const SUPPORT_LAUNCHER = "components/app/support-conversation-launcher.tsx";
const MIGRATION =
  "../../supabase/migrations/20260706210000_conversation_source_relation.sql";
const ROLLBACK =
  "../../supabase/rollbacks/20260706210000_conversation_source_relation.down.sql";

/** The sanctioned context callers and the ONE type each may stamp
 *  (review pack §1.3 rows 2-5; canonical-journey P1 added the worker-side
 *  demand-interest stamper — the SAME relationship type, opposite end). */
const STAMPERS: ReadonlyArray<readonly [string, string]> = [
  ["lib/communication/request-worker-conversation.ts", "scouting"],
  ["lib/marketplace/service-request-conversation.ts", "accepted_service_request"],
  ["lib/communication/contact-interested-worker.ts", "demand_interest"],
  ["lib/opportunities/contact-employer.ts", "demand_interest"],
  ["lib/booking/booking-conversation.ts", "accepted_booking"],
];

/** All non-test source files under the app-side trees. */
function walkSources(): string[] {
  const out: string[] = [];
  const stack = ["lib", "app", "components"];
  while (stack.length > 0) {
    const rel = stack.pop() as string;
    const abs = join(APP, rel);
    for (const name of readdirSync(abs)) {
      const childRel = `${rel}/${name}`;
      const childAbs = join(abs, name);
      if (statSync(childAbs).isDirectory()) {
        stack.push(childRel);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      if (/\.test\.(ts|tsx)$/.test(name)) continue;
      out.push(childRel);
    }
  }
  return out;
}

// ── 0. The closed type set is the single source of truth ─────────────────

describe("closed source-type set — model mirrors the migration CHECK", () => {
  it("the enumeration is EXACTLY the four sanctioned context types", () => {
    expect([...CONVERSATION_SOURCE_TYPES].sort()).toEqual(
      [
        "scouting",
        "accepted_service_request",
        "demand_interest",
        "accepted_booking",
      ].sort(),
    );
  });

  it("the migration's CHECK constraint carries the same closed set", () => {
    const sql = stripSql(read(MIGRATION)).toLowerCase();
    for (const t of CONVERSATION_SOURCE_TYPES) {
      expect(sql, `CHECK must include '${t}'`).toContain(`'${t}'`);
    }
    // And nothing beyond it: the check list is exactly the four types.
    const check = sql.match(/check \(source_type in\s*\(([^)]+)\)\)/);
    expect(check).not.toBeNull();
    const listed = [...check![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual([...CONVERSATION_SOURCE_TYPES].sort());
  });

  it("the hint normalizer is default-closed (off-set type / non-uuid id → null)", () => {
    const uuid = "0f7a3e42-1111-4222-8333-444455556666";
    expect(
      normalizeConversationSourceHint({ type: "scouting", id: uuid }),
    ).toEqual({ type: "scouting", id: uuid });
    expect(normalizeConversationSourceHint(null)).toBeNull();
    expect(normalizeConversationSourceHint(undefined)).toBeNull();
    expect(
      normalizeConversationSourceHint({ type: "made_up_type", id: uuid }),
    ).toBeNull();
    expect(
      normalizeConversationSourceHint({ type: "scouting", id: "not-a-uuid" }),
    ).toBeNull();
    expect(
      normalizeConversationSourceHint({
        type: "scouting",
        id: "1; drop table conversations;",
      }),
    ).toBeNull();
    expect(isConversationSourceType("support")).toBe(false);
  });
});

// ── 1. Single write path ──────────────────────────────────────────────────

describe("§8-1 single write path — only createConversation writes the stamp", () => {
  it("source_type is written into conversations ONLY by the capped action", () => {
    // Any file that both touches the conversations table and mentions
    // source_type must be the single capped insert path.
    const writers = walkSources().filter((rel) => {
      const src = read(rel);
      return (
        /source_type/.test(src) &&
        /\.from\(\s*["']conversations["']\s*\)/.test(src)
      );
    });
    expect(writers).toEqual([COMM_ACTIONS]);
  });

  it("no app-side UPDATE ever touches source_type/source_id (insert-only stamp)", () => {
    for (const rel of walkSources()) {
      const src = read(rel);
      if (!/source_type|source_id/.test(src)) continue;
      // No update payload may carry the stamp columns — the relation is set
      // at creation only (forward-only, no retroactive relabelling).
      expect(src, `${rel} must not UPDATE the stamp columns`).not.toMatch(
        /\.update\(\s*\{[^}]*source_(type|id)/,
      );
    }
  });

  it("createConversation stamps through the default-closed normalizer", () => {
    const src = read(COMM_ACTIONS);
    expect(src).toMatch(/normalizeConversationSourceHint\(input\.sourceHint\)/);
    // The stamped insert carries exactly the normalized pair.
    expect(src).toMatch(/source_type:\s*sourceHint\.type/);
    expect(src).toMatch(/source_id:\s*sourceHint\.id/);
  });
});

// ── 2. Exact stamping by the sanctioned callers ───────────────────────────

describe("§8-2 exact stamping — each caller passes its own type, no other", () => {
  for (const [rel, type] of STAMPERS) {
    it(`${rel} stamps ONLY '${type}'`, () => {
      const src = read(rel);
      expect(src).toMatch(new RegExp(`\\{\\s*type:\\s*"${type}"`));
      // No other closed-set type appears anywhere in the caller.
      for (const other of CONVERSATION_SOURCE_TYPES) {
        if (other === type) continue;
        expect(src, `${rel} must not mention '${other}'`).not.toContain(
          `"${other}"`,
        );
      }
    });
  }

  it("the stamp is passed AFTER the caller's own gate held (source order)", () => {
    for (const [rel, type] of STAMPERS) {
      const src = read(rel);
      const gate = Math.max(
        src.indexOf('!== "allowed"'),
        src.indexOf('status !== "accepted"'),
        src.indexOf('interestStatus === "withdrawn"'),
      );
      const stamp = src.indexOf(`type: "${type}"`);
      expect(gate, `${rel} gate`).toBeGreaterThan(-1);
      expect(stamp, `${rel} stamp after gate`).toBeGreaterThan(gate);
    }
  });

  it("the generic open action and the support launcher pass NO sourceHint", () => {
    expect(read(OPEN_ACTION)).not.toMatch(/sourceHint|source_type|source_id/);
    expect(read(SUPPORT_LAUNCHER)).not.toMatch(/sourceHint|source_type|source_id/);
  });

  it("nobody outside the four stampers passes a typed hint literal", () => {
    // A caller stamps by passing `{ type: "<closed-set type>", id }` into the
    // direct-conversation path. The only files combining a
    // getOrCreateDirectConversation call with a closed-set type literal must
    // be exactly the four sanctioned stampers.
    const stamperFiles = walkSources().filter((rel) => {
      const src = read(rel);
      return (
        /getOrCreateDirectConversation\(/.test(src) &&
        CONVERSATION_SOURCE_TYPES.some((t) => src.includes(`type: "${t}"`))
      );
    });
    expect(stamperFiles.sort()).toEqual(
      STAMPERS.map(([rel]) => rel).sort(),
    );
    // And the sourceHint plumbing exists only in the sanctioned spine.
    const plumbing = walkSources().filter((rel) =>
      /\bsourceHint\b/.test(read(rel)),
    );
    for (const rel of plumbing) {
      expect(
        [COMM_ACTIONS, DIRECT, MODEL, ...STAMPERS.map(([r]) => r)],
        `${rel} must not carry sourceHint plumbing`,
      ).toContain(rel);
    }
  });
});

// ── 3. Migration shape — bounded, human-gated ─────────────────────────────

describe("§8-3 migration — human-gated, bounded SECURITY DEFINER", () => {
  const raw = read(MIGRATION);
  const sql = stripSql(raw).toLowerCase();

  it("carries the owner's human-gate approval marker (manual MCP apply only)", () => {
    // Owner approved 2026-07-06 — the RED-class human gate must stay
    // explicitly recorded in the migration header (mirror of the
    // privacy-request intake flow, PR #653).
    expect(raw).toMatch(/@human-gate-approved/);
    expect(raw).toMatch(/DO NOT APPLY automatically/i);
  });

  it("adds EXACTLY one SECURITY DEFINER function, search_path-pinned, stable", () => {
    expect((sql.match(/security definer/g) ?? []).length).toBe(1);
    expect(sql).toMatch(
      /create or replace function public\.conversation_source_context\(p_conversation_ids uuid\[\]\)/,
    );
    expect(sql).toMatch(/security definer set search_path = public stable/);
  });

  it("participant scope is re-checked at fire time", () => {
    expect(sql).toMatch(/public\.is_conversation_participant\(c\.id\)/);
  });

  it("projection is type + title + route hint ONLY — raw source_id never returned", () => {
    expect(sql).toMatch(
      /returns table \(\s*conversation_id\s+uuid,\s*source_type\s+text,\s*source_title\s+text,\s*source_route_hint\s+text\s*\)/,
    );
    // The OUTER select list is exactly the four projected columns —
    // c.source_id appears only inside the lateral's WHERE (liveness check),
    // never in the projection.
    expect(sql).toMatch(
      /select\s+c\.id,\s+c\.source_type,\s+src\.source_title,\s+src\.source_route_hint\s+from public\.conversations c/,
    );
    expect(sql).not.toMatch(/\bemail\b|\bphone\b|profile_text|consent_|avatar_url/);
  });

  it("execute revoked from public + anon; granted to authenticated only", () => {
    expect(sql).toMatch(
      /revoke all on function public\.conversation_source_context\(uuid\[\]\) from public/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.conversation_source_context\(uuid\[\]\) from anon/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.conversation_source_context\(uuid\[\]\) to authenticated/,
    );
    expect(sql).not.toMatch(/to anon\b/);
  });

  it("columns are nullable, additive-only; no policy change, no table grant", () => {
    expect(sql).toMatch(/add column source_type text/);
    expect(sql).toMatch(/add column source_id uuid/);
    // The ALTER statement itself carries no NOT NULL / DEFAULT (the RPC's
    // WHERE legitimately uses `is not null` — scan the alter only).
    const alter = sql.match(/alter table public\.conversations[^;]+;/);
    expect(alter).not.toBeNull();
    expect(alter![0]).not.toMatch(/not null|default\s/);
    expect(alter![0]).not.toMatch(/references\s/); // deliberately NO FK
    expect(sql).not.toMatch(/create policy|alter policy|drop policy/);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/grant (select|insert|update|delete|all)/);
    expect(sql).not.toMatch(/create trigger|create table/);
  });

  it("nothing destructive in the executable SQL", () => {
    expect(sql).not.toMatch(/\bdrop table\b|\bdelete from\b|\btruncate\b|\bdrop column\b/);
    // No backfill of existing rows either (forward-only).
    expect(sql).not.toMatch(/\bupdate public\.conversations\b/);
  });
});

// ── 4. Rollback shape ─────────────────────────────────────────────────────

describe("§8-4 rollback — drops only the function and the two columns", () => {
  const raw = read(ROLLBACK);
  const down = stripSql(raw).toLowerCase();

  it("drops the RPC and the two columns, nothing else", () => {
    expect(down).toMatch(
      /drop function if exists public\.conversation_source_context\(uuid\[\]\)/,
    );
    expect(down).toMatch(/drop column if exists source_type/);
    expect(down).toMatch(/drop column if exists source_id/);
    expect(down).not.toMatch(/\bdrop table\b|\bdelete from\b|\btruncate\b/);
    expect(down).not.toMatch(/drop policy|create policy/);
  });

  it("states explicitly that only the new relation stamps are lost", () => {
    expect(raw.toLowerCase()).toMatch(/nullable/);
    expect(raw.toLowerCase()).toMatch(/only the new (source-relation|relation) stamps/i);
  });
});

// ── 5. Reader honesty ─────────────────────────────────────────────────────

describe("§8-5 reader — one gated RPC, empty-map degradation, no raw id", () => {
  const src = read(READER);

  it("calls ONLY the gated RPC and degrades to an empty map on ANY error", () => {
    expect(src).toMatch(/\.rpc\(\s*"conversation_source_context"/);
    expect(src).toMatch(/if \(error \|\| !Array\.isArray\(data\)\) return out;/);
    // No table read fallback — the RPC is the only read path for source context.
    expect(src).not.toMatch(/\.from\(/);
  });

  it("never forwards a raw source_id to the caller", () => {
    // The RPC does not return source_id; the reader's CODE must not even
    // carry a field for it (comments may state the contract), and the
    // model's read-side type has no id.
    expect(stripTs(src)).not.toMatch(/source_id/);
    const model = read(MODEL);
    const ctx = model.slice(
      model.indexOf("interface ConversationSourceContext"),
      model.indexOf("SOURCE_ROUTE_BY_HINT"),
    );
    expect(ctx).not.toMatch(/\bid\b\s*:/);
    expect(ctx).not.toMatch(/sourceId|source_id/);
  });

  it("maps only closed-set types with a non-empty live title", () => {
    expect(src).toMatch(/isConversationSourceType\(row\?\.source_type\)/);
    expect(src).toMatch(/if \(id && title && isConversationSourceType/);
  });

  it("the route map is closed — unknown hint tokens yield null (no invented routes)", () => {
    expect(resolveSourceRoute("bookings")).toBe("/dashboard/bookings");
    expect(resolveSourceRoute("service_requests")).toBe("/dashboard/service-requests");
    expect(resolveSourceRoute("company_scouting")).toBe("/dashboard/company/scouting");
    expect(resolveSourceRoute("made_up")).toBeNull();
    expect(resolveSourceRoute(null)).toBeNull();
    expect(resolveSourceRoute(undefined)).toBeNull();
    expect(resolveSourceRoute("")).toBeNull();
  });

  it("both communication pages resolve context through the reader only", () => {
    for (const rel of [
      "app/[locale]/dashboard/communication/page.tsx",
      "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
    ]) {
      const page = read(rel);
      expect(page, `${rel} uses the reader`).toMatch(
        /readConversationSourceContexts/,
      );
      expect(page, `${rel} never touches raw columns`).not.toMatch(/source_id/);
      expect(page, `${rel} renders the source testid`).toMatch(
        /conversation-source-|thread-source/,
      );
    }
  });
});

// ── 6. UI honest degradation ──────────────────────────────────────────────

describe("§8-6 UI degradation — absent context renders exactly today's card", () => {
  const base = {
    kind: "direct",
    createdBy: "a",
    viewerId: "b",
    subject: "Mūrininkai fasadui",
  } as const;

  it("no sourceContext → the neutral card, byte-for-byte", () => {
    const without = describeConversationCard({ ...base });
    const withNull = describeConversationCard({ ...base, sourceContext: null });
    expect(without).toEqual(withNull);
    expect(without.sourceKey).toBeNull();
    expect(without.sourceTitle).toBeNull();
    expect(without.sourceHref).toBeNull();
    expect(without.scopeKey).toBe("scope.demand");
  });

  it("RPC-resolved context → typed label + title + link-back", () => {
    const m = describeConversationCard({
      ...base,
      sourceContext: {
        sourceType: "accepted_booking",
        title: "Mūrininkas",
        href: "/dashboard/bookings",
      },
    });
    expect(m.sourceKey).toBe("source.accepted_booking");
    expect(m.sourceTitle).toBe("Mūrininkas");
    expect(m.sourceHref).toBe("/dashboard/bookings");
    // The neutral scope machinery is unchanged by the source line.
    expect(m.scopeKey).toBe("scope.demand");
  });

  it("route-less context (e.g. worker side of scouting) keeps the label, no link", () => {
    const m = describeConversationCard({
      ...base,
      sourceContext: { sourceType: "scouting", title: "Fasado darbai", href: null },
    });
    expect(m.sourceKey).toBe("source.scouting");
    expect(m.sourceHref).toBeNull();
  });

  it("malformed context degrades to the neutral card (never invented)", () => {
    for (const bad of [
      { sourceType: "made_up", title: "X", href: null },
      { sourceType: "scouting", title: "   ", href: null },
      { sourceType: "", title: "X", href: null },
    ]) {
      const m = describeConversationCard({ ...base, sourceContext: bad });
      expect(m.sourceKey, JSON.stringify(bad)).toBeNull();
      expect(m.sourceTitle, JSON.stringify(bad)).toBeNull();
      expect(m.sourceHref, JSON.stringify(bad)).toBeNull();
    }
  });

  it("support and team threads never take a source label", () => {
    for (const kind of ["support", "team"] as const) {
      const m = describeConversationCard({
        kind,
        sourceContext: {
          sourceType: "accepted_booking",
          title: "X",
          href: "/dashboard/bookings",
        },
      });
      expect(m.sourceKey, kind).toBeNull();
    }
  });

  it("write path tolerates absent columns: 42703 → plain no-source insert", () => {
    const src = read(COMM_ACTIONS);
    const fallback = src.indexOf('insertConv.error?.code === "42703"');
    expect(fallback).toBeGreaterThan(-1);
    // The fallback re-inserts WITHOUT the stamp — creation never breaks.
    const after = src.slice(fallback);
    expect(after).toMatch(
      /\.insert\(\{ subject, kind, created_by: user\.id \}\)/,
    );
  });

  it("read path tolerates the absent RPC: any error (incl. 42883) → empty map", () => {
    const src = read(READER);
    expect(src).toMatch(/42883/); // the degradation contract is documented
    expect(src).toMatch(/if \(error \|\| !Array\.isArray\(data\)\) return out;/);
  });
});

// ── 7. Locale parity ──────────────────────────────────────────────────────

describe("§8-7 locale parity — lt/en/ru source labels, no [EN] markers", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: all four source labels exist, non-empty, translated`, () => {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        communication?: { source?: Record<string, string> };
      };
      const source = j.communication?.source;
      expect(source, `${loc}: communication.source missing`).toBeTruthy();
      expect(Object.keys(source ?? {}).sort()).toEqual(
        [...CONVERSATION_SOURCE_TYPES].sort(),
      );
      for (const t of CONVERSATION_SOURCE_TYPES) {
        const v = source?.[t] ?? "";
        expect(v.trim().length, `${loc} source.${t}`).toBeGreaterThan(0);
        expect(v, `${loc} source.${t} untranslated`).not.toContain("[EN]");
      }
    });
  }
});

// ── 8. E2E RLS probe is wired ─────────────────────────────────────────────

describe("§8-8 the hostile e2e spec probes the source RPC", () => {
  it("chat-visibility-rls.spec.ts probes conversation_source_context", () => {
    const spec = read("tests/e2e/chat-visibility-rls.spec.ts");
    expect(spec).toMatch(/conversation_source_context/);
    // Non-participant + anon probes both assert ZERO rows.
    expect(spec).toMatch(/toHaveLength\(0\)/);
  });
});
