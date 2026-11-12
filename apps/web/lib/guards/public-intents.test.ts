import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ASSISTANT_HREF,
  PUBLIC_INTENTS,
  PUBLIC_INTENT_IDS,
} from "@/lib/navigation/public-intents";
import { CANONICAL_HOME } from "@/lib/config/navigation";
import { routeRequirement } from "@/lib/auth/role-gated-routes";

/**
 * PREMIUM NAVIGATION — the six public intents (owner P0 2026-11-12).
 *
 * What this proves, on every CI run:
 *  1. the six intents, in the owner's order, and no seventh;
 *  2. EVERY destination is a real page in the route tree (no dead card, no
 *     "coming soon" link) — checked against `app/[locale]/…/page.tsx`;
 *  3. a destination inside the signed-in product is never role-gated, so a
 *     link never promises a page the person will be refused; the public ones
 *     are never inside `/dashboard`;
 *  4. desktop and mobile render ONE list built in SiteNav (no second literal,
 *     no href spelled inside either menu);
 *  5. the disclosure pattern is accessible: aria-expanded/aria-controls,
 *     Escape returns focus, outside click and Tab-away close, 44px rows;
 *  6. every label exists, is non-empty and is not English in a non-English
 *     catalogue, in all 11 locales — and the frozen `nav` namespace is not
 *     where they live.
 */

const APP_ROOT = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const LOCALE_ROOT = join(APP_ROOT, "app", "[locale]");

