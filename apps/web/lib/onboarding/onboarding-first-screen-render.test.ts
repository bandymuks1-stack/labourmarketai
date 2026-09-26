import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

/**
 * The onboarding FIRST SCREEN as a new person receives it (owner correction
 * 2026-09-26): "Pradėkime", one line on what LabourMarket.ai is for, the
 * multi-select note, SIX context cards in the owner's order, and "Tęsti".
 * The worker-only Darbo žurnalas box is gone from this universal screen.
 * Rendered over the REAL catalogues, so a missing or stale key fails here.
 */
vi.mock("@/lib/auth/actions", () => ({ completeOnboarding: async () => {} }));
vi.mock("@/lib/telemetry/task", () => ({ trackFunnel: () => {} }));
vi.mock("@/lib/telemetry/attribution", () => ({ getFirstTouchAttribution: () => ({}) }));

const { OnboardingWizard } = await import("@/components/app/onboarding-wizard");

const WEB = join(__dirname, "..", "..");
const LOCALES = ["lt", "en", "da", "de", "et", "lv", "nl", "no", "pl", "ru", "sv"];
const catalog = (loc: string) => JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8"));
const ORDER = ["work", "member", "hire", "agency", "student", "education"];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

function render(loc: string, defaultIntents: string[] = []) {
  const m = catalog(loc);
  const props = {
    locale: loc,
    messages: { auth: m.auth, professions: m.professions ?? {} },
    onError: () => {},
  } as unknown as ComponentProps<typeof NextIntlClientProvider>;
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      props,
      createElement(OnboardingWizard, {
        defaultName: "",
        educationTypeOptions: [],
        defaultIntents: defaultIntents as never,
      }),
    ),
  );
}

describe("onboarding first screen — contexts, not an episode of searching", () => {
  it("lt: the owner's exact heading, explanation, note and six cards in order, then Tęsti", () => {
    const html = render("lt");
    expect(html).toContain(">Pradėkime</h1>");
    expect(html).toContain(
      "LabourMarket.ai padeda kaupti profesinę istoriją, valdyti dabartinį darbą ir atrasti naujas galimybes.",
    );
    expect(html).toContain("Galite pasirinkti kelis variantus ir vėliau juos pakeisti.");
    const titles = [
      "Dirbu / turiu profesinės patirties",
      "Esu įmonės ar komandos dalis",
      "Vadovauju įmonei ar komandai",
      "Dirbu su darbuotojų atranka ar tiekimu",
      "Mokausi / ruošiuosi profesijai",
      "Atstovauju mokymo įstaigai",
    ];
    let at = 0;
    for (const [i, title] of titles.entries()) {
      const pos = html.indexOf(`data-testid="onboarding-intent-${ORDER[i]}"`, at);
      expect(pos, ORDER[i]).toBeGreaterThan(-1);
      expect(html.indexOf(esc(title), pos), title).toBeGreaterThan(pos);
      at = pos;
    }
    expect(html.match(/data-testid="onboarding-intent-[a-z]+"/g)).toHaveLength(6);
    expect(html).toContain('data-testid="onboarding-intents-continue"');
    expect(html).toContain(">Tęsti</button>");
  });

  it("the old episodic cards and the worker-only journal box are gone from this screen", () => {
    const html = render("lt");
    for (const old of [
      "Pasirinkite, kas jums tinka",
      "Ieškau darbo",
      "Man reikia darbuotojų",
      "Esu studentas",
      "tik pradžios taškas",
      "vertingiausia tavo CV dalis",
    ]) {
      expect(html, old).not.toContain(old);
    }
  });

  it("multi-select: every card is a toggle; nothing is pre-chosen, Continue waits for a choice", () => {
    const html = render("lt");
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(6);
    expect(html).toMatch(/data-testid="onboarding-intents-continue"[^>]*disabled=""|disabled=""[^>]*data-testid="onboarding-intents-continue"/);
    // Several pre-ticked contexts (a landing door or sentence) stay several.
    const many = render("lt", ["work", "member", "hire"]);
    expect(many.match(/aria-pressed="true"/g)).toHaveLength(3);
    expect(many.match(/aria-pressed="false"/g)).toHaveLength(3);
  });

  it("desktop: one card height for all six (every row as tall as the tallest card); mobile stays natural", () => {
    const html = render("lt");
    const grid = html.match(/<ul class="([^"]*)" data-testid="onboarding-intents"/);
    expect(grid, "the card grid").not.toBeNull();
    const gridClasses = grid![1].split(/\s+/);
    expect(gridClasses).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "gap-3", "sm:grid-cols-2", "sm:auto-rows-fr"]));
    // Equal rows only from the two-column breakpoint up — never on mobile.
    expect(gridClasses).not.toContain("auto-rows-fr");
    for (const intent of ORDER) {
      const card = html.match(new RegExp(`<button[^>]*data-testid="onboarding-intent-${intent}"[^>]*class="([^"]*)"|<button[^>]*class="([^"]*)"[^>]*data-testid="onboarding-intent-${intent}"`));
      const classes = (card?.[1] ?? card?.[2] ?? "").split(/\s+/);
      expect(classes, intent).toContain("sm:h-full");
      expect(classes, intent).not.toContain("h-full");
    }
  });

  it("every catalogue carries the screen: heading, explanation, note, six titled cards, no journal box", () => {
    for (const loc of LOCALES) {
      const rp = catalog(loc).auth.onboarding.rolePicker;
      expect(rp.intentHeading, loc).toMatch(/\S/);
      expect(rp.intentLead, loc).toMatch(/LabourMarket\.ai/);
      expect(rp.intentNote, loc).toMatch(/\S/);
      expect(Object.keys(rp.intent), loc).toEqual(ORDER);
      for (const k of ORDER) {
        expect(rp.intent[k].title, `${loc}.${k}.title`).toMatch(/\S/);
        expect(rp.intent[k].desc, `${loc}.${k}.desc`).toMatch(/\S/);
        expect(rp.intent[k].title, `${loc}.${k}`).not.toMatch(/^\[EN\]/);
      }
      expect(rp.infoBox, loc).toBeUndefined();
      const html = render(loc);
      expect(html, loc).toContain(esc(rp.intentHeading));
      expect(html.match(/data-testid="onboarding-intent-[a-z]+"/g), loc).toHaveLength(6);
    }
  });
});
