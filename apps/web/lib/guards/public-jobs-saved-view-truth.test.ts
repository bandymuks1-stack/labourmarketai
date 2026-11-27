import { createElement, type AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { activeLocales, type ActiveLocale } from "@/lib/i18n/config";
import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), worker: vi.fn(), saved: vi.fn(), previews: vi.fn(),
  search: vi.fn(), facts: vi.fn(), telemetry: vi.fn(), createClient: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async () => Object.assign((key: string) => key, { has: () => false })),
}));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props),
  redirect: () => { throw new Error("Unexpected redirect"); },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/session-cookie", () => ({ hasSessionCookie: mocks.session }));
vi.mock("@/lib/opportunities/saved-opportunities", () => ({
  resolveOwnWorkerId: mocks.worker,
  listSavedPublicVacancyIds: mocks.saved,
}));
vi.mock("@/lib/vacancy-store/public-vacancy-preview", () => ({
  searchPublicVacancyPreviews: mocks.search,
}));
vi.mock("@/lib/vacancy-store/vacancy-read", () => ({
  listPublicVacancyPreviewsByIds: mocks.previews,
  listMemberVacancyFactsByIds: mocks.facts,
}));
vi.mock("@/components/app/telemetry-view", () => ({
  TelemetryView: (props: unknown) => { mocks.telemetry(props); return null; },
}));

import JobsPage from "@/app/[locale]/(marketing)/jobs/page";

const vacancy: PublicVacancyPreview = {
  id: "00000000-0000-4000-8000-000000000001", title: "Synthetic saved job",
  professionSlug: null, occupation: null, employmentForm: null, workingTime: null,
  positions: null, compensationCurrency: null, compensationMin: null,
  compensationMax: null, sourceLanguage: null, attributionCode: "vacancySources.attribution.nav", publishedAt: null,
};
const unavailableCopy: Record<ActiveLocale, string> = {
  en: "The saved jobs are no longer available.",
  lt: "Išsaugoti darbo skelbimai nebeprieinami.",
  ru: "Сохранённые вакансии больше недоступны.",
  nl: "De bewaarde vacatures zijn niet meer beschikbaar.",
  de: "Die gemerkten Stellen sind nicht mehr verfügbar.",
  pl: "Zapisane oferty nie są już dostępne.",
  sv: "De sparade jobben är inte längre tillgängliga.",
};
async function render(locale: ActiveLocale = "en") {
  return renderToStaticMarkup(await JobsPage({
    params: Promise.resolve({ locale }), searchParams: Promise.resolve({ saved: "1" }),
  }));
}
function expectReadFailure(html: string) {
  expect(html).toContain('data-testid="public-jobs-saved-unavailable"');
  expect(html).not.toContain('data-testid="public-jobs-saved-empty"');
  expect(html).not.toContain('data-testid="public-jobs-list"');
  expect(html).not.toMatch(/Saved \(\d+\)/);
  expect(html).toContain('href="/jobs"');
  expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.telemetry).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({ success: false, surface: "public_jobs_saved" }),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue(true);
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "own-profile" } } }) } });
  mocks.worker.mockResolvedValue("own-worker");
  mocks.saved.mockResolvedValue({ vacancyIds: new Set([vacancy.id]), available: true });
  mocks.previews.mockResolvedValue({ status: "ok", previews: [] });
  mocks.facts.mockResolvedValue(new Map());
  mocks.search.mockResolvedValue({ status: "ok", vacancies: [], totalCount: 0, hasMore: false });
});

describe("the real saved-jobs page distinguishes missing ads from read failures", () => {
  it.each(activeLocales)("uses the unavailable-ad message in %s instead of claiming no bookmarks", async (locale) => {
    const html = await render(locale);
    expect(html).toContain(unavailableCopy[locale]);
    expect(html).toContain('data-testid="public-jobs-saved-empty"');
    expect(html).toContain("(0)");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("only a genuinely empty bookmark list says nothing was saved", async () => {
    mocks.saved.mockResolvedValue({ vacancyIds: new Set(), available: true });
    const html = await render();
    expect(html).toContain("You have not saved any job yet.");
    expect(html).not.toContain(unavailableCopy.en);
  });

  it("counts and links only available ads, preserving existing source labels", async () => {
    mocks.saved.mockResolvedValue({ vacancyIds: new Set([vacancy.id, "expired-1", "withdrawn-2"]), available: true });
    mocks.previews.mockResolvedValue({ status: "ok", previews: [vacancy] });
    const html = await render();
    expect(html).toContain("Saved (1)");
    expect(html).not.toContain("Saved (3)");
    expect(html).toContain(`href="/jobs/${vacancy.id}"`);
    expect(html).toContain("Synthetic saved job");
    expect(html).toContain("NAV");
    expect(mocks.facts).toHaveBeenCalledWith(expect.anything(), [vacancy.id]);
  });

  it("a returned read failure keeps the error state and navigation", async () => {
    mocks.previews.mockResolvedValue({ status: "not_provisioned" });
    expectReadFailure(await render());
  });

  it("a thrown preview read does not crash the page or erase bookmarks", async () => {
    mocks.previews.mockRejectedValue(new Error("synthetic read failure"));
    expectReadFailure(await render());
  });

  it("a failed bookmark read never substitutes unrelated public jobs", async () => {
    mocks.saved.mockResolvedValue({ vacancyIds: new Set(), available: false });
    expectReadFailure(await render());
    expect(mocks.previews).not.toHaveBeenCalled();
  });

  it("an anonymous visit cannot read any member bookmarks", async () => {
    mocks.session.mockResolvedValue(false);
    const html = await render();
    expect(html).not.toContain('data-testid="public-jobs-tabs"');
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(mocks.previews).not.toHaveBeenCalled();
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });

  it("a signed-in account without a worker profile keeps the public board", async () => {
    mocks.worker.mockResolvedValue(null);
    const html = await render();
    expect(html).not.toContain('data-testid="public-jobs-tabs"');
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(mocks.previews).not.toHaveBeenCalled();
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });
});