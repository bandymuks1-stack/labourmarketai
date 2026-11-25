import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  search: vi.fn(),
  detail: vi.fn(),
  ownership: vi.fn(),
  cookie: vi.fn(),
  push: vi.fn(),
  navigationPending: false,
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useTransition: () => [io.navigationPending, (action: () => void) => action()] as const,
}));
vi.mock("@/lib/services/public-service-offerings", () => ({
  searchPublicServiceOfferings: io.search,
  getPublicServiceOffering: io.detail,
}));
vi.mock("@/lib/services/service-offerings", () => ({ readServiceOfferingOwnership: io.ownership }));
vi.mock("@/lib/supabase/session-cookie", () => ({ hasSessionCookie: io.cookie }));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push: io.push }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async (namespace: string) => (key: string, args?: Record<string, unknown>) =>
    namespace + "." + key + (args ? ":" + JSON.stringify(args) : ""),
}));
vi.mock("@/components/app/person-service-request-button", () => ({
  PersonServiceRequestButton: ({ offeringId }: { offeringId: string }) =>
    createElement("button", { "data-testid": "canonical-request", "data-offering": offeringId }, "Request"),
}));

import PublicServicesPage from "@/app/[locale]/(marketing)/services/page";
import PublicServicePage from "@/app/[locale]/(marketing)/services/[id]/page";

const id = "10000000-0000-0000-0000-000000000001";
const offering = {
  id, title: "Fixture service", description: "Fixture description", categorySlug: "repair",
  locationCountry: "LT", remote: true, rateText: "30 EUR/h", createdAt: "2026-11-25T00:00:00Z",
};
const params = () => Promise.resolve({ locale: "lt", id });
const renderList = async (searchParams: Record<string, string> = {}) =>
  renderToStaticMarkup(await PublicServicesPage({ params: params(), searchParams: Promise.resolve(searchParams) }));
const renderDetail = async () => renderToStaticMarkup(await PublicServicePage({ params: params() }));

beforeEach(() => {
  vi.clearAllMocks();
  io.navigationPending = false;
  io.search.mockResolvedValue({ kind: "ok", rows: [offering], page: 1, pageSize: 6, hasMore: false });
  io.detail.mockResolvedValue({ kind: "ok", offering });
  io.cookie.mockResolvedValue(false);
  io.ownership.mockResolvedValue("not-own");
});

describe("public service search uses real results and addressable filters", () => {
  it("renders the returned service and preserves filters in the next-page link", async () => {
    io.search.mockResolvedValue({ kind: "ok", rows: [offering], page: 2, pageSize: 6, hasMore: true });
    const html = await renderList({ q: " paint & repair ", country: "lt", category: "repair", page: "2" });
    expect(io.search).toHaveBeenCalledWith({ query: "paint & repair", country: "LT", category: "repair", page: 2 });
    expect(html).toContain('href="/services/' + id + '"');
    expect(html).toContain("Fixture service");
    expect(html).toContain('href="/services?q=paint+%26+repair&amp;country=LT&amp;category=repair&amp;page=3"');
    expect(html).toContain('role="search"');
  });

  it("offers localized country names while preserving ISO filter values and every country", async () => {
    const html = await renderList({ country: "LT" });
    expect(html).toContain('<select');
    expect(html).toContain('name="country"');
    expect(html).toContain('data-testid="public-services-country"');
    expect(html).toContain('<option value="">publicServices.allCountries</option>');
    expect(html).toContain('<option value="LT" selected="">Lietuva</option>');
    expect(html).toContain('<option value="NZ">Naujoji Zelandija</option>');
    expect(html.match(/<option /g)?.length).toBeGreaterThan(240);
    expect(html).toContain('<span>Lietuva</span>');
    expect(html).not.toContain('placeholder="LT"');
  });

  it("preserves an unknown returned country honestly instead of inventing its name", async () => {
    io.search.mockResolvedValue({ kind: "ok", rows: [{ ...offering, locationCountry: "ZZ" }], page: 1, pageSize: 6, hasMore: false });
    expect(await renderList()).toContain('<span>ZZ</span>');
  });

  it("does not call an unavailable read an empty market", async () => {
    io.search.mockResolvedValue({ kind: "unavailable" });
    const html = await renderList();
    expect(html).toContain('data-testid="public-services-unavailable"');
    expect(html).not.toContain('data-testid="public-services-empty"');
    expect(html).not.toContain("Fixture service");
  });

  it("keeps native GET navigation and announces an actual pending search", async () => {
    const idle = await renderList();
    expect(idle).toContain('method="get"');
    expect(idle).toContain('action="/lt/services"');
    expect(idle).not.toContain('aria-busy="true"');
    expect(idle).not.toContain('data-testid="button-spinner"');

    io.navigationPending = true;
    const pending = await renderList();
    expect(pending).toContain('aria-busy="true"');
    expect(pending).toContain('disabled=""');
    expect(pending).toContain('data-testid="button-spinner"');
    expect(pending).toContain('<span role="status" class="sr-only">common.loading</span>');
  });

  it("shows a real empty state with no invented offering", async () => {
    io.search.mockResolvedValue({ kind: "ok", rows: [], page: 1, pageSize: 6, hasMore: false });
    const html = await renderList();
    expect(html).toContain("publicServices.empty");
    expect(html).not.toContain('data-testid="public-service-result"');
  });

  it("distinguishes no filter match and provides one reset action", async () => {
    io.search.mockResolvedValue({ kind: "ok", rows: [], page: 1, pageSize: 6, hasMore: false });
    const html = await renderList({ q: "unmatched" });
    expect(html).toContain("publicServices.emptyFiltered");
    expect(html.match(/publicServices.clear/g)).toHaveLength(1);
  });

  it("explains the bounded search at page 100 without a Next 101 loop", async () => {
    io.search.mockResolvedValue({ kind: "ok", rows: [offering], page: 100, pageSize: 6, hasMore: true });
    const html = await renderList({ page: "100" });
    expect(html).toContain("publicServices.refine");
    expect(html).toContain("page=99");
    expect(html).not.toContain("page=101");
    expect(html).not.toContain(">publicServices.next<");
  });
});