function pageExists(href: string): boolean {
  const path = href.replace(/[?#].*$/, "").replace(/^\/+/, "");
  const candidates = [
    join(LOCALE_ROOT, path, "page.tsx"),
    join(LOCALE_ROOT, "(marketing)", path, "page.tsx"),
  ];
  return candidates.some((c) => existsSync(c));
}

const ALL_LINKS = PUBLIC_INTENTS.flatMap((i) =>
  i.links.map((l) => ({ intent: i.id, ...l })),
);

describe("the six intents", () => {
  it("are exactly the owner's six, in order", () => {
    expect(PUBLIC_INTENTS.map((i) => i.id)).toEqual([...PUBLIC_INTENT_IDS]);
    expect(PUBLIC_INTENT_IDS).toEqual([
      "work",
      "workers",
      "services",
      "orders",
      "partners",
      "agencies",
    ]);
  });

  it("each intent has at least one destination and unique link ids", () => {
    for (const intent of PUBLIC_INTENTS) {
      expect(intent.links.length, intent.id).toBeGreaterThan(0);
    }
    const ids = ALL_LINKS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("every destination is real and reachable for the right person", () => {
  it.each(ALL_LINKS.map((l) => [l.intent, l.id, l.href] as const))(
    "%s → %s (%s) is an existing page",
    (_intent, _id, href) => {
      expect(href.startsWith("/"), `${href} must be an internal path`).toBe(true);
      expect(pageExists(href), `${href} has no page.tsx under app/[locale]`).toBe(true);
    },
  );

  it("account destinations live in the signed-in product and are not role-gated", () => {
    for (const l of ALL_LINKS.filter((x) => x.account)) {
      const path = l.href.replace(/[?#].*$/, "");
      expect(path.startsWith("/dashboard"), `${l.id}: ${l.href}`).toBe(true);
      expect(
        routeRequirement(path),
        `${l.id}: ${l.href} is role-gated — a nav link would promise a refusal`,
      ).toBeNull();
    }
  });

  it("public destinations are public (never inside /dashboard)", () => {
    for (const l of ALL_LINKS.filter((x) => !x.account)) {
      expect(l.href.startsWith("/dashboard"), `${l.id}: ${l.href}`).toBe(false);
    }
  });

  it("the worker-facing hire path is the one canonical demand entry", () => {
    const workers = PUBLIC_INTENTS.find((i) => i.id === "workers");
    expect(workers?.links[0].href).toBe("/company-need");
    for (const l of ALL_LINKS) expect(l.href).not.toMatch(/^\/api\//);
  });
});

describe("desktop and mobile render ONE list", () => {
  const nav = read("components/layouts/site-nav.tsx");
  const mega = read("components/layouts/intent-mega-menu.tsx");
  const mobile = read("components/layouts/mobile-nav-menu.tsx");

  it("SiteNav builds the intents once and hands the same value to both menus", () => {
    expect(nav).toMatch(/PUBLIC_INTENTS\.map\(/);
    expect(nav).toMatch(/<IntentMegaMenu[\s\S]*?intents=\{intents\}/);
    expect(nav).toMatch(/<MobileNavMenu[\s\S]*?intents=\{intents\}/);
  });

  it("neither menu spells a route of its own", () => {
    for (const src of [mega, mobile]) {
      expect(src).not.toMatch(/href[=:]\s*["'`]\//);
    }
    expect(mega).toMatch(/href=\{link\.href\}/);
    expect(mobile).toMatch(/href=\{link\.href\}/);
  });

  it("the intent bar is the header's first level from lg up — the exact complement of the mobile menu", () => {
    expect(nav).toMatch(/<IntentMegaMenu\s+className="hidden [^"]*lg:block"/);
    expect(nav).toMatch(/<MobileNavMenu[\s\S]*?className="lg:hidden"/);
  });

  it("the bar shows every intent by name without opening anything", () => {
    expect(mega).toMatch(/intents\.map\(\(intent\) =>[\s\S]{0,1500}\{intent\.short\}/);
    // No single "menu" trigger hides the choices.
    expect(mega).not.toMatch(/triggerLabel/);
  });

  it("opening an intent moves focus to its first destination (two actions to start)", () => {
    expect(mega).toMatch(/\[data-intent-column="\$\{active\}"\] a/);
    expect(mega).toMatch(/\?\.focus\(\)/);
  });

  it("ONE navigation: the older links sit behind the bar's More, not in a second row", () => {
    expect(nav).not.toMatch(/<nav className="hidden[^"]*:flex/);
    expect(nav).toMatch(/more=\{\{\s*label: tIntent\("more"\),\s*links: links\.map\(/);
    expect(mega).toMatch(/data-testid="intent-toggle-more"/);
    expect(mega).toMatch(/data-testid="intent-more-links"/);
  });

  it("the assistant entry is the existing conversation home, on both menus", () => {
    expect(nav).toMatch(/href: ASSISTANT_HREF, label: tIntent\("assistant"\)/);
    expect(ASSISTANT_HREF).toBe(CANONICAL_HOME);
    expect(routeRequirement(ASSISTANT_HREF)).toBeNull();
    expect(nav.match(/assistant=\{assistant\}/g)).toHaveLength(2);
  });

  it("the landing shows the goals once: its bar drops them, inner pages keep them", () => {
    expect(nav).toMatch(/goalsOnPage = false/);
    expect(nav).toMatch(/<IntentMegaMenu[\s\S]*?goalsOnPage=\{goalsOnPage\}/);
    expect(mega).toMatch(/const intents = goalsOnPage \? \[\] : allIntents/);
    expect(read("app/[locale]/focus-landing/focus-landing.tsx")).toContain(
      "<SiteNav goalsOnPage />",
    );
    expect(read("app/[locale]/(marketing)/layout.tsx")).not.toMatch(/goalsOnPage/);
    // ONE goal bar element: the header's second row on inner pages, folded
    // into the first row on the landing (no sparse second row there).
    expect(nav.match(/<IntentMegaMenu/g)).toHaveLength(1);
    expect(nav).toMatch(/\{goalsOnPage \? megaMenu : <AssistantAsk variant="header"/);
    expect(nav).toMatch(/\{!goalsOnPage && megaMenu\}/);
  });

  it("the assistant input is on inner pages only and sends the words the landing's field sends", () => {
    // Header field and bottom bar: both only where the page has no sentence
    // field of its own.
    expect(nav).toMatch(/\{!goalsOnPage && <AssistantAsk variant="bar"/);
    expect(nav.match(/<AssistantAsk /g)).toHaveLength(2);
    expect(nav).toMatch(/name: PUBLIC_ENTRY_SAY_PARAM/);
    expect(nav).toMatch(/action: `\/\$\{locale\}\$\{ASSISTANT_HREF\}`/);
    // No second "ask the assistant" entry beside the input.
    expect(nav).toMatch(/askInHeader=\{!goalsOnPage\}/);
    expect(mega).toMatch(/\{assistant && !askInHeader && \(/);
    const ask = read("components/layouts/assistant-ask.tsx");
    expect(ask).toMatch(/method="get"/);
    expect(ask).not.toMatch(/href[=:]\s*["'`]\//);
    expect(ask).not.toMatch(/useTranslations/);
    // The bar leaves while another field has focus, and never covers the footer.
    expect(ask).toMatch(/focusin/);
    expect(ask).toMatch(/fieldBusy && "hidden"/);
    expect(ask).toMatch(/min-h-11/);
    expect(read("app/[locale]/(marketing)/layout.tsx")).toMatch(/aria-hidden className="h-16 lg:hidden"/);
  });

  it("the account-creating action is named Sign up, in the header and on the phone's first screen", () => {
    expect(nav).toMatch(/\{tIntent\("signUp"\)\}/);
    expect(nav).not.toMatch(/t\("startNow"\)/);
    const choice = read("components/marketing/landing-intent-choice.tsx");
    expect(choice).toMatch(/data-testid="landing-signup"/);
    expect(choice).toMatch(/auth\/signup/);
  });

  it("the strings live in `siteNav`, not the frozen `nav` namespace", () => {
    expect(nav).toMatch(/getTranslations\("siteNav"\)/);
  });
});

describe("the disclosure is accessible", () => {
  const mega = read("components/layouts/intent-mega-menu.tsx");
  const mobile = read("components/layouts/mobile-nav-menu.tsx");

  it("mega-menu: Escape returns focus, outside click and Tab-away close", () => {
    expect(mega).toMatch(/e\.key === "Escape"/);
    expect(mega).toMatch(/openerRef\.current\?\.focus\(\)/);
    expect(mega).toMatch(/mousedown/);
    expect(mega).toMatch(/onBlur=/);
    expect(mega).toMatch(/onClick=\{\(\)\s*=>\s*setActive\(null\)\}/);
    // Disclosure navigation, not an ARIA menu: links stay links.
    expect(mega).not.toMatch(/role="menu"/);
    expect(mega).not.toMatch(/role="menuitem"/);
  });

  it("panel titles are not headings, the icon-only assistant is 44px, account links are not prefetched", () => {
    // Independent review of e251185 (P3 x3).
    expect(mega).not.toMatch(/<h[1-6]\b/);
    expect(mega).toMatch(/data-testid="intent-bar-assistant"[\s\S]{0,120}min-h-11 min-w-11/);
    expect(mega).toMatch(/prefetch=\{link\.account \? false : undefined\}/);
    expect(mobile).toMatch(/prefetch=\{link\.account \? false : undefined\}/);
    expect(mega.match(/prefetch=\{false\}/g)).toHaveLength(1);
  });

  it("rows are 44px touch targets and motion respects reduced motion", () => {
    expect(mega).toMatch(/min-h-11/);
    expect(mobile).toMatch(/mobile-intent-toggle-[\s\S]{0,400}min-h-11/);
    expect(mega).toMatch(/motion-reduce:transition-none/);
    expect(mobile).toMatch(/motion-reduce:transition-none/);
  });

  it("renders six named, collapsed intents with no panel on first paint", async () => {
    vi.doMock("@/lib/i18n/navigation", () => ({
      Link: ({ href, children }: { href: string; children: unknown }) =>
        createElement("a", { href }, children as never),
    }));
    const { IntentMegaMenu } = await import("@/components/layouts/intent-mega-menu");
    const html = renderToStaticMarkup(
      createElement(IntentMegaMenu, {
        intents: [
          {
            id: "work",
            iconKey: "briefcase",
            title: "Looking for work",
            short: "Find work",
            description: "x",
            links: [{ id: "jobs", href: "/jobs", label: "Job board", account: false }],
          },
        ],
        navLabel: "Main choices",
        accountLabel: "After sign-in",
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/aria-controls="[^"]+"/);
    expect(html).toContain('aria-label="Main choices"');
    expect(html).toContain(">Find work<");
    expect(html).not.toContain('data-testid="intent-menu-panel"');
    expect(html).not.toContain("/jobs");
  });
});

describe("labels exist and are translated in all 11 locales", () => {
  const LOCALES = readdirSync(join(APP_ROOT, "messages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  type SiteNav = {
    trigger: string;
    account: string;
    assistant: string;
    more: string;
    intents: Record<string, { title: string; short: string; description: string }>;
    links: Record<string, string>;
  };
  const siteNav = (loc: string) =>
    (JSON.parse(read(`messages/${loc}.json`)) as { siteNav: SiteNav }).siteNav;
  const en = siteNav("en");

  function leaves(s: SiteNav): Array<[string, string]> {
    const out: Array<[string, string]> = [
      ["signUp", (s as unknown as { signUp: string }).signUp],
      ["ask.placeholder", (s as unknown as { ask: { placeholder: string } }).ask?.placeholder],
      ["ask.submit", (s as unknown as { ask: { submit: string } }).ask?.submit],
      ["trigger", s.trigger],
      ["account", s.account],
      ["assistant", s.assistant],
      ["more", s.more],
    ];
    for (const id of PUBLIC_INTENT_IDS) {
      out.push([`intents.${id}.title`, s.intents?.[id]?.title]);
      out.push([`intents.${id}.short`, s.intents?.[id]?.short]);
      out.push([`intents.${id}.description`, s.intents?.[id]?.description]);
    }
    for (const l of ALL_LINKS) out.push([`links.${l.id}`, s.links?.[l.id]]);
    return out;
  }

  it("all 11 catalogues are covered", () => {
    expect(LOCALES).toHaveLength(11);
  });

  it.each(LOCALES)("%s carries every siteNav label, translated", (loc) => {
    const s = siteNav(loc);
    const enLeaves = new Map(leaves(en));
    for (const [key, value] of leaves(s)) {
      expect(typeof value, `${loc} siteNav.${key} missing`).toBe("string");
      expect(value.trim(), `${loc} siteNav.${key} empty`).not.toBe("");
      expect(value, `${loc} siteNav.${key} placeholder`).not.toContain("[EN]");
      expect(value.toLowerCase(), `${loc} siteNav.${key}: banned word`).not.toMatch(/\bdemo\b/);
      if (loc !== "en") {
        expect(value, `${loc} siteNav.${key} is untranslated English`).not.toBe(
          enLeaves.get(key),
        );
      }
    }
  });
});
