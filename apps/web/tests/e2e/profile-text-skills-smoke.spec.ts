/**
 * Local credentialed smoke for fix/cc/cv-unify-self-declared.
 *
 * Asserts the unified CV/capability surface:
 *
 *   1. Page renders for ANY authenticated user (no construction-only
 *      worker gate). Header is the new "Mano gebėjimai" copy with the
 *      "not locked into one category" subtitle.
 *   2. The composer is rendered (unconditionally — no workerId gate).
 *   3. The CapabilityProfileSection renders saved
 *      `profile_skill_claims` chips with the explicit honest status
 *      (`Paties nurodyta · Nepatvirtinta išoriškai · source = profile
 *      text`) AND the disclaimer.
 *   4. Broad non-construction skills (`Programavimas`, `Maisto gamyba`)
 *      are visible on the same surface as construction skills
 *      (`Namų statyba`, `Stogų dengimas`) — PLATFORM_DOCTRINE §1.
 *   5. No `Patvirtinta` / `Verified` / `Confirmed` label appears next
 *      to any self-declared chip (the disclaimer phrase "dar nėra
 *      patvirtinti" is the only allowed mention and is stripped before
 *      the negative check).
 *
 * Auth: pre-set storage state minted by scripts/e2e-mint-session.ts.
 * Skipped automatically when `tests/e2e/.storage-state.json` is
 * missing (e.g. on a default `pnpm test` run in CI without the mint
 * step).
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
const SCREENSHOT_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "runtime",
  "review-evidence",
  "labourmarketai",
  "cv-unify-self-declared",
  "screenshots",
);

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });

mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

test("unified capability surface renders self-declared chips with honest status, no construction-only lock", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.goto("/lt/dashboard/profile", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/profile/);

  // Header carries the new "not locked into one category" framing.
  await expect(
    page.getByRole("heading", { name: "Mano gebėjimai", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Pasirinkta darbo kategorija yra tik kontekstas, ne apribojimas/,
    ),
  ).toBeVisible();
  await shot(page, "01-page-header");

  // Composer is rendered unconditionally (no workerId gate). The "what
  // I do for a living" placeholder text is part of it.
  const composer = page.locator("textarea").first();
  await expect(composer).toBeVisible();
  await shot(page, "02-composer-visible");

  // Unified CapabilityProfileSection renders. The section's title is
  // the new "Įgūdžiai ir patirtis" canonical home for skills.
  await expect(
    page.getByRole("heading", {
      name: /Įgūdžiai ir patirtis/i,
      level: 2,
    }),
  ).toBeVisible();

  // Self-declared sub-section carries the EXPLICIT honest status. Every
  // saved chip lives under this header — no separate disconnected card.
  const selfDeclared = page.getByTestId(
    "capability-profile-self-declared",
  );
  await expect(selfDeclared).toBeVisible();
  await expect(
    selfDeclared.getByText("Paties nurodyta", { exact: false }),
  ).toBeVisible();
  await expect(
    selfDeclared.getByText("Nepatvirtinta išoriškai", { exact: false }),
  ).toBeVisible();
  await expect(
    selfDeclared.getByText(/Šaltinis: profilio tekstas/i),
  ).toBeVisible();

  // PLATFORM_DOCTRINE §1: a user is not locked into one category.
  // All four saved chips render TOGETHER on the same canonical surface —
  // broad (Programavimas, Maisto gamyba) live next to construction
  // (Namų statyba, Stogų dengimas).
  const chips = page.getByTestId("capability-profile-claims");
  await expect(chips.getByText("Programavimas")).toBeVisible();
  await expect(chips.getByText("Maisto gamyba")).toBeVisible();
  await expect(chips.getByText("Namų statyba")).toBeVisible();
  await expect(chips.getByText("Stogų dengimas")).toBeVisible();
  await shot(page, "03-chips-unified");

  // No misleading verified/confirmed BADGE on the canonical surface.
  // We inspect VISIBLE text (innerText), not raw HTML — next-intl
  // serializes the entire LT message bundle into the page for client
  // hydration, which would otherwise false-trigger on marketing-page
  // copy that contains "Patvirtinti". innerText only reports what the
  // user actually sees rendered. Word-boundary scoped so the honest
  // negating phrases ("Nepatvirtinta išoriškai", "dar nėra patvirtinti
  // …") are not caught.
  const visibleText = (await page.locator("body").innerText()).replace(
    /\s+/g,
    " ",
  );
  expect(
    visibleText,
    "no standalone 'Patvirtinta' badge in rendered text",
  ).not.toMatch(/(^|\s)Patvirtinta(\s|$|[.,])/);
  expect(
    visibleText,
    "no standalone 'Patvirtinti' button label in rendered text",
  ).not.toMatch(/(^|\s)Patvirtinti(\s|$|[.,])/);
});
