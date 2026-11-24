import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A TIMED-OUT JOB BOARD IS A NAMED STATE, NEVER A 500 AND NEVER "0 JOBS".
 *
 * `searchPublicVacancyPreviews` used to re-throw a statement timeout into the
 * page, so the anonymous board answered HTTP 500. The tempting "fix" is to
 * catch it and return an empty list — which is worse, because it tells a person
 * the labour market is empty when the truth is that the read did not answer.
 *
 * Three different facts, and the product owes the true one:
 *
 *   not provisioned   the RPC is absent in this environment
 *   unavailable       the read did not answer in time
 *   ok + 0 rows       there genuinely are no matching vacancies
 *
 * SEP-7, UNKNOWN != ZERO != FAILED, is the rule being kept.
 *
 * The CAUSE is fixed: `count(*) over ()` was replaced on 2026-09-08 (ledger
 * 20260908110702) and the 1,595 timeouts in the preceding 24 h — every one of
 * them `SQL function "search_public_vacancy_previews_v1" statement 1` — stopped.
 * This guard is not about that fix. It is about the SHAPE of the failure, which
 * must survive the next slow query, colder cache, or bigger table.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const CORE = "lib/vacancy-store/public-vacancy-preview.ts";
const PAGE = "app/[locale]/(marketing)/jobs/page.tsx";

describe("a public-board timeout is named, not swallowed", () => {
  const core = read(CORE);

  it("recognises 57014 (query_canceled) by code", () => {
    expect(core).toMatch(/const QUERY_CANCELED\s*=\s*"57014"/);
  });

  it("maps it to `unavailable` — a state of its own", () => {
    // Not `not_provisioned` (that means "switched off") and not a bare empty
    // result (that means "no jobs").
    const branch = core.slice(core.indexOf("QUERY_CANCELED"));
    expect(branch).toMatch(/error\.code === QUERY_CANCELED/);
    expect(branch).toMatch(/status:\s*"unavailable"/);
  });

  it("still THROWS on anything it does not recognise", () => {
    // A blanket catch would turn every future defect into a silent empty
    // board. Unknown failures must stay loud.
    expect(core).toMatch(/throw error;/);
  });

  it("`unavailable` is part of the declared result type", () => {
    expect(core).toMatch(/PublicVacancyPreviewStatus\s*\|\s*"unavailable"/);
  });

  it("the page renders the state instead of an empty list", () => {
    const page = read(PAGE);
    expect(page).toContain('data-testid="public-jobs-unavailable"');
    expect(page).toMatch(/result\.status === "unavailable"/);
    // Announced, because the board is a full navigation.
    expect(page).toMatch(/role="status"/);
  });

  it("the message says the read failed — it never claims there are no jobs", () => {
    const page = read(PAGE);
    const block = page.slice(page.indexOf("const UNAVAILABLE"), page.indexOf("const SAVED_TAB"));
    expect(block.length).toBeGreaterThan(50);
    // Every locale must carry a message, and none may read as an empty result.
    for (const loc of ["en", "lt", "ru", "nl", "de"]) {
      expect(block, `${loc} missing`).toMatch(new RegExp(`${loc}:\\s*"`));
    }
    expect(block).not.toMatch(/\b0\b|no vacancies|nėra skelbimų|нет вакансий/i);
  });
});
