import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A SAVE IS A PRIVATE BOOKMARK — owner decision 2026-08-19, as executable rules.
 *
 * "Tai yra PRIVATE BOOKMARK funkcija. Ji NEGALI būti interpretuojama kaip
 * Apply, Shortlist, employer interest ar candidate disclosure."
 *
 * The risk is not that someone deliberately builds an apply-button. It is that
 * the meaning erodes one small change at a time: a notification "so the
 * employer knows there is interest", a count on an employer surface, copy that
 * drops the disclaimer because the button "obviously" means saving. Each looks
 * harmless alone; together they turn a private act into disclosure of a named
 * worker's intent to a company that never agreed to receive it — and the worker
 * is the party who cannot undo that.
 *
 * These pins are deliberately about the WORDS and the SURFACES, because that is
 * where the erosion happens. The database enforces the rest independently:
 * `worker_saved_opportunities` has exactly ONE policy (own-rows SELECT), no
 * insert/update/delete policy at all, and `anon` holds no privilege on the
 * table or either RPC — verified in production on apply.
 */
const web = join(__dirname, "..", "..");
const PAGE = join(web, "app", "[locale]", "(marketing)", "jobs", "[id]", "page.tsx");
const ACTIONS = join(web, "app", "[locale]", "(marketing)", "jobs", "[id]", "actions.ts");
const BUTTON = join(web, "components", "marketing", "save-vacancy-button.tsx");
const LIB = join(web, "lib", "opportunities", "saved-opportunities.ts");
const BOARD = join(web, "app", "[locale]", "(marketing)", "jobs", "page.tsx");
const VACANCY_READ = join(web, "lib", "vacancy-store", "vacancy-read.ts");

const read = (p: string) => readFileSync(p, "utf8");

/**
 * Code and rendered strings only — COMMENTS STRIPPED.
 *
 * Without this, the guard fires on the prose that explains the boundary: the
 * files deliberately say "not an application", "not a shortlist". Scanning raw
 * text would mean documenting the rule breaks the test enforcing it, which
 * would train the next author to delete the explanation rather than keep the
 * behaviour. The forbidden words matter in CODE and in what a user sees.
 */
const readCode = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

