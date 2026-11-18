import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page, type Route } from "./prod-walk";

import { activeLocales, type ActiveLocale } from "../../lib/i18n/config";
import { PRODUCTION_ORIGIN } from "../../lib/testing/prod-qa-guard";
import { clickUntilVisible } from "./click-until-visible";
import { PRODUCTION_APP_ORIGIN } from "./prod-qa-api";

/**
 * REGISTER WALK GAPS — READ-ONLY production proof for function-register rows
 * that had production facts but no walk of their own (2026-11-18 review of
 * docs/program/FUNCTION_REGISTER.md, "NOT VERIFIED function rows"). Dispatch
 * only (spec=register-walk-gaps), never in the rotation.
 *
 *   W-1 (1.2, 8.1)  the Google door, signed out, on sign-in AND sign-up in
 *                   every routed locale (`activeLocales`): the page is in its
 *                   own language (html lang, the Google label from that
 *                   locale's messages file), exactly one Google button, and
 *                   pressing it starts the ONE approved flow — a same-tab
 *                   navigation to the production auth server's
 *                   /auth/v1/authorize with provider=google, a PKCE challenge
 *                   (s256), and redirect_to = this site's callback in the SAME
 *                   locale. The walk STOPS THERE: the authorize request is
 *                   aborted in the browser, so it never reaches the auth
 *                   server (no PKCE flow row is stored), Google is never
 *                   contacted and nobody signs in. What it cannot show: the
 *                   Google client id and consent screen, which live behind
 *                   that hop.
 *   W-2 (5.14)      the command finder, signed in as the synthetic worker:
 *                   the header search opens the finder, a typed word finds a
 *                   registry command with a real link, the object search
 *                   answers without its error state, the voice button (when
 *                   the browser offers speech input) shows its disclosure
 *                   first and Cancel leaves the microphone closed, and the
 *                   result opens its page. Speech itself is not exercised: it
 *                   needs a microphone and the browser's speech service.
 *   W-3 (6.11)      cross-border readiness, the public part, signed out:
 *                   Germany in German and the Netherlands in Dutch (the
 *                   requirements-countries walk reads them in LT/EN with two
 *                   scopes) show ALL FOUR mobility scopes — including the
 *                   team / subcontracting and company-hiring scopes a company
 *                   reads — each with requirement cards, an official source
 *                   per card, the national parts marked for a legal check,
 *                   copy from that locale's messages file and no other
 *                   country's matrix.
 *
 * WRITES NOTHING. Every non-GET request a page makes during the walk is
 * aborted in the browser and counted; the count is printed. No form is
 * submitted, no consent is changed (the speech disclosure is cancelled), no
 * account is created and no e-mail can be sent. The analytics choice is the
 * walk's seeded refusal (prod-walk.ts), so no telemetry event is posted.
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml");
test.describe.configure({ timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

type Messages = {
  auth: { login: { google_label: string }; signup: { google_label: string } };
  countryReadiness: { heading: string; scope: Record<string, { label: string }> };
};
const messages = (locale: ActiveLocale): Messages =>
  JSON.parse(readFileSync(resolve(__dirname, `../../messages/${locale}.json`), "utf8")) as Messages;

/** The browser language a person in each routed locale has (matches prod-ux-metrics). */
const BROWSER_LOCALE: Record<ActiveLocale, string> = {
  lt: "lt-LT",
  en: "en-GB",
  ru: "ru-RU",
  nl: "nl-NL",
  de: "de-DE",
  pl: "pl-PL",
  sv: "sv-SE",
};

const DESKTOP = { width: 1280, height: 800 };
/** Any host: the hop is stopped first and its origin asserted after, so a
 *  wrong auth host fails the step instead of being contacted. */
const isAuthorize = (u: URL) => u.pathname === "/auth/v1/authorize";

/**
 * One browser context whose every non-GET request is aborted and counted, and
 * whose OAuth hop (the production auth server's /authorize, and anything at
 * accounts.google.com) is aborted and recorded. Nothing the walk does can
 * write, sign anyone in or reach Google.
 */
async function readOnly(
  browser: Browser,
  opts: { slot?: string; locale: ActiveLocale },
): Promise<{ ctx: BrowserContext; page: Page; blocked: () => number; authorize: () => URL | null; google: () => number }> {
  const ctx = await browser.newContext({
    ...(opts.slot ? { storageState: state(opts.slot) } : {}),
    locale: BROWSER_LOCALE[opts.locale],
    viewport: DESKTOP,
  });
  let blocked = 0;
  let google = 0;
  let authorize: URL | null = null;
  await ctx.route("**/*", (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (isAuthorize(url)) {
      authorize = url;
      return route.abort();
    }
    if (url.hostname === "accounts.google.com") {
      google += 1;
      return route.abort();
    }
    if (req.method() !== "GET" && req.method() !== "HEAD" && req.method() !== "OPTIONS") {
      blocked += 1;
      return route.abort();
    }
    return route.continue();
  });
  return { ctx, page: await ctx.newPage(), blocked: () => blocked, authorize: () => authorize, google: () => google };
}

