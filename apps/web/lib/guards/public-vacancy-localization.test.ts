import { createElement, type AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import professions from "@/messages/lt/professions.json";
import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";

const readers = vi.hoisted(() => ({ preview: vi.fn(), session: vi.fn(), member: vi.fn() }));
vi.mock("@/lib/vacancy-store/public-vacancy-preview", () => ({ getPublicVacancyPreview: readers.preview }));
vi.mock("@/lib/vacancy-store/vacancy-read", () => ({ getPublicVacancyById: readers.member }));
vi.mock("@/lib/supabase/session-cookie", () => ({ hasSessionCookie: readers.session }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "member" } } }) } }),
}));
vi.mock("@/lib/opportunities/public-job-reading", () => ({ readPublicJobForMember: async () => null }));
vi.mock("@/lib/opportunities/saved-opportunities", () => ({ resolveOwnWorkerId: async () => null }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async ({ namespace }: { namespace?: string }) => {
    const labels: Record<string, string> = namespace === "professions" ? professions : {};
    return Object.assign((key: string) => labels[key] ?? key, { has: (key: string) => key in labels });
  },
}));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props),
}));
vi.mock("@/components/app/telemetry-view", () => ({ TelemetryView: () => null }));
vi.mock("@/components/app/tracked-cta", () => ({ TrackedCta: () => null }));
vi.mock("@/components/app/vacancy-translate-control", () => ({ VacancyTranslateControl: () => null }));
vi.mock("@/components/app/vacancy-interest-button", () => ({ VacancyInterestButton: () => null }));
vi.mock("@/components/marketing/save-vacancy-button", () => ({ SaveVacancyButton: () => null }));

import JobDetailPage from "@/app/[locale]/(marketing)/jobs/[id]/page";
import { PublicVacancyCard } from "@/components/marketing/public-vacancy-card";

/**
 * A FOREIGN AD NAMES ITS LANGUAGE, AND NEVER COMPETES WITH THE LOCALIZED TITLE.
 *
 * ── §6, owner walk on production `/lt`, 2026-09-27
 *
 * The owner saw four Swedish strings where Lithuanian was expected:
 * `Lagerarbetare`, `Barnvakt`, `Marknadsundersökare/Intervjuare`,
 * `Sjuksköterska, grundutbildad`. Traced to ONE component and TWO manifestations
 * of the SAME cause — `public-vacancy-card.tsx` rendering the publisher's
 * occupation with nothing attributing it:
 *
 *  A. AN AD WITH A MAPPED PROFESSION. The heading is the localized catalogue
 *     name, and `occupationSubline` then rendered the raw Swedish occupation as
 *     a BARE SECOND LINE directly beneath it — "Sandėlio darbininkas" with
 *     "Lagerarbetare" under it, nothing saying what that word is. That is the
 *     "unexplained Swedish duplicate title competing with the localized title"
 *     the owner named. `Lagerarbetare` (745 rows) and `Barnvakt` (191) both
 *     carry a slug the catalogue translates, which is exactly why reasoning
 *     about missing slugs never explained them.
 *
 *  B. AN AD WITH NO MAPPED PROFESSION. 30 049 of 53 392 active rows (56.3 %) have
 *     no `profession_slug`, so there is no localized name to head with and the
 *     publisher's own words become the heading — correct, and the only honest
 *     option, but it was presented with no statement that it is Swedish.
 *     `Sjuksköterska, grundutbildad` (1 710 slug-less rows) is this case.
 *
 * ── WHAT THE FIX IS NOT
 *
 * Nothing is translated and nothing leaves the platform. `translate_vacancy` has
 * no egress grant (owner decision 2026-09-22) and this change does not add one.
 * Localization and third-party AI egress are SEPARATE concerns: the catalogue
 * path below is free, local and already built, and the language disclosure is
 * the honest fallback where no localized representation exists.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

const CARD = "components/marketing/public-vacancy-card.tsx";
/** Every public surface that renders that card. */
const CALLERS = [
  "app/[locale]/(marketing)/jobs/page.tsx",
  "components/marketing/landing-open-jobs-band.tsx",
] as const;