describe("public service contact keeps the existing authenticated request path", () => {
  it("anonymous visitors read details without an auth lookup and return to this exact service after login", async () => {
    const html = await renderDetail();
    expect(io.ownership).not.toHaveBeenCalled();
    expect(html).toContain("Fixture description");
    expect(html).toContain(">Lietuva</dd>");
    expect(html).toContain('href="/auth/login?next=' + encodeURIComponent("/lt/services/" + id) + '"');
    expect(html).not.toContain('data-testid="canonical-request"');
  });

  it("keeps an unknown country code as the honest detail fallback", async () => {
    io.detail.mockResolvedValue({ kind: "ok", offering: { ...offering, locationCountry: "ZZ" } });
    expect(await renderDetail()).toContain(">ZZ</dd>");
  });

  it("members use the canonical request component with the exact offering id", async () => {
    io.cookie.mockResolvedValue(true);
    const html = await renderDetail();
    expect(io.ownership).toHaveBeenCalledWith(id);
    expect(html).toContain('data-testid="canonical-request"');
    expect(html).toContain('data-offering="' + id + '"');
    expect(html).not.toContain("public-service-login");
  });

  it("owners get management instead of a self-request", async () => {
    io.cookie.mockResolvedValue(true);
    io.ownership.mockResolvedValue("own");
    const html = await renderDetail();
    expect(html).toContain('href="/dashboard/services"');
    expect(html).not.toContain('data-testid="canonical-request"');
  });

  it("does not offer a request if the ownership read failed", async () => {
    io.cookie.mockResolvedValue(true);
    io.ownership.mockResolvedValue("unavailable");
    const html = await renderDetail();
    expect(html).toContain("publicServices.contactUnavailable");
    expect(html).not.toContain('data-testid="canonical-request"');
  });

  it("withdrawn or non-public service IDs produce not-found instead of an auth door", async () => {
    io.detail.mockResolvedValue({ kind: "not-found" });
    await expect(renderDetail()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(io.ownership).not.toHaveBeenCalled();
  });

  it("a failed detail read stays distinct from not-found", async () => {
    io.detail.mockResolvedValue({ kind: "unavailable" });
    expect(await renderDetail()).toContain('data-testid="public-service-unavailable"');
  });
});

describe("public consent and copy boundaries", () => {
  const root = resolve(__dirname, "..", "..");
  const source = readFileSync(resolve(root, "components/app/service-offerings-section.tsx"), "utf8");

  it("new offerings default to no public consent and legacy rollout omits the field", () => {
    expect(source).toMatch(/const EMPTY_DRAFT[\s\S]*?publicSearchEnabled: false/);
    expect(source).toContain("publicSearchSupported = false");
    expect(source).toContain("row.publicSearchEnabled === true");
    expect(source).toContain("...(publicSearchSupported ? { publicSearchEnabled: draft.publicSearchEnabled } : {})");
    expect(source).toContain('aria-describedby="service-offering-public-hint"');
  });

  it("all seven active catalogs have identical, non-placeholder public service keys", () => {
    const locales = ["lt", "en", "ru", "nl", "de", "pl", "sv"];
    let keys: string[] | undefined;
    for (const locale of locales) {
      const messages = JSON.parse(readFileSync(resolve(root, "messages", locale + ".json"), "utf8"));
      const copy = messages.publicServices as Record<string, string>;
      keys ??= Object.keys(copy).sort();
      expect(Object.keys(copy).sort()).toEqual(keys);
      for (const value of Object.values(copy)) {
        expect(value.trim()).not.toBe("");
        expect(value).not.toContain("[EN]");
      }
      expect(messages.serviceOfferings.form.publicHint).not.toContain("[EN]");
      expect(messages.serviceOfferings.form.publicLabel).not.toContain("[EN]");
    }
  });
});
