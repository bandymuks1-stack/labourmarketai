import { expect, type Page } from "@playwright/test";

/**
 * ANSWER THE WORK-CONTEXT QUESTION, WHEN THE PRODUCT ASKS IT.
 *
 * The work-log form pins every entry to an engagement context. When the
 * person's contexts resolve unambiguously it preselects one and asks nothing;
 * when they do not, it refuses to save until a human chooses ("rule C" in
 * `resolveEngagementContext`). Both behaviours are correct — a journal entry is
 * evidence, and filing it against the wrong relationship is a false statement.
 *
 * ── WHY THIS HELPER EXISTS ─────────────────────────────────────────────────
 * The journal specs were written when `dev.worker` had no ambiguity, so they
 * filled the form and saved. The education work made ambiguity ORDINARY: a
 * learner on placement at the company that also employs them holds two
 * engagements with the same organization, and the form then asks. Specs that
 * ignore the question get an honest "Nepavyko išsaugoti" and read it as data
 * loss — which is exactly the misdiagnosis this helper prevents.
 *
 * It is deliberately TOLERANT of the selector being absent: a spec that runs
 * against a single-context fixture must not start failing because it called
 * this. It is NOT tolerant of the selector being present and unanswerable —
 * two options with the same words is a real defect, and it fails here.
 */
export async function chooseWorkContextIfAsked(
  page: Page,
  prefer?: RegExp,
): Promise<void> {
  const context = page.locator('[data-testid="worklog-context"]');
  if ((await context.count()) === 0) return;

  const labels = (await context.locator("option").allTextContents()).map((s) =>
    s.trim(),
  );
  // Every option must be tellable apart. Before the disambiguation fix a
  // learner saw "Dev Construction" twice and could not answer honestly.
  expect(
    new Set(labels).size,
    `the work-context selector offers indistinguishable options: ${labels.join(" | ")}`,
  ).toBe(labels.length);

  // A real context, never the "choose…" placeholder (which has an empty value).
  const values = await context.locator("option").evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLOptionElement).value),
  );
  const candidates = labels
    .map((label, i) => ({ label, value: values[i] }))
    .filter((o) => o.value !== "");
  if (candidates.length === 0) return;

  const wanted = prefer
    ? (candidates.find((o) => prefer.test(o.label)) ?? candidates[0])
    : candidates[0];
  await context.selectOption(wanted.value);
}

/**
 * ANSWER THE "WHICH PROJECT?" QUESTION, WHEN THE PRODUCT ASKS IT.
 *
 * A worker on two or more projects of the chosen context is asked which one
 * the day belongs to (`projectPromptFor` → "ask"), and the form refuses to go
 * to the confirm step until it is answered (`projectChoiceIsSatisfied`, owner
 * launch order 2026-10-10 §5). That is correct: an entry is evidence, and
 * filing it against a guessed project is a false statement.
 *
 * The journal walks record days that name no project, so the honest answer
 * is the form's own "not project work" option — never a guessed project.
 * Tolerant of the question being absent (one project = shown, not asked; none
 * = nothing), like `chooseWorkContextIfAsked`. Call it AFTER the context is
 * chosen: the projects offered are the chosen context's.
 *
 * Why it exists: production runs 40048799023 (sectors-languages) and
 * 40069162731 (journal-confirm) went red on a confirm button that never came:
 * the worker had been left on the project-execution walk's two projects, and
 * the specs did not answer the question the form then asked.
 */
export async function answerNoProjectIfAsked(page: Page): Promise<void> {
  const project = page.locator('[data-testid="worklog-project"]').filter({ visible: true });
  if ((await project.count()) === 0) return;
  // The form's own "not project work" option (`PROJECT_FIELD_NONE`,
  // lib/journal/project-attribution.ts).
  await project.last().selectOption("none");
  await expect(project.last()).toHaveValue("none");
}
