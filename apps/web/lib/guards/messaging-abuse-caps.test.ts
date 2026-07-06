import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describeConversationCard } from "@/lib/communication/conversation-display";
import {
  CONVERSATION_RATE_CAP,
  MESSAGE_RATE_CAP,
  evaluateRateCap,
} from "@/lib/communication/rate-caps";

/**
 * §8.2 messaging minimum guard (product-tree branch 20) — abuse/spam rate
 * caps + demand context in conversations.
 *
 * Pins the wagon contract:
 *   1. windowed rate caps run BEFORE every conversation/message insert;
 *   2. structured error codes (rate_limited / rate_check_unavailable) — no
 *      silent failures, no generic blobs;
 *   3. NO cap bypass path: the only app-side inserts into the 0021 tables
 *      are the capped server actions;
 *   4. default-closed: an unreadable safety count refuses the write;
 *   5. demand context is READ-ONLY REAL data: a direct thread's subject is
 *      the demand title written ONLY by the gated scouting action, and the
 *      UI labels it honestly (scope.demand) — never fabricated for
 *      support/team or subjectless threads;
 *   6. i18n copy for the demand-context label exists in en/lt/ru;
 *   7. nothing here sends anything externally (no SMS/email/WhatsApp).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const COMM_ACTIONS = "lib/communication/actions.ts";
const INSTR_ACTIONS = "lib/instructions/actions.ts";

/** All non-test source files under the app-side trees. */
function walkSources(): string[] {
  const out: string[] = [];
  const stack = ["lib", "app", "components"];
  while (stack.length > 0) {
    const rel = stack.pop() as string;
    const abs = join(ROOT, rel);
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

/** Chained `.from("<table>") ... .insert(` within one builder chain. */
function insertsInto(src: string, table: string): boolean {
  return new RegExp(
    `\\.from\\(\\s*["']${table}["']\\s*\\)\\s*[\\s\\S]{0,120}?\\.insert\\(`,
  ).test(src);
}

// ── 1. Caps are enforced BEFORE the inserts (no orphan rows, no post-hoc) ──

describe("§8.2 rate caps run before every 0021 insert", () => {
  const src = read(COMM_ACTIONS);

  it("createConversation evaluates CONVERSATION_RATE_CAP before the conversations insert", () => {
    const evalIdx = src.search(/evaluateRateCap\(\s*recentConversations/);
    const insertIdx = src.indexOf('.from("conversations")');
    expect(evalIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(evalIdx).toBeLessThan(insertIdx);
  });

  it("sendMessage evaluates MESSAGE_RATE_CAP before the conversation_messages insert", () => {
    const evalIdx = src.indexOf("evaluateRateCap(recentMessages, MESSAGE_RATE_CAP)");
    const insertIdx = src.indexOf('.from("conversation_messages")');
    expect(evalIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(evalIdx).toBeLessThan(insertIdx);
  });

  it("the worker clarification reply (the one other message-insert path) is capped too", () => {
    const instr = read(INSTR_ACTIONS);
    const evalIdx = instr.indexOf("evaluateRateCap(");
    const insertIdx = instr.search(
      /\.from\("conversation_messages"\)\s*[\s\S]{0,120}?\.insert\(/,
    );
    expect(evalIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(evalIdx).toBeLessThan(insertIdx);
  });
});

// ── 2. Structured error codes + default-closed wiring ─────────────────────

describe("§8.2 structured, honest failure codes", () => {
  const src = read(COMM_ACTIONS);

  it("the CommunicationErrorCode union carries rate_limited + rate_check_unavailable", () => {
    expect(src).toContain('| "rate_limited"');
    expect(src).toContain('| "rate_check_unavailable"');
  });

  it("an unreadable count refuses the write (default-closed, never a bypass)", () => {
    // Both actions branch on !== "allowed" into the rate_check_unavailable
    // refusal — a failed safety check never falls through to the insert.
    expect(src.match(/!== "allowed"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src.match(/code: "rate_check_unavailable"/g)?.length ?? 0).toBe(2);
  });

  it("the pure model is default-closed on unreadable counts", () => {
    expect(evaluateRateCap(null, MESSAGE_RATE_CAP)).toBe("unavailable");
    expect(evaluateRateCap(undefined, CONVERSATION_RATE_CAP)).toBe("unavailable");
    expect(evaluateRateCap(Number.NaN, MESSAGE_RATE_CAP)).toBe("unavailable");
  });

  it("caps are bounded real numbers (chat-friendly, spam-hostile)", () => {
    expect(MESSAGE_RATE_CAP.max).toBeGreaterThan(0);
    expect(MESSAGE_RATE_CAP.max).toBeLessThanOrEqual(200);
    expect(CONVERSATION_RATE_CAP.max).toBeGreaterThan(0);
    expect(CONVERSATION_RATE_CAP.max).toBeLessThanOrEqual(50);
  });
});

// ── 3. No cap bypass path anywhere in the app trees ────────────────────────

describe("§8.2 no bypass: only the capped actions insert into the 0021 tables", () => {
  const sources = walkSources();

  it("conversation_messages is inserted only by the two capped actions", () => {
    const inserters = sources.filter((rel) => insertsInto(read(rel), "conversation_messages"));
    expect(inserters.sort()).toEqual([COMM_ACTIONS, INSTR_ACTIONS].sort());
  });

  it("conversations is inserted only by the capped createConversation", () => {
    const inserters = sources.filter((rel) => insertsInto(read(rel), "conversations"));
    expect(inserters).toEqual([COMM_ACTIONS]);
  });

  it("every conversation-creation entry point routes through createConversation", () => {
    const callers = sources.filter(
      (rel) => rel !== "lib/communication/actions.ts" && read(rel).includes("createConversation("),
    );
    expect(callers.sort()).toEqual(
      ["components/app/support-conversation-launcher.tsx", "lib/communication/direct-conversation.ts"].sort(),
    );
  });
});

// ── 4. Demand context — real data only, honestly labelled ─────────────────

describe("§8.2 demand context in conversations (read-only real data)", () => {
  it("direct + non-empty subject → scope.demand (known context)", () => {
    const m = describeConversationCard({ kind: "direct", subject: "Mūrininkai fasadui" });
    expect(m.demandContext).toBe(true);
    expect(m.scopeKey).toBe("scope.demand");
    expect(m.scopeKnown).toBe(true);
  });

  it("never fabricated: subjectless direct, support and team stay non-demand", () => {
    expect(describeConversationCard({ kind: "direct" }).demandContext).toBe(false);
    expect(describeConversationCard({ kind: "direct", subject: "   " }).demandContext).toBe(false);
    expect(describeConversationCard({ kind: "direct" }).scopeKey).toBe("scope.unknown");
    const support = describeConversationCard({ kind: "support", subject: "Pagalba" });
    expect(support.demandContext).toBe(false);
    expect(support.scopeKey).toBe("scope.support");
    const team = describeConversationCard({ kind: "team", subject: "Brigada" });
    expect(team.demandContext).toBe(false);
    expect(team.scopeKey).toBe("scope.unknown");
  });

  it("direct-subject writers are ONLY the gated fact-verified actions (demand / offering title)", () => {
    // The generic entry point passes no subject…
    const open = read("lib/communication/open-conversation-action.ts");
    expect(open).toMatch(/getOrCreateDirectConversation\(profileId, locale\)/);
    // …the scouting action derives it from the REAL demand row it verified…
    const scout = read("lib/communication/request-worker-conversation.ts");
    expect(scout).toMatch(/demand\?\.title/);
    // …the marketplace action (audit PR4) derives it from the REAL accepted
    // request's offering row it verified server-side…
    const market = read("lib/marketplace/service-request-conversation.ts");
    expect(market).toMatch(/service_offerings\?\.title/);
    expect(market).toMatch(/status !== "accepted"/);
    // …the interest-contact action (audit PR5) derives it from the REAL
    // demand row whose ownership + worker interest it verified…
    const interest = read("lib/communication/contact-interested-worker.ts");
    expect(interest).toMatch(/demand\.title/);
    expect(interest).toMatch(/interestStatus === "withdrawn"/);
    // …the booking action (lifecycle v1) derives it from the REAL accepted
    // booking row's role_text it verified server-side…
    const booking = read("lib/booking/booking-conversation.ts");
    expect(booking).toMatch(/role_text\?\.slice/);
    expect(booking).toMatch(/status !== "accepted"/);
    // …and nobody else calls getOrCreateDirectConversation.
    const callers = walkSources().filter(
      (rel) =>
        rel !== "lib/communication/direct-conversation.ts" &&
        read(rel).includes("getOrCreateDirectConversation("),
    );
    expect(callers.sort()).toEqual(
      [
        "lib/booking/booking-conversation.ts",
        "lib/communication/contact-interested-worker.ts",
        "lib/communication/open-conversation-action.ts",
        "lib/communication/request-worker-conversation.ts",
        "lib/marketplace/service-request-conversation.ts",
      ].sort(),
    );
  });

  it("both communication pages surface the demand context from the real subject", () => {
    for (const rel of [
      "app/[locale]/dashboard/communication/page.tsx",
      "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
    ]) {
      const page = read(rel);
      expect(page, `${rel} passes the real subject`).toMatch(/subject:\s*(c|conversation)\.subject/);
      expect(page, `${rel} marks the demand-context scope`).toContain("data-demand-context");
    }
  });

  it("demand-context copy exists and is non-empty in en/lt/ru", () => {
    for (const loc of ["en", "lt", "ru"] as const) {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        communication?: { scope?: Record<string, string> };
      };
      const v = j.communication?.scope?.demand;
      expect(v, `${loc}.communication.scope.demand`).toBeTruthy();
      expect((v ?? "").trim().length).toBeGreaterThan(0);
    }
  });
});

// ── 5. Internal only — the cap layer sends nothing anywhere ───────────────

describe("§8.2 stays internal (no SMS/email/WhatsApp automation)", () => {
  it("rate caps + capped actions contain no external transport", () => {
    for (const rel of ["lib/communication/rate-caps.ts", COMM_ACTIONS, INSTR_ACTIONS]) {
      const src = read(rel);
      for (const forbidden of ["fetch(", "nodemailer", "twilio", "whatsapp", "sendgrid", "smtp"]) {
        expect(src.toLowerCase(), `${rel} must not contain ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
