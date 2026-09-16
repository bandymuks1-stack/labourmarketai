/**
 * SYNTHETIC FIXTURE DETECTION — one predicate for the whole product.
 *
 * Production carries deliberately synthetic QA subjects (owner-approved
 * write proofs, `docs/audits/evidence/premium-rebuild/prod-qa-account.md`):
 * organizations named `QA-SYNTHETIC Alfa/Beta/Gama (testinis subjektas)`,
 * free text prefixed `[QA-SYNTHETIC]`, auth `app_metadata.qa_synthetic`.
 * They exist so that real write paths can be proven on the real database.
 * They must NOT appear to a real person as market reality — an owner walking
 * `/lt/dashboard` in September 2026 saw "[QA-SYNTHETIC]" rows beside real
 * demand (owner directive 2026-09-16 §7, §10: "No E2E / QA / SYNTHETIC leakage
 * into normal production workflows").
 *
 * The rule is applied at the SHARED cross-organization readers (the worker's
 * opportunity board, the canonical demand read behind the market map, the
 * employer's supply discovery), never at a screen: a screen forgets, a reader
 * does not. A person's OWN rows are never hidden from them — that would be
 * hiding their data — only other organizations' fixtures are kept out of
 * normal surfaces. Admin / QA surfaces keep seeing everything.
 *
 * Deliberately narrow: only the documented markers. A real organization whose
 * name merely contains "test" is a real organization.
 */

const MARKERS: readonly RegExp[] = [
  /\bQA[-_ ]SYNTHETIC\b/i,
  /\[E2E\]/i,
  /\bE2E[-_ ]FIXTURE\b/i,
];

/** True when ANY of the given texts carries a synthetic-fixture marker. */
export function isSyntheticFixtureLabel(
  ...values: readonly (string | null | undefined)[]
): boolean {
  for (const v of values) {
    if (typeof v !== "string" || v === "") continue;
    for (const rx of MARKERS) if (rx.test(v)) return true;
  }
  return false;
}

/** Keep only the rows whose picked texts carry no fixture marker. */
export function excludeSyntheticFixtures<T>(
  rows: readonly T[],
  pick: (row: T) => readonly (string | null | undefined)[],
): T[] {
  return rows.filter((r) => !isSyntheticFixtureLabel(...pick(r)));
}
