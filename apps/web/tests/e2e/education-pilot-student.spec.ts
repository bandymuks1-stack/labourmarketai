import { test, expect, type Page } from "@playwright/test";

/**
 * EDUCATION PILOT — the student half of the chain, in a real browser.
 *
 * The chain this walks, end to end, three times:
 *
 *   JOURNAL ENTRY (no employer named, no job title, no taxonomy knowledge)
 *     → ORIGINAL EVIDENCE (immutable, stored verbatim)
 *     → RECOGNISED CAPABILITIES (offered, never asserted as verified)
 *     → the Living CV surface
 *
 * Three inputs, because a pilot that only works for one kind of person is not
 * a pilot:
 *
 *   A. TRADE          — the case that already worked; a regression canary.
 *   B. TRANSVERSAL    — the owner's own example. Before #1297 this produced
 *                       nothing at all: 3 of 3 fragments unresolved.
 *   C. STUDENT/PROJECT— a university team project, the shape a learner's
 *                       evidence actually takes.
 *
 * WHY THE FORM FLOW AND NOT PROSE-IN-CHAT. An earlier attempt typed the work
 * as a plain chat sentence, got an opportunity-search reply, found no row, and
 * nearly reported a routing defect. That was a test bug, not a product bug:
 * the product opens a work-log FORM, and the discriminator that the flow is
 * really open is its date field — never a sentence of assistant text.
 * `journal-chat-intake.spec.ts` is the canonical flow this follows.
 *
 * Runs against the LOCAL Supabase stack only, via `pnpm e2e:local`; without
 * SUPABASE_TEST_URL it skips cleanly (docs/TESTING.md).
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

const WORKER = { email: "dev.worker@local.test", password: "password" };

type Case = {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  /** Localized capability names the entry must surface. Never raw slugs. */
  readonly capabilities: readonly string[];
};

const CASES: readonly Case[] = [
  {
    key: "A-trade",
    label: "practical/trade work",
    text: "Klojau plyteles vonioje ir daziau sienas",
    capabilities: ["Plytelių klojimas", "Dažymo darbai"],
  },
  {
    key: "B-transversal",
    label: "the owner's transversal example",
    text: "Susitikau su svietimo ir politikos atstovais, pristaciau projekta ir aptariau bendradarbiavimo galimybes",
    capabilities: [
      "Pristatymai",
      "Partnerysčių vystymas",
      "Darbas su suinteresuotomis šalimis",
    ],
  },
  {
    key: "C-student",
    label: "a student project",
    text: "Universiteto komandinis projektas: parasiau ataskaita ir pristaciau ji komisijai",
    capabilities: ["Komandinis darbas", "Ataskaitų rengimas", "Pristatymai"],
  },
];

const composer = (page: Page) => page.getByPlaceholder(/Parašyk/i).first();
const workLogDateField = (page: Page) => page.locator('input[type="date"]').first();

async function loginAsWorker(page: Page): Promise<void> {
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(WORKER.email);
  await page.locator('input[type="password"]').fill(WORKER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

/** preview -> explicit confirm. Product code never auto-confirms; the test
 *  simply performs both human steps. */
async function saveThroughConfirm(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const save = page.getByRole("button", { name: /^Išsaugoti$/ }).last();
    if ((await save.count()) === 0) break;
    await save.click();
    await page.waitForTimeout(2_000);
    if ((await page.getByText(/Patvirtinti įrašą/i).count()) === 0) break;
  }
}

test.describe("education pilot — a learner's journal becomes a Living CV", () => {
  test.skip(!HAS_TEST_SUPABASE, "needs the local stack (pnpm e2e:local)");

  for (const c of CASES) {
    test(`${c.key}: ${c.label} travels entry → evidence → capabilities`, async ({
      page,
    }) => {
      const marker = `E2E-${c.key}-${Date.now()}`;
      await loginAsWorker(page);
      await page.goto("/lt/dashboard");

      // The person asks for the journal in their own words.
      await composer(page).fill("Užpildyk darbo žurnalą");
      await composer(page).press("Enter");
      await expect(workLogDateField(page)).toBeVisible({ timeout: 60_000 });

      await workLogDateField(page).fill("2026-08-20");
      await page.locator('input[type="text"]').first().fill("Vilnius");
      await page.locator("textarea").first().fill(`${c.text} ${marker}`);
      await saveThroughConfirm(page);

      // A FULL server round trip — not the optimistic client state that
      // produced the save.
      await page.goto("/lt/dashboard/journal");

      // 1. The original evidence is stored verbatim.
      //    `toContainText`, not `toBeVisible`: the journal renders entries in
      //    collapsed disclosures, so the newest one is present in the document
      //    but hidden until opened. Presence is what "the evidence survived a
      //    full server round trip" means; visibility is a separate UI concern.
      const body = page.locator("body");
      await expect(body).toContainText(marker, { timeout: 60_000 });

      // 2. The capabilities the sentence asserts are surfaced, in the reader's
      //    own language. A raw English slug here would be the failure.
      for (const capability of c.capabilities) {
        await expect(
          body,
          `${c.key}: the entry did not surface "${capability}"`,
        ).toContainText(capability, { timeout: 30_000 });
      }

      // 3. HONESTY (doctrine §7). A derived capability is offered for the
      //    person to confirm — it is never presented as employer-verified.
      await expect(body).toContainText(/Dar neperžiūrėta|Laukia .*peržiūros/i);

      // 4. NO LEADERSHIP CLAIM the person did not make. Taking part in a team
      //    project must never be credited as COORDINATING a team.
      if (c.key === "C-student") {
        await expect(
          body,
          "participation was credited as team coordination",
        ).not.toContainText("Komandos koordinavimas");
      }
    });
  }
});
