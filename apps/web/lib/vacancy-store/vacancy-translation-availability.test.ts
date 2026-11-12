import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const servable = vi.fn<() => Promise<boolean>>();
const runAiAgent = vi.fn();
vi.mock("@/lib/ai/egress-precheck-server", () => ({ aiTaskServableNow: () => servable() }));
vi.mock("@/lib/ai/run-agent-server", () => ({ runAiAgent }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => `note:${key}`,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/billing/effective-entitlements", () => ({ getEffectiveEntitlements: vi.fn() }));
vi.mock("@/lib/vacancy-store/vacancy-read", () => ({ getPublicVacancyById: vi.fn() }));
vi.mock("@/lib/vacancy-store/vacancy-translation-read", () => ({ translateVacancyOnDemand: vi.fn() }));

const { vacancyTranslationAvailabilityAction } = await import("./vacancy-translation-action");

/**
 * The owner's condition on #3034, verbatim: "Tai nėra leidimas automatiškai
 * įjungti AI vertimą." The off note appears only when the pre-check says no,
 * and asking runs no provider.
 */
describe("vacancyTranslationAvailabilityAction only asks", () => {
  beforeEach(() => {
    servable.mockReset();
    runAiAgent.mockReset();
  });

  it("no provider allowed: the off note", async () => {
    servable.mockResolvedValue(false);
    await expect(vacancyTranslationAvailabilityAction()).resolves.toEqual({ on: false, note: "note:notSwitchedOn" });
  });

  it("a question that fails to answer is off, never a button that may fail", async () => {
    servable.mockRejectedValue(new Error("no answer"));
    await expect(vacancyTranslationAvailabilityAction()).resolves.toEqual({ on: false, note: "note:notSwitchedOn" });
  });

  it("a provider allowed: no note, the button stays", async () => {
    servable.mockResolvedValue(true);
    await expect(vacancyTranslationAvailabilityAction()).resolves.toEqual({ on: true });
  });

  it("asking never runs a provider", async () => {
    servable.mockResolvedValue(true);
    await vacancyTranslationAvailabilityAction();
    servable.mockResolvedValue(false);
    await vacancyTranslationAvailabilityAction();
    expect(runAiAgent).not.toHaveBeenCalled();
  });
});

describe("the control offers the button only when the answer is yes", () => {
  const src = readFileSync(join(process.cwd(), "components/app/vacancy-translate-control.tsx"), "utf8");

  it("nothing before the answer, the note when off, the button after that", () => {
    const waiting = src.indexOf("if (availability === null) return null;");
    const off = src.indexOf('data-testid="vacancy-translate-off"');
    const button = src.indexOf('data-testid="vacancy-translate-button"');
    expect(waiting).toBeGreaterThan(-1);
    expect(off).toBeGreaterThan(waiting);
    expect(button).toBeGreaterThan(off);
  });

  it("the off note exists in every active locale, in the claim rule's wording", () => {
    for (const l of ["lt", "en", "ru", "nl", "de", "pl"]) {
      const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8")) as {
        vacancySources: { language: Record<string, string> };
      };
      expect(m.vacancySources.language.notSwitchedOn, l).toBeTruthy();
    }
  });
});
