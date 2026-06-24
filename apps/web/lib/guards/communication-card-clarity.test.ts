import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describeConversationCard,
  normalizeKind,
} from "@/lib/communication/conversation-display";

/**
 * Communication clarity guard (PR A).
 *
 * Owner rule: a conversation card MUST NOT render without telling the user
 * WHO (counterparty or honest unknown), WHAT (conversation type), and WHICH
 * CONTEXT (workspace/scope or honest unknown). This guard pins that contract
 * at three levels: the pure model, the page wiring, and i18n parity for the
 * honest-unknown copy.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Guard: conversation card model always carries type + counterparty + scope", () => {
  for (const kind of ["direct", "support", "team"] as const) {
    it(`${kind}: every field is a non-empty key`, () => {
      const m = describeConversationCard({ kind });
      expect(m.typeKey, "typeKey").toBe(`kind.${kind}`);
      expect(m.counterpartyKey, "counterpartyKey").toMatch(/^counterparty\.(support|unknown)$/);
      expect(m.scopeKey, "scopeKey").toMatch(/^scope\.(support|unknown)$/);
    });
  }

  it("support is honestly KNOWN (real support team / channel)", () => {
    const m = describeConversationCard({ kind: "support" });
    expect(m.counterpartyKnown).toBe(true);
    expect(m.scopeKnown).toBe(true);
    expect(m.counterpartyKey).toBe("counterparty.support");
    expect(m.scopeKey).toBe("scope.support");
  });

  it("direct / team are honest-UNKNOWN, not faked", () => {
    for (const kind of ["direct", "team"] as const) {
      const m = describeConversationCard({ kind });
      expect(m.counterpartyKnown, `${kind} counterparty`).toBe(false);
      expect(m.scopeKnown, `${kind} scope`).toBe(false);
      expect(m.counterpartyKey).toBe("counterparty.unknown");
      expect(m.scopeKey).toBe("scope.unknown");
    }
  });

  it("an unrecognised kind degrades safely (still a full, honest model)", () => {
    const m = describeConversationCard({ kind: "totally-unknown" });
    expect(normalizeKind("totally-unknown")).toBe("direct");
    expect(m.typeKey).toBe("kind.direct");
    expect(m.counterpartyKey).toBe("counterparty.unknown");
    expect(m.scopeKey).toBe("scope.unknown");
  });
});

describe("Guard: the communication page renders all three from the model", () => {
  const page = read("app/[locale]/dashboard/communication/page.tsx");
  it("imports + uses describeConversationCard", () => {
    expect(page).toContain("describeConversationCard");
    expect(page).toMatch(/const card = describeConversationCard\(/);
  });
  it("renders the type, counterparty and scope keys", () => {
    expect(page).toMatch(/t\(card\.typeKey\)/);
    expect(page).toMatch(/t\(card\.counterpartyKey\)/);
    expect(page).toMatch(/t\(card\.scopeKey\)/);
  });
  it("exposes per-card testids for type / counterparty / scope", () => {
    expect(page).toMatch(/conversation-type-\$\{c\.id\}/);
    expect(page).toMatch(/conversation-counterparty-\$\{c\.id\}/);
    expect(page).toMatch(/conversation-scope-\$\{c\.id\}/);
  });
});

describe("Guard: honest-unknown + support copy exists in all active locales", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: communication.counterparty.* and scope.* are present and non-empty`, () => {
      const j = JSON.parse(read(`messages/${loc}.json`)) as Record<string, unknown>;
      const comm = j.communication as Record<string, Record<string, string>>;
      for (const group of ["counterparty", "scope"] as const) {
        for (const key of ["support", "unknown"] as const) {
          const v = comm[group]?.[key];
          expect(v, `${loc}.communication.${group}.${key}`).toBeTruthy();
          expect(v.trim().length, `${loc}.communication.${group}.${key} non-empty`).toBeGreaterThan(0);
        }
      }
    });
  }
});
