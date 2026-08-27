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
