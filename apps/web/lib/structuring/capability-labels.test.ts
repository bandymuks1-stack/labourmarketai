import { describe, expect, it } from "vitest";
import {
  localizeCapabilityLabel,
  CAPABILITY_LABEL_I18N,
} from "@/lib/structuring/capability-labels";

const HANDOVER = "Darbų pristatymas klientui";

describe("localizeCapabilityLabel — client handover signal", () => {
  it("LT renders the Lithuanian label", () => {
    expect(localizeCapabilityLabel(HANDOVER, "lt")).toBe(
      "Darbų pristatymas klientui",
    );
  });
  it("EN renders 'Work handover to client'", () => {
    expect(localizeCapabilityLabel(HANDOVER, "en")).toBe(
      "Work handover to client",
    );
  });
  it("RU renders 'Передача работ клиенту'", () => {
    expect(localizeCapabilityLabel(HANDOVER, "ru")).toBe(
      "Передача работ клиенту",
    );
  });
  it("EN and RU do NOT render the Lithuanian label", () => {
    expect(localizeCapabilityLabel(HANDOVER, "en")).not.toBe(HANDOVER);
    expect(localizeCapabilityLabel(HANDOVER, "ru")).not.toBe(HANDOVER);
  });
  it("LT does not render a raw English slug (label is a human phrase)", () => {
    const lt = localizeCapabilityLabel(HANDOVER, "lt");
    expect(/^[a-z][a-z0-9-]*$/.test(lt)).toBe(false);
    expect(lt).not.toMatch(/handover|client/i);
  });
});

describe("localizeCapabilityLabel — owner-example capability signals", () => {
  // Every translated label must differ from its LT key in EN and RU, and EN/RU
  // must be non-empty (no LT leak, no blank).
  for (const [lt, { en, ru }] of Object.entries(CAPABILITY_LABEL_I18N)) {
    it(`"${lt}" has distinct, non-empty EN + RU`, () => {
      expect(localizeCapabilityLabel(lt, "en")).toBe(en);
      expect(localizeCapabilityLabel(lt, "ru")).toBe(ru);
      expect(en.trim().length).toBeGreaterThan(0);
      expect(ru.trim().length).toBeGreaterThan(0);
      expect(en).not.toBe(lt);
      expect(ru).not.toBe(lt);
      // RU label is Cyrillic (never the Latin LT label).
      expect(/[А-Яа-яЁё]/.test(ru)).toBe(true);
    });
  }
});

describe("localizeCapabilityLabel — fallback for untranslated labels", () => {
  it("falls back to the LT label (never a slug, never empty) for unknown keys", () => {
    // A broader LT-only capability (documented RED) still renders its LT label.
    expect(localizeCapabilityLabel("Maisto gamyba", "en")).toBe("Maisto gamyba");
    expect(localizeCapabilityLabel("Maisto gamyba", "ru")).toBe("Maisto gamyba");
    expect(localizeCapabilityLabel("Maisto gamyba", "lt")).toBe("Maisto gamyba");
  });
});