describe("public vacancy card — the localized name is primary", () => {
  const card = read(CARD);

  const preview: PublicVacancyPreview = {
    id: "00000000-0000-4000-8000-000000000001", title: null,
    professionSlug: "warehouse_worker", occupation: "Lagerarbetare", sourceLanguage: "sv",
    employmentForm: null, workingTime: null, positions: null, compensationCurrency: null,
    compensationMin: null, compensationMax: null, attributionCode: null, publishedAt: null,
  };
  const params = Promise.resolve({ locale: "lt", id: preview.id });

  it.each([
    ["Lagerarbetare", "warehouse_worker", "sv", "Sandėlio darbuotojas", undefined],
    ["Specialistofficer", "driver", "sv", "Specialistofficer", "sv"],
    ["Doktorand/Elektriker", "electrician", "sv", professions.electrician, undefined],
    ["Specialistofficer", "driver", "invalid_language", "Specialistofficer", undefined],
    ["   ", null, "sv", "Darbo pasiūlymas", undefined],
  ] as const)("renders %j with stored profession %s and language %s on the card and detail", async (
    occupation, professionSlug, sourceLanguage, expectedName, expectedLang,
  ) => {
    const vacancy = { ...preview, professionSlug, occupation, sourceLanguage };
    readers.preview.mockResolvedValue(vacancy);
    readers.session.mockResolvedValue(false);
    const cardHtml = renderToStaticMarkup(createElement(PublicVacancyCard, {
      vacancy, locale: "lt", headingFallback: professionSlug ? professions[professionSlug] : undefined,
      genericTitle: "Darbo pasiūlymas", sourceLanguageLabel: "Skelbimo kalba",
    }));
    const detailHtml = renderToStaticMarkup(await JobDetailPage({ params }));
    const headings = [
      cardHtml.match(/<h2\b([^>]*)>([^<]+)<\/h2>/),
      detailHtml.match(/<h1\b([^>]*)>([^<]+)<\/h1>/),
    ];
    for (const heading of headings) {
      expect(heading?.[2]).toBe(expectedName);
      expect(heading?.[1].match(/\slang="([^"]+)"/)?.[1]).toBe(expectedLang);
    }
    if (professionSlug === "warehouse_worker") {
      expect(cardHtml).toMatch(/<span\b[^>]*lang="sv"[^>]*>Lagerarbetare<\/span>/);
      expect(detailHtml).toMatch(/<p\b[^>]*lang="sv"[^>]*>Lagerarbetare<\/p>/);
    }
  });

  it("marks the member title, source occupation and description as publisher text", async () => {
    readers.preview.mockResolvedValue(preview);
    readers.session.mockResolvedValue(true);
    readers.member.mockResolvedValue({ status: "ok", vacancy: {
      titleRaw: "Lagerarbete på kvällstid", descriptionRaw: "Plocka varor från hyllorna.",
      employer: { name: null }, location: { city: null, region: null, country: null },
    } });
    const html = renderToStaticMarkup(await JobDetailPage({ params }));
    expect(html).toMatch(/<h1\b[^>]*lang="sv"[^>]*>Lagerarbete på kvällstid<\/h1>/);
    expect(html).toMatch(/<p\b[^>]*lang="sv"[^>]*>Lagerarbetare<\/p>/);
    expect(html).toMatch(/<p\b[^>]*lang="sv"[^>]*>Plocka varor från hyllorna\.<\/p>/);
  });

  it("the source occupation is never a BARE line when the language is named", () => {
    // The defect: `occupationSubline` rendered on its own with no attribution.
    // It must now be folded into the language line when one is supplied.
    expect(card).toContain("sourceLanguageLabel");
    expect(card).toContain('data-testid="public-vacancy-source-language"');
    // The attributed line must carry the occupation INSIDE it…
    const attributed = card.slice(
      card.indexOf('data-testid="public-vacancy-source-language"'),
    );
    expect(attributed.slice(0, 600)).toMatch(/occupationSubline/);
    // …and the publisher's words keep their own `lang` for assistive tech
    // (WCAG 3.1.2) wherever they render.
    expect(card).toMatch(/lang=\{sourceLang\}/);
  });

  it("the publisher's words are never dropped — the original is preserved", () => {
    // Simplification may not delete source content. Both branches render it.
    expect(card).toMatch(/occupationSubline\s*\?/);
    expect(card).toMatch(/occupationSubline &&/);
  });
});

describe("every public vacancy surface says the same thing", () => {
  it("all of them name the ad's language from ONE shared key", () => {
    // `/jobs/[id]` already used this key; the board and the landing band now do
    // too, so three surfaces cannot drift into three phrasings. No new copy was
    // written for any locale.
    const surfaces = [
      ...CALLERS,
      "app/[locale]/(marketing)/jobs/[id]/page.tsx",
    ];
    for (const rel of surfaces) {
      expect(read(rel), `${rel} must use the shared key`).toContain(
        "vacancySources.language.originalIn",
      );
    }
  });

  it("all of them name it only when it is NOT the reader's language", () => {
    // Telling a Lithuanian reader that a Lithuanian ad is in Lithuanian is
    // noise, and noise in the first layer is what §1 bans.
    for (const rel of CALLERS) {
      expect(read(rel), `${rel} must compare against the active locale`).toMatch(
        /slice\(0,\s*2\) !==/,
      );
    }
  });

  it("all of them pass the localized profession as the heading fallback", () => {
    // If a caller forgets this, every ad on that surface heads with the
    // publisher's Swedish words even when the catalogue could name it.
    for (const rel of CALLERS) {
      expect(read(rel), `${rel} must pass headingFallback`).toContain(
        "headingFallback",
      );
      expect(read(rel), `${rel} must pass the language label`).toContain(
        "sourceLanguageLabel",
      );
    }
  });

  it("no surface translates the ad itself — the fallback stays honest", () => {
    // The disclosure is NOT a translation path. None of these may call the
    // translation runtime: that is grant-gated and ungranted.
    // Comments stripped first: the card's own comment NAMES `translate_vacancy`
    // to explain that it deliberately does not call it, and a raw scan reads the
    // explanation as the offence — which it did on the first run.
    const code = (src: string): string =>
      src
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const rel of [...CALLERS, CARD]) {
      const src = code(read(rel));
      expect(src, `${rel} must not run AI`).not.toContain("runAiAgent");
      expect(src, `${rel} must not translate vacancies`).not.toContain(
        "translate_vacancy",
      );
    }
  });
});
