import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeConversationCard } from "@/lib/communication/conversation-display";

/**
 * Counterpart trust hotfix guard (message-counterpart-trust-hotfix-p0).
 *
 * Owner production correction: PR #504 shipped a direct-conversation counterpart
 * as a bland "Recipient not specified" / "Pašnekovas nepatikslintas", which
 * reads as a normal-but-empty participant state. That is not acceptable: when
 * the co-participant identity is not readable, the UI must say the details are
 * NOT SHOWN YET and look system-limited (restricted), never like a normal
 * unspecified recipient — and it must never invent a name, permission, contact
 * button, participant, or receipt.
 *
 * This guard locks:
 *   1. the model marks direct/team counterpart as RESTRICTED (not "unknown");
 *   2. the banned "not specified" copy is gone from every served locale;
 *   3. the restricted copy exists in every served locale (lt/en/ru);
 *   4. both pages render the restricted state with a locked, system-limited
 *      treatment (`data-restricted="true"` + a lock icon), keyed off the model
 *      flag — not a plain muted name;
 *   5. no fake counterpart name / participant read / contact button is wired
 *      into the communication pages by this hotfix.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const SERVED = ["lt", "en", "ru"] as const;
const LIST = "app/[locale]/dashboard/communication/page.tsx";
const DETAIL = "app/[locale]/dashboard/communication/[conversationId]/page.tsx";

// The exact strings the owner banned as normal-looking labels.
const BANNED = [
  "Recipient not specified",
  "Pašnekovas nepatikslintas",
  "Собеседник не указан",
];

describe("model: direct/team counterpart is a restricted, details-not-shown state", () => {
  it("direct → restricted, not known, restricted key", () => {
    const m = describeConversationCard({ kind: "direct", createdBy: "a", viewerId: "b" });
    expect(m.counterpartyKnown).toBe(false);
    expect(m.counterpartyRestricted).toBe(true);
    expect(m.counterpartyKey).toBe("counterparty.restricted");
  });
  it("team → restricted too", () => {
    const m = describeConversationCard({ kind: "team" });
    expect(m.counterpartyRestricted).toBe(true);
    expect(m.counterpartyKey).toBe("counterparty.restricted");
  });
  it("support → KNOWN, never restricted (real channel)", () => {
    const m = describeConversationCard({ kind: "support" });
    expect(m.counterpartyKnown).toBe(true);
    expect(m.counterpartyRestricted).toBe(false);
    expect(m.counterpartyKey).toBe("counterparty.support");
  });
  it("carries an i18n key only — never a raw id or invented name", () => {
    const m = describeConversationCard({ kind: "direct", createdBy: "abc-123", viewerId: "xyz-789" });
    expect(JSON.stringify(m)).not.toContain("abc-123");
    expect(JSON.stringify(m)).not.toContain("xyz-789");
  });
});

describe("copy: banned 'not specified' label is gone; restricted copy present (served locales)", () => {
  for (const loc of SERVED) {
    it(`${loc}: no banned counterpart label anywhere in the message file`, () => {
      const text = read(`messages/${loc}.json`);
      for (const banned of BANNED) {
        expect(text.includes(banned), `banned label still present in ${loc}: "${banned}"`).toBe(false);
      }
    });
    it(`${loc}: communication.counterparty.restricted exists and is non-empty`, () => {
      const json = JSON.parse(read(`messages/${loc}.json`)) as {
        communication?: { counterparty?: Record<string, string> };
      };
      const c = json.communication?.counterparty ?? {};
      expect(c.restricted?.trim().length, `${loc} counterparty.restricted`).toBeGreaterThan(0);
      // The renamed key must not leave a stale "unknown" duplicate behind.
      expect(c.unknown, `${loc} still has stale counterparty.unknown`).toBeUndefined();
    });
  }
});

describe("render: restricted counterpart is a locked, system-limited treatment in both pages", () => {
  for (const rel of [LIST, DETAIL]) {
    it(`${rel} renders the restricted branch off the model flag`, () => {
      const src = read(rel);
      expect(src).toMatch(/card\.counterpartyRestricted/);
      expect(src).toMatch(/data-restricted="true"/);
      expect(src).toMatch(/<Lock\b/);
      expect(src).toMatch(/t\(card\.counterpartyKey\)/);
    });
  }
});

describe("no fakery wired by this hotfix (names / participants / contact buttons)", () => {
  for (const rel of [LIST, DETAIL]) {
    it(`${rel} adds no co-participant identity name or contact button`, () => {
      const src = read(rel);
      // No co-participant profile/name surfaced (identity stays the owner-gated
      // bridge — documented RED). The existing conversation_participants read is
      // last_read_at only (unread state), never an identity/name join.
      expect(src).not.toMatch(/counterpartyName|participantName|otherProfile|displayName|profiles\([^)]*name/i);
      // No stranger-contact CTA wired into the thread surfaces.
      expect(src).not.toMatch(/MessageButton|RequestCommunicationButton/);
    });
  }
});