describe("the save control cannot become an application", () => {
  it("the button never calls itself apply, shortlist, or interest", () => {
    const src = readCode(BUTTON).toLowerCase();
    for (const word of [
      "apply",
      "application",
      "shortlist",
      "candidat",
      "interest",
      "notify employer",
    ]) {
      expect(src.includes(word), `save button mentions "${word}"`).toBe(false);
    }
  });

  it("every locale's save copy carries the not-an-application disclaimer", () => {
    // The disclaimer is what stops a worker believing they have applied. #1193
    // fixed a funnel that silently did nothing; a Save mistaken for Apply is
    // the same defect with a friendlier label.
    const page = read(PAGE);
    const block = page.slice(
      page.indexOf("const SAVE_NOTE: L = {"),
      page.indexOf("const SAVE_FAILED: L = {"),
    );
    expect(block.length).toBeGreaterThan(100);
    // One line per shipped locale on this page.
    for (const locale of ["en:", "lt:", "ru:", "nl:", "de:"]) {
      expect(block.includes(locale), `SAVE_NOTE missing ${locale}`).toBe(true);
    }
    // And each must actually say the employer is not told.
    for (const claim of [
      "not an application",
      "nėra kandidatavimas",
      "не отклик",
      "geen sollicitatie",
      "keine Bewerbung",
    ]) {
      expect(block.includes(claim), `SAVE_NOTE missing: ${claim}`).toBe(true);
    }
  });

  it("the write path notifies nobody and touches no employer surface", () => {
    const src = `${readCode(ACTIONS)}\n${readCode(BUTTON)}`;
    for (const forbidden of [
      "notification",
      "notify",
      "sendEmail",
      "telegram",
      "demand_interest",
      "shortlist",
      "employer_inbox",
      "conversation",
    ]) {
      expect(
        src.toLowerCase().includes(forbidden.toLowerCase()),
        `save path reaches "${forbidden}"`,
      ).toBe(false);
    }
  });

  it("writes go through the gated RPCs, never a direct table write", () => {
    // A direct insert would bypass the RPC's browsable check and the 200 cap,
    // and would need a table-level grant that deliberately does not exist.
    const lib = read(LIB);
    expect(lib).toContain("save_worker_public_vacancy_v1");
    expect(lib).toContain("unsave_worker_public_vacancy_v1");
    const vacancyHalf = lib.slice(lib.indexOf("PUBLIC VACANCY bookmarks"));
    expect(vacancyHalf).not.toMatch(/\.insert\(/);
    expect(vacancyHalf).not.toMatch(/\.upsert\(/);
    expect(vacancyHalf).not.toMatch(/\.delete\(/);
  });

  it("the control is not rendered for an anonymous visitor", () => {
    const page = read(PAGE);
    // It hangs off `savedState`, which is only populated when `member` AND the
    // caller's own worker row exist; `member` requires a validated session.
    expect(page).toContain("savedState.available && (");
    expect(page).toContain("member && workerId");
    expect(page).toContain("await isPublicVacancySaved(supabase, id, workerId)");
  });

  it("every bookmark read names the OWNER, not just the vacancy", () => {
    // NOT redundant with RLS, and this is the exact hole that was shipped and
    // then caught in review. `worker_saved_opportunities_select` reads
    //   ... where w.profile_id = auth.uid() ... OR public.is_admin()
    // so an ADMIN session sees EVERY worker's rows. A vacancy-only lookup
    // therefore reads another worker's private bookmark and renders it as the
    // admin's own "Saved" — disclosure of exactly the thing the owner ruled can
    // never be disclosed — while Unsave would delete a row that does not exist.
    // So both readers must filter on worker_id.
    const lib = read(LIB);
    const vacancyHalf = lib.slice(lib.indexOf("PUBLIC VACANCY bookmarks"));
    const reads = vacancyHalf.split('.from("worker_saved_opportunities")').slice(1);
    expect(reads.length).toBeGreaterThanOrEqual(2);
    for (const [i, tail] of reads.entries()) {
      // The query ends at the statement terminator; look no further, so a
      // filter belonging to the NEXT query can never satisfy this one.
      const q = tail.slice(0, tail.indexOf(";"));
      expect(
        q.includes('.eq("worker_id", workerId)'),
        `bookmark read #${i + 1} does not filter by worker_id: ${q}`,
      ).toBe(true);
    }
  });

  it("the saved list is reachable — a bookmark you cannot get back to is none", () => {
    // Save without retrieval is a half-feature: the worker could only reach a
    // bookmark by re-finding the exact URL. The return path is the SAME board,
    // not a second surface.
    const board = read(BOARD);
    expect(board).toContain("listSavedPublicVacancyIds");
    expect(board).toContain("listPublicVacancyPreviewsByIds");
    // Member-only, and invisible when the read did not succeed.
    expect(board).toContain("mySaved.available && (");
    // No anonymous cost: the whole block is behind the session-cookie fast path.
    expect(board).toContain("const signedIn = await hasSessionCookie();");
  });

  it("the saved list renders the anonymous projection, never a richer one", () => {
    // The saved view reads through the MEMBER path (a member may see the whole
    // ad), so the projection is what keeps it the same card as the public
    // board rather than a quietly richer surface. Employer identity, location,
    // description and the application url are not selected at all.
    const reader = read(VACANCY_READ);
    const block = reader.slice(
      reader.indexOf("const PREVIEW_COLUMNS ="),
      reader.indexOf("function toPreviewRow("),
    );
    expect(block.length).toBeGreaterThan(50);
    for (const forbidden of [
      "employer",
      "city",
      "region",
      "country",
      "latitude",
      "longitude",
      "description_raw",
      "application_url",
    ]) {
      expect(block.includes(forbidden), `saved projection leaks ${forbidden}`).toBe(
        false,
      );
    }
    // And it applies the same browsable predicate the save RPC itself uses, so
    // an expired bookmark cannot resurface a job the board refuses to show.
    const fn = reader.slice(reader.indexOf("export async function listPublicVacancyPreviewsByIds"));
    expect(fn).toContain('.eq("is_active", true)');
    expect(fn).toContain("expires_at.is.null,expires_at.gt.");
  });

  it("a failed write reverts the button instead of showing a false Saved", () => {
    const src = read(BUTTON);
    expect(src).toContain("setSaved(!next)");
    expect(src).toMatch(/result\.kind === "ok"/);
  });
});
