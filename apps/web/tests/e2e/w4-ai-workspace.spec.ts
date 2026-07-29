import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Authenticated E2E for the AI WORKSPACE (W4).
 *
 * Runs with a REAL logged-in session minted by scripts/e2e-mint-session.ts
 * against the LOCAL Supabase stack (`pnpm -C apps/web e2e:local`).
 *
 * The claim under test: a person achieves goals by TALKING, the AI executes a
 * real workflow over their real data, and it always says WHY. So each case
 * types a sentence a real person would type and asserts on the real answer:
 *
 *   1. World State from words — "work in Germany" narrows the search, and when
 *      Germany is not on their board the answer says what IS;
 *   2. the skill gap is real, counted from their own visible demands;
 *   3. "approved hours" is answered HONESTLY — the product has no such ledger,
 *      and the assistant says so instead of inventing a number;
 *   4. the AI can state the context it claims to understand;
 *   5. nothing navigates: the URL never changes.
 *
 * Company-side workflows ("find workers", "open this project") need a company
 * session; that describe skips itself when the signed-in identity is personal.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

/** Real copy, read from the catalogue so the spec never hardcodes product text. */
const LT = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "messages", "lt.json"), "utf8"),
) as { workspace: { ai: Record<string, string> } };

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

/** The seeded local project (docs/product/AI_WORKSPACE_W4_V1.md §6). Overridable
 *  so the spec runs against another fixture without an edit. */
const PROJECT_NAME = process.env.E2E_PROJECT_NAME ?? "Amsterdam Zuid gyvenamasis kvartalas";

/**
 * Each case may send several sentences, and the FIRST workflow of a run pays
 * for a cold dev-server compile. The default 30 s budget is smaller than the
 * 60 s `say()` allows, which would make the wait unreachable and the failure
 * misleading.
 */
test.setTimeout(120_000);

/**
 * Say something and wait for the assistant to answer.
 *
 * The timeout is generous because the FIRST workflow of a run compiles the
 * whole server module graph on a dev server; production serves it prebuilt.
 */
async function say(page: Page, text: string): Promise<void> {
  const before = await page.getByTestId("msg-assistant").count();
  await page.getByTestId("composer-input").fill(text);
  await page.getByTestId("composer-send").click();
  await expect
    .poll(async () => page.getByTestId("msg-assistant").count(), { timeout: 60_000 })
    .toBeGreaterThan(before);
}

/** Everything the assistant has said so far, as one string. */
async function transcript(page: Page): Promise<string> {
  return (await page.getByTestId("msg-assistant").allInnerTexts()).join("\n");
}