async function healthy(page: Page, where: string): Promise<void> {
  await expect(page.getByTestId("global-error-message"), `${where}: no error screen`).toHaveCount(0);
  await expect(page.getByTestId("error-boundary-message"), `${where}: no error screen`).toHaveCount(0);
}

// ─────────────────────────────── W-1 (1.2, 8.1) ───────────────────────────────

test("W-1 (1.2, 8.1). the Google door on sign-in and sign-up in every routed locale starts the same-tab PKCE flow (stopped before the auth server)", async ({ browser }) => {
  const summary: string[] = [];
  for (const locale of activeLocales) {
    const m = messages(locale);
    const { ctx, page, blocked, authorize, google } = await readOnly(browser, { locale });
    for (const door of ["login", "signup"] as const) {
      const where = `/${locale}/auth/${door}`;
      const res = await page.goto(where, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${where}: answers 200`).toBe(200);
      expect(new URL(page.url()).pathname, `${where}: stays on the ${locale} ${door} page`).toBe(where);
      await expect(page.locator("html"), `${where}: the page says it is ${locale}`).toHaveAttribute("lang", new RegExp(`^${locale}`));
      await healthy(page, where);

      const button = page.getByTestId("google-signin").filter({ visible: true });
      await expect(button, `${where}: exactly one Google button`).toHaveCount(1, { timeout: 30_000 });
      await expect(button, `${where}: in the page's own language (messages/${locale}.json)`).toContainText(m.auth[door].google_label);
      await expect(button, `${where}: it can be pressed`).toBeEnabled();

      // A press before hydration is a silent no-op, so press until the flow
      // starts. The first effective press disables the button (loading), and
      // the aborted authorize request is what ends the loop.
      const before = authorize();
      await expect(async () => {
        if (authorize() === before) await button.click({ timeout: 5_000 });
        await expect.poll(() => authorize() !== before, { timeout: 5_000 }).toBe(true);
      }, `${where}: pressing the Google button starts the OAuth hop`).toPass({ timeout: 60_000 });

      const hop = authorize()!;
      expect(hop.origin, `${where}: the hop goes to the production auth server`).toBe(PRODUCTION_ORIGIN);
      expect(hop.searchParams.get("provider"), `${where}: provider google`).toBe("google");
      expect(hop.searchParams.get("code_challenge") ?? "", `${where}: a PKCE challenge`).not.toBe("");
      expect(hop.searchParams.get("code_challenge_method"), `${where}: PKCE s256, never plain`).toBe("s256");
      const back = new URL(hop.searchParams.get("redirect_to") ?? "about:blank");
      expect(back.origin, `${where}: back to this site`).toBe(PRODUCTION_APP_ORIGIN);
      expect(back.pathname, `${where}: back to the callback in the SAME locale`).toBe(`/${locale}/auth/callback`);
      summary.push(`${locale}/${door}`);
    }
    expect(google(), `${locale}: Google itself was never contacted`).toBe(0);
    console.info(`[google] ${locale}: login + signup start the same-tab PKCE flow; non-GET aborted=${blocked()}`);
    await ctx.close();
  }
  console.info(`[google] ${summary.length} doors: ${summary.join(" ")}`);
});

// ─────────────────────────────────── W-2 (5.14) ───────────────────────────────

test("W-2 (5.14). the synthetic worker finds a command in the finder and opens it; the voice button asks first", async ({ browser }) => {
  test.skip(!existsSync(state("worker")), "needs the minted synthetic worker session");
  const { ctx, page, blocked } = await readOnly(browser, { slot: "worker", locale: "lt" });
  await page.goto("/lt/dashboard/journal");
  await expect(page.getByRole("main"), "the journal renders").toBeVisible({ timeout: 60_000 });
  await healthy(page, "/lt/dashboard/journal");

  const trigger = page.getByTestId("chat-command-search").filter({ visible: true }).first();
  await expect(trigger, "the header search control is on the page").toBeVisible({ timeout: 30_000 });
  const dialog = page.getByTestId("header-search-dialog");
  await clickUntilVisible(trigger, dialog, { what: "the header search dialog" });
  const input = dialog.getByTestId("command-finder-input");
  await expect(input, "the finder input is focused for typing").toBeFocused({ timeout: 10_000 });

  // Voice: rendered only when the browser offers the Web Speech API.
  const voice = dialog.getByTestId("command-finder-voice");
  const voiceOffered = (await voice.count()) > 0;
  if (voiceOffered) {
    const consent = dialog.getByTestId("command-finder-voice-consent");
    await clickUntilVisible(voice, consent, { what: "the speech disclosure" });
    await dialog.getByTestId("command-finder-voice-consent-cancel").click();
    await expect(consent, "Cancel closes the disclosure").toBeHidden();
    await expect(dialog.getByTestId("command-finder-voice-listening"), "the microphone was never opened").toHaveCount(0);
    await expect(voice, "the mic button is not pressed").toHaveAttribute("aria-pressed", "false");
  } else {
    test.info().annotations.push({ type: "unproven", description: "5.14 voice: this browser offers no Web Speech API, so no mic button is rendered (honest absence)" });
  }

  // "atostogos" is the Lithuanian synonym of the `absences` registry command
  // (lib/navigation/command-registry.ts), whose audience is everyone.
  await input.fill("atostogos");
  const hit = dialog.getByTestId("command-finder-result-absences");
  await expect(hit, "the typed word finds the absences command").toBeVisible({ timeout: 30_000 });
  await expect(hit, "the result is a real link to its page").toHaveAttribute("href", /\/lt\/dashboard\/absences$/);
  // The object search runs beside the registry; whatever it finds, it must not fail.
  await expect(dialog.getByTestId("command-finder-objects-loading"), "the object search answered").toHaveCount(0, { timeout: 30_000 });
  await expect(dialog.getByTestId("command-finder-objects-error"), "the object search did not fail").toHaveCount(0);

  await hit.click();
  await page.waitForURL(/\/lt\/dashboard\/absences(?:[?#].*)?$/, { timeout: 60_000 });
  await expect(page.getByRole("main"), "the command's page renders").toBeVisible({ timeout: 60_000 });
  await healthy(page, "/lt/dashboard/absences");
  await expect(dialog, "the finder closed once it had taken the worker there").toHaveCount(0);
  console.info(`[finder] absences found and opened; voice=${voiceOffered ? "disclosure-then-cancel" : "not-offered"}; non-GET aborted=${blocked()}`);
  await ctx.close();
});

// ─────────────────────────────────── W-3 (6.11) ───────────────────────────────

const SCOPES = ["worker_solo", "worker_posted", "team_subcontracting", "company_hiring"] as const;

test("W-3 (6.11). a visitor reads Germany in German and the Netherlands in Dutch: all four mobility scopes, sourced, honestly marked", async ({ browser }) => {
  for (const { cc, locale, other } of [
    { cc: "DE", locale: "de", other: "NL" },
    { cc: "NL", locale: "nl", other: "DE" },
  ] as const) {
    const m = messages(locale);
    const where = `/${locale}/labour-market/${cc.toLowerCase()}`;
    const { ctx, page, blocked } = await readOnly(browser, { locale });
    const res = await page.goto(where, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${where}: answers 200`).toBe(200);
    await expect(page.locator("html"), `${where}: the page says it is ${locale}`).toHaveAttribute("lang", new RegExp(`^${locale}`));
    await healthy(page, where);

    const block = page.getByTestId(`country-readiness-${cc}`);
    await expect(block, `${where}: the ${cc} requirement matrix`).toBeVisible({ timeout: 30_000 });
    await expect(block, `${where}: its heading from messages/${locale}.json`).toContainText(m.countryReadiness.heading);
    expect(await block.innerText(), `${where}: no raw message key on screen`).not.toMatch(/countryReadiness\./);
    await expect(page.getByTestId(`country-readiness-${other}`), `${where}: no other country's matrix`).toHaveCount(0);

    const counts: string[] = [];
    for (const scope of SCOPES) {
      const s = block.getByTestId(`country-readiness-scope-${scope}`);
      await expect(s, `${where}: scope ${scope}`).toBeVisible();
      await expect(s, `${where}: scope ${scope} is named in ${locale}`).toContainText(m.countryReadiness.scope[scope]!.label);
      const cards = s.locator("li[data-requirement]");
      const n = await cards.count();
      expect(n, `${where}: scope ${scope} has requirement cards`).toBeGreaterThan(0);
      for (const card of await cards.all()) {
        const src = card.locator("dd a[href]").first();
        await expect(src, `${where}: each ${scope} card names its source`).toHaveCount(1);
        expect(await src.getAttribute("href"), `${where}: an https source`).toMatch(/^https:\/\//);
      }
      counts.push(`${scope}=${n}`);
    }
    expect(await block.getByTestId("requirement-needs-legal-review").count(), `${where}: the national parts are marked for a legal check`).toBeGreaterThan(0);
    console.info(`[readiness] ${where}: ${counts.join(" ")}; non-GET aborted=${blocked()}`);
    await ctx.close();
  }
});
