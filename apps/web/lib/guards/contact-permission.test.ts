import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CONTACT_PERMISSION_STATES,
  evaluateContactPermission,
} from "@/lib/communication/communication-eligibility";
import { describeConversationCard } from "@/lib/communication/conversation-display";

/**
 * CONTACT PERMISSION + COUNTERPART IDENTITY — permanent CI guard
 * (§8.1, product-tree branch 20).
 *
 * Doctrine §4 default-closed + §7 encode-the-negatives. Pins:
 *   1. the permission states are ENUMERATED — no state appears or vanishes
 *      silently, and the evaluator is default-closed;
 *   2. NO contact without permission — creating a new direct conversation is
 *      gated inside getOrCreateDirectConversation, and every caller of that
 *      helper is on a pinned allowlist;
 *   3. counterpart identity is shown ONLY when permitted — via the safe
 *      identity reader (one gated SECURITY DEFINER read RPC, display name
 *      only), with honest degradation to the restricted state;
 *   4. the identity migration is a needs-human-gate DRAFT with a rollback,
 *      and its projection leaks no contact channel;
 *   5. no old terminology / legacy path — the communication layer never
 *      touches the legacy threads/messages tables.
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
const stripTs = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripSql = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const ELIGIBILITY = "lib/communication/communication-eligibility.ts";
const RESOLVER = "lib/communication/contact-permission.ts";
const DIRECT = "lib/communication/direct-conversation.ts";
const OPEN_ACTION = "lib/communication/open-conversation-action.ts";
const SCOUT_ACTION = "lib/communication/request-worker-conversation.ts";
const MIGRATION =
  "supabase/migrations/20260705170000_conversation_counterpart_identity.sql";
const ROLLBACK =
  "supabase/rollbacks/20260705170000_conversation_counterpart_identity.down.sql";

// ── 1. Permission states are enumerated + default-closed ────────────────

describe("§8.1 permission states — enumerated, no silent drift", () => {
  it("the enumeration is EXACTLY the eight agreed states", () => {
    // allowed_accepted_service_request added in audit PR4 (accepted
    // marketplace rows open a conversation); allowed_demand_interest added
    // in audit PR5 ("contacted" opens a real thread on the worker's OWN
    // interest signal); allowed_accepted_booking added in booking lifecycle
    // v1 (an accepted booking opens the company↔worker conversation) —
    // deliberate, reviewed extensions, each verified server-side by its
    // gated action (service-request-conversation.ts /
    // contact-interested-worker.ts / booking-conversation.ts).
    expect([...CONTACT_PERMISSION_STATES].sort()).toEqual(
      [
        "allowed_admin",
        "allowed_engagement",
        "allowed_existing_conversation",
        "allowed_scouting_shortlist",
        "allowed_accepted_service_request",
        "allowed_demand_interest",
        "allowed_accepted_booking",
        "no_permission",
      ].sort(),
    );
  });

  it("default-closed: all-false facts land on no_permission", () => {
    expect(
      evaluateContactPermission({
        sharesConversation: false,
        hasEngagement: false,
        scoutingAllowed: false,
        isAdmin: false,
      }),
    ).toBe("no_permission");
  });

  it("there is no generic catch-all 'allowed' state (source is traceable)", () => {
    // Step 4A's own decision union keeps its "allowed" — but the §8.1
    // permission enumeration never carries an untraceable generic state.
    expect(CONTACT_PERMISSION_STATES).not.toContain("allowed");
  });
});

// ── 2. No contact without permission ─────────────────────────────────────

describe("no contact without permission — the create path is gated", () => {
  const direct = stripTs(read(DIRECT));

  it("getOrCreateDirectConversation resolves a permission before creating", () => {
    expect(direct).toMatch(/resolveContactPermission/);
    expect(direct).toMatch(/isContactPermitted/);
    // The default-closed denial exists and carries the tagged code.
    expect(direct).toMatch(/code:\s*"no_permission"/);
    // The gate sits BEFORE the createConversation call in source order.
    const gate = direct.indexOf('code: "no_permission"');
    const create = direct.indexOf("return createConversation(");
    expect(gate).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(gate);
  });

  it("a caller-supplied grant is honoured ONLY when it is an allowed_* state", () => {
    expect(direct).toMatch(
      /isContactPermitted\(grantedPermission\)\s*\?\s*\(grantedPermission as ContactPermissionState\)\s*:\s*await resolveContactPermission/,
    );
  });

  it("the scouting action passes its grant only AFTER its own gate held", () => {
    const src = stripTs(read(SCOUT_ACTION));
    // The Step 4A decision gate stays intact…
    expect(src).toMatch(/evaluateCommunicationRequest/);
    expect(src).toMatch(/if \(decision !== "allowed"\) return \{ ok: false, reason: decision \};/);
    // …and the grant is the named scouting state, after that gate.
    const gate = src.indexOf('if (decision !== "allowed")');
    const grant = src.indexOf('"allowed_scouting_shortlist"');
    expect(gate).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(gate);
  });

  it("the generic open action passes NO grant (server resolves the states)", () => {
    const src = stripTs(read(OPEN_ACTION));
    expect(src).toMatch(/getOrCreateDirectConversation\(profileId, locale\)/);
    expect(src).not.toMatch(/allowed_/);
    // Denial lands on the existing honest notice — never a silent success.
    expect(src).toMatch(/notice=cannot_open/);
  });

  it("every getOrCreateDirectConversation caller is on the pinned allowlist", () => {
    const callers: string[] = [];
    const walk = (absDir: string, relDir: string) => {
      for (const e of readdirSync(absDir, { withFileTypes: true })) {
        const childAbs = join(absDir, e.name);
        const childRel = `${relDir}/${e.name}`;
        if (e.isDirectory()) walk(childAbs, childRel);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          const src = readFileSync(childAbs, "utf8");
          if (
            /getOrCreateDirectConversation\(/.test(src) &&
            !childRel.endsWith("/lib/communication/direct-conversation.ts")
          ) {
            callers.push(childRel.replace(/^\//, ""));
          }
        }
      }
    };
    for (const r of ["app", "components", "lib"]) walk(join(APP, r), `/${r}`);
    expect(callers.sort()).toEqual([
      // Booking lifecycle v1 — accepted-booking grant (participant + status
      // verified server-side before the conversation opens).
      "lib/booking/booking-conversation.ts",
      // Audit PR5 — demand-interest grant ("contacted" opens the real
      // thread), verified server-side before the conversation opens.
      "lib/communication/contact-interested-worker.ts",
      "lib/communication/open-conversation-action.ts",
      "lib/communication/request-worker-conversation.ts",
      // Audit PR4 — accepted-service-request grant, verified server-side in
      // the action before the conversation opens.
      "lib/marketplace/service-request-conversation.ts",
      // Canonical-journey P1 — the WORKER side of the demand-interest grant
      // (own active signal on an open verified-company demand), verified
      // server-side before the conversation opens.
      "lib/opportunities/contact-employer.ts",
    ]);
  });
});

// ── 3. Counterpart identity only when permitted ──────────────────────────

describe("counterpart identity — shown only when permitted, never invented", () => {
  it("direct WITHOUT a permitted name stays restricted", () => {
    const m = describeConversationCard({ kind: "direct" });
    expect(m.counterpartyRestricted).toBe(true);
    expect(m.counterpartyName).toBeNull();
  });

  it("direct WITH a permitted real name becomes known (permitted key)", () => {
    const m = describeConversationCard({ kind: "direct", counterpartName: "Jonas J." });
    expect(m.counterpartyKnown).toBe(true);
    expect(m.counterpartyRestricted).toBe(false);
    expect(m.counterpartyName).toBe("Jonas J.");
    expect(m.counterpartyKey).toBe("counterparty.permitted");
  });

  it("a blank/whitespace name is NOT an identity (stays restricted)", () => {
    for (const bad of ["", "   ", null, undefined]) {
      const m = describeConversationCard({ kind: "direct", counterpartName: bad });
      expect(m.counterpartyRestricted, String(bad)).toBe(true);
      expect(m.counterpartyName, String(bad)).toBeNull();
    }
  });

  it("team NEVER takes a counterpart name (the reader is direct-only)", () => {
    const m = describeConversationCard({ kind: "team", counterpartName: "Jonas J." });
    expect(m.counterpartyRestricted).toBe(true);
    expect(m.counterpartyName).toBeNull();
  });

  it("the reader calls ONLY the gated RPC and degrades to an empty map", () => {
    const src = stripTs(read(RESOLVER));
    expect(src).toMatch(/\.rpc\(\s*"conversation_counterpart_identities"/);
    expect(src).toMatch(/if \(error \|\| !Array\.isArray\(data\)\) return out;/);
    // Only a real, non-empty display_name is mapped (no fabrication).
    expect(src).toMatch(/if \(id && name\) out\.set\(id, name\)/);
    // No contact-channel field is ever read or forwarded by this module.
    expect(src.toLowerCase()).not.toMatch(/\bphone\b|\be-?mail\b/);
    // No direct profiles-table identity read in the app layer.
    expect(src).not.toMatch(/from\("profiles"\)\s*\.\s*select\([^)]*full_name/);
  });

  it("permitted-counterpart copy exists in every active locale (lt/en/ru)", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        communication?: { counterparty?: Record<string, string> };
      };
      const v = j.communication?.counterparty?.permitted;
      expect(v?.trim().length, `${loc} counterparty.permitted`).toBeGreaterThan(0);
      expect(v).not.toContain("[EN]");
    }
  });
});

// ── 4. The identity migration is a bounded, human-gated DRAFT ────────────

describe("identity migration — bounded SECURITY DEFINER read, owner-gated", () => {
  const raw = readRepo(MIGRATION);
  const sql = stripSql(raw).toLowerCase();

  it("is marked needs-human-gate + @human-gate-approved (DRAFT, manual apply)", () => {
    expect(raw).toMatch(/needs-human-gate/);
    expect(raw).toMatch(/@human-gate-approved/);
    expect(raw).toMatch(/DO NOT APPLY automatically/i);
  });

  it("adds EXACTLY one SECURITY DEFINER function, search_path-pinned, stable", () => {
    expect((sql.match(/security definer/g) ?? []).length).toBe(1);
    expect(sql).toMatch(
      /create or replace function public\.conversation_counterpart_identities\(p_conversation_ids uuid\[\]\)/,
    );
    expect(sql).toMatch(/security definer set search_path = public stable/);
  });

  it("scope re-checked at fire time: caller participant + direct + 2 people + unrevoked", () => {
    expect(sql).toMatch(/public\.is_conversation_participant\(cp\.conversation_id\)/);
    expect(sql).toMatch(/c\.kind = 'direct'/);
    expect(sql).toMatch(/cp\.profile_id <> auth\.uid\(\)/);
    expect(sql).toMatch(/cp\.revoked_at is null/);
    expect(sql).toMatch(/\) = 2/);
  });

  it("projection is display name ONLY — no contact channel, no id leak", () => {
    expect(sql).toMatch(/returns table \(conversation_id uuid, display_name text\)/);
    expect(sql).toMatch(/select cp\.conversation_id, p\.full_name/);
    expect(sql).not.toMatch(/\bemail\b|\bphone\b|\bcountry\b|profile_text|consent_|avatar_url/);
  });

  it("execute revoked from public + anon; granted to authenticated only", () => {
    expect(sql).toMatch(
      /revoke all on function public\.conversation_counterpart_identities\(uuid\[\]\) from public/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.conversation_counterpart_identities\(uuid\[\]\) from anon/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.conversation_counterpart_identities\(uuid\[\]\) to authenticated/,
    );
    expect(sql).not.toMatch(/to anon\b/);
  });

  it("adds NO table / column / policy / table-grant / using(true)", () => {
    expect(sql).not.toMatch(/create table|alter table|add column|create policy|drop policy/);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/grant (select|insert|update|delete|all)/);
  });

  it("the rollback exists and drops only the function", () => {
    const down = stripSql(readRepo(ROLLBACK)).toLowerCase();
    expect(down).toMatch(
      /drop function if exists public\.conversation_counterpart_identities\(uuid\[\]\)/,
    );
    expect(down).not.toMatch(/drop table|delete from|truncate|alter table/);
  });
});

// ── 5. No old terminology / no legacy path / nothing external ────────────

describe("no legacy path, no external sending, no contact-channel leak", () => {
  const FILES = [ELIGIBILITY, RESOLVER, DIRECT, OPEN_ACTION, SCOUT_ACTION];

  for (const rel of FILES) {
    it(`${rel}: never touches the legacy threads/messages tables`, () => {
      const src = stripTs(read(rel));
      expect(src).not.toMatch(/from\("threads"\)|from\("messages"\)/);
    });
    it(`${rel}: sends nothing external`, () => {
      const src = stripTs(read(rel));
      expect(src).not.toMatch(/nodemailer|sendgrid|twilio|fetch\(|axios|smtp|\bsms\b|telegram|whatsapp/i);
    });
  }

  it("the old ungated stub name never returns", () => {
    for (const rel of FILES) {
      expect(read(rel)).not.toMatch(/canInitiateDirectConversation/);
    }
  });

  it("the permission layer never claims contacted/verified/booked states", () => {
    for (const rel of [ELIGIBILITY, RESOLVER, DIRECT]) {
      const src = stripTs(read(rel)).toLowerCase();
      expect(src).not.toMatch(/contact unlocked|unlock contact|worker accepted|booking confirmed/);
    }
  });
});