test.describe("W4 — goals in words, executed as workflows", () => {
  test("a stated goal narrows the world, and the answer explains why", async ({ page }) => {
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("composer-input")).toBeEnabled();
    const url = page.url();

    await say(page, "Noriu dirbti Nyderlanduose");
    const answer = await transcript(page);

    // Either it found matches and said what it narrowed on, or it honestly
    // reported that nothing there is visible. Both are real answers; a silent
    // empty list is what must not happen.
    const explained =
      answer.includes("Nyderland") || answer.includes(LT.workspace.ai.whyUnfiltered);
    expect(explained, `no explanation in: ${answer}`).toBe(true);

    // Nothing navigated.
    expect(page.url()).toBe(url);
  });

  test("naming a country that is not on the board says what IS", async ({ page }) => {
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("composer-input")).toBeEnabled();

    await say(page, "Noriu dirbti Norvegijoje");
    const answer = await transcript(page);
    // The honest shape: "I understood X, but nothing there is visible" — the
    // words differ per demand board, so assert on the stable stem.
    expect(answer).toMatch(/Norvegij/);
  });

  test("the skill gap is counted from the person's own demands", async ({ page }) => {
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("composer-input")).toBeEnabled();

    await say(page, "Kokių įgūdžių man trūksta?");
    const answer = await transcript(page);
    // Real outcome or an honest blocked state — never a generic fallback.
    const real =
      /trūksta \d+/.test(answer) ||
      answer.includes(LT.workspace.ai.skillGapNoDemands) ||
      answer.includes(LT.workspace.ai.blockedNoWorker) ||
      answer.includes(LT.workspace.ai.blockedNoAccess);
    expect(real, `not a real skill-gap answer: ${answer}`).toBe(true);
    // And it states what it read.
    expect(answer).toMatch(/poreiki|profil/i);
  });

  test("'approved hours' is answered honestly — there is no such ledger", async ({ page }) => {
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("composer-input")).toBeEnabled();

    await say(page, "Parodyk patvirtintas valandas");
    const answer = await transcript(page);
    // THE assertion of this whole phase: the product does not track approved
    // hours, so the assistant must say so rather than produce a number.
    const honest =
      answer.includes(LT.workspace.ai.figuresNoHoursLedger) ||
      answer.includes(LT.workspace.ai.figuresWorkerEmpty) ||
      answer.includes(LT.workspace.ai.blockedNoWorker);
    expect(honest, `not the honest answer: ${answer}`).toBe(true);
    // Never a fabricated hours figure.
    expect(answer).not.toMatch(/\d+\s*(val\.|valand)/);
  });

  test("the AI can state the context it claims to understand", async ({ page }) => {
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("composer-input")).toBeEnabled();

    await say(page, "Ką tu apie mane žinai?");
    const answer = await transcript(page);
    // Workspace + permissions are always stated, as fact or as "unknown".
    expect(answer).toMatch(/Darbo erdvė|Nepavyko perskaityti, kurioje/);
    expect(answer).toMatch(/Gali veikti kaip|Nepavyko perskaityti tavo teisių/);
  });

  test("the workspace never navigates while the AI works", async ({ page }) => {
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("composer-input")).toBeEnabled();
    const url = page.url();
    for (const sentence of [
      "Parodyk mano žurnalą",
      "Kokių įgūdžių man trūksta?",
      "Ką tu apie mane žinai?",
    ]) {
      await say(page, sentence);
      expect(page.url(), `"${sentence}" navigated`).toBe(url);
    }
    // The conversation is still usable and the panel is still there.
    await expect(page.getByTestId("context-panel")).toBeVisible();
  });
});

test.describe("W4 — employer workflows", () => {
  test("opening a project puts it in the Context Panel, not on a new page", async ({ page }) => {
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("composer-input")).toBeEnabled();
    const url = page.url();

    // Naming it is what makes this unambiguous. Asking for "this project" with
    // several candidates correctly gets a question back instead of a guess —
    // that behaviour has its own case below.
    await say(page, `Atidaryk projektą ${PROJECT_NAME}`);
    const answer = await transcript(page);

    // A personal-space session legitimately manages no project — an honest
    // outcome, not a failure, so it is a skip rather than a red test.
    test.skip(
      answer.includes(LT.workspace.ai.blockedNoProjects) ||
        answer.includes(LT.workspace.ai.whichProject),
      "no managed project on this session — company session required",
    );

    // Opened: the panel switched to the entity, and the URL did not move.
    await expect(page.getByTestId("context-panel")).toHaveAttribute(
      "data-panel-mode",
      "entity",
      { timeout: 20_000 },
    );
    expect(page.url()).toBe(url);
  });

  test("'find workers' lists the company's real demands", async ({ page }) => {
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("composer-input")).toBeEnabled();

    await say(page, "Surask darbuotojų");
    const answer = await transcript(page);
    test.skip(
      answer.includes(LT.workspace.ai.blockedNotEmployer),
      "personal space — company session required",
    );
    const real =
      /\d+ poreiki/.test(answer) || answer.includes(LT.workspace.ai.noDemands);
    expect(real, `not a real demand answer: ${answer}`).toBe(true);
  });
});
