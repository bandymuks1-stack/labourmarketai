import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PROJECT STAFFING MODEL guards (formerly "sports operating model", Commercial
 * Readiness train WAGON 6, audit area 10 — renamed 2026-09-30).
 *
 * Owner decision 2026-09-30: LabourMarket.ai is NOT a game. The sports
 * vocabulary (player card, playing field, divisions/leagues) is removed from
 * every public string and from /about; `no-gamification-terms.test.ts` keeps it
 * removed. What this file keeps is everything that was never about vocabulary:
 * the staffing view is real rows, one identity system, real actions, no
 * duplicate system.
 *
 *   1. EXPLAINER — /about carries the work-evidence explanation the projects
 *      board links to (`/about#evidence`), in professional terms.
 *   2. STAFFING VIEW IS REAL ROWS ONLY — the per-object roster renders
 *      project_worker_assignments reads (status=active, RLS-scoped); no
 *      sample data pin, no private contact fields on the read path.
 *   3. ONE IDENTITY SYSTEM — roster chips + ops-board cards use the SAME
 *      playerInitials monogram as the worker profile header (no local initials
 *      copies — the old ops-board `split(/s+/)` bug stays dead).
 *   4. ACTIONS RESOLVE TO REAL EXISTING WRITES — assign/end go through the
 *      EXISTING assign_worker_to_project / end_worker_project_assignment
 *      RPCs; no app-side insert into project_worker_assignments.
 *   5. NO DUPLICATE SYSTEM — no new card/team/league/game component files, no
 *      non-admin league route, no cross-user worker-card route invented; the
 *      admin market page stays admin-gated as-is.
 */

const APP = join(process.cwd());
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const aboutPage = read("app/[locale]/(marketing)/about/page.tsx");
const projectsPage = read("app/[locale]/dashboard/projects/page.tsx");
const manager = read("components/app/project-assignment-manager.tsx");
const opsBoard = read("components/app/project-operations-board.tsx");
const projectsLib = read("lib/projects/projects.ts");
const actionsLib = read("lib/projects/actions.ts");

const LOCALES = ["en", "lt", "ru"] as const;

/** Ranking-claim tokens per language (also matched inside longer words). */
const RANKING_TOKEN = /rank|reiting|рейтинг/i;
/** Negation vocabulary — a ranking-token is allowed ONLY next to one of these. */
const NEGATION_TOKEN =
  /\b(no|not|never|without)\b|jokių|niekada|nėra|\bne\b|никаких|никогда|нет|\bне\b/i;
/** Invented score/value tokens — banned outright in the explainer copy. */
const SCORE_TOKEN =
  /\b\d+\s*(pts?|points?|score)\b|player value|market value of a (worker|player)|žaidėjo vertė|стоимость игрока/i;

function stringValues(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => stringValues(v, out));
  else if (node && typeof node === "object")
    for (const v of Object.values(node as Record<string, unknown>)) stringValues(v, out);
  return out;
}

describe("1 · /about explains the work-evidence model and the projects board links to it", () => {
  const visuals = read("components/marketing/about-visuals.tsx");

  it("about page renders the evidence explanation with the anchor the projects board uses", () => {
    expect(aboutPage).toContain("AboutEvidenceGraph");
    expect(visuals).toContain('id="evidence"');
    expect(visuals).toContain('data-testid="about-evidence"');
    // the old sports section is gone for good
    expect(aboutPage).not.toMatch(/sportsModel|about-sports-model|sports-model/);
  });

  for (const locale of LOCALES) {
    const messages = JSON.parse(read(`messages/${locale}.json`));

    it(`${locale}: no sportsModel namespace; the evidence copy exists`, () => {
      expect(messages.about?.sportsModel).toBeUndefined();
      expect(String(messages.about?.evidence?.heading ?? "").length).toBeGreaterThan(0);
      expect(Array.isArray(messages.about?.evidence?.chain)).toBe(true);
    });

    it(`${locale}: projects-board compact explainer keys present and claim-free`, () => {
      const projects = messages.projects;
      expect(String(projects.model?.note ?? "").length).toBeGreaterThan(0);
      expect(String(projects.model?.link ?? "").length).toBeGreaterThan(0);
      expect(String(projects.assign?.fromRoster ?? "").length).toBeGreaterThan(0);
      const boardValues = stringValues([projects.model, projects.assign?.fromRoster]);
      const offenders = boardValues.filter(
        (v) => (RANKING_TOKEN.test(v) && !NEGATION_TOKEN.test(v)) || SCORE_TOKEN.test(v),
      );
      expect(offenders, offenders.join(" | ")).toEqual([]);
    });
  }

  it("projects board links the compact note to the /about evidence explanation", () => {
    expect(projectsPage).toContain('data-testid="projects-model-note"');
    expect(projectsPage).toMatch(/t\("model\.note"\)/);
    expect(projectsPage).toMatch(/href="\/about#evidence"/);
  });
});

describe("2 · the staffing view renders ONLY real assignment rows", () => {
  it("rows come from listProjectAssignments (project_worker_assignments, active, RLS)", () => {
    expect(projectsPage).toMatch(/listProjectAssignments\(p\.id\)/);
    expect(projectsLib).toMatch(/\.from\("project_worker_assignments"\)/);
    expect(projectsLib).toMatch(/\.eq\("status", "active"\)/);
    expect(manager).toMatch(/p\.assignments\.map\(/);
  });

  it("no sample/demo/fixture data pin anywhere on the roster path", () => {
    for (const [name, src] of [
      ["manager", manager],
      ["projectsLib", projectsLib],
      ["projectsPage", projectsPage],
    ] as const) {
      expect(src, `${name} must not pin sample data`).not.toMatch(
        /sampleAssignments|demoAssignments|demoWorkers|fixtureWorkers|placeholderRoster|MOCK_/,
      );
    }
    // The roster list is fed by props only — no hardcoded assignment literal.
    expect(manager).not.toMatch(/assignments:\s*\[\s*\{/);
  });

  it("no private contact data on the roster read path (name-only identity)", () => {
    expect(projectsLib).not.toMatch(/email|phone|telefon/i);
    expect(manager).not.toMatch(/\bemail\b|\bphone\b/i);
  });
});

describe("3 · one identity system (shared monogram, no local copies)", () => {
  it("roster chips use the canonical playerInitials monogram", () => {
    expect(manager).toMatch(
      /import \{ playerInitials \} from "@\/lib\/identity\/player-identity"/,
    );
    expect(manager).toContain('data-testid="roster-worker-chip"');
    expect(manager).toMatch(/playerInitials\(a\.name\)/);
    expect(manager).not.toMatch(/function initialsOf/);
  });

  it("ops-board worker cards use the SAME monogram (broken split(/s+/) copy stays dead)", () => {
    expect(opsBoard).toMatch(
      /import \{ playerInitials \} from "@\/lib\/identity\/player-identity"/,
    );
    expect(opsBoard).toMatch(/playerInitials\(worker\.name\)/);
    expect(opsBoard).not.toMatch(/\.split\(\/s\+\/\)/);
    expect(opsBoard).not.toMatch(/function initialsOf/);
  });

  it("chips reuse the Player Card fallback-tile tokens (no bespoke card look)", () => {
    // 2026-10-01: the chip IS the shared PersonIdentityCard (compact), which
    // carries the canonical fallback-tile tokens — one identity, not a copy.
    expect(manager).toContain("PersonIdentityCard");
    expect(manager).toContain('variant="assignment"');
    const card = read("components/app/identity/person-identity-card.tsx");
    expect(card).toContain("<PersonPortrait");
    // ...and the shared portrait owns the canonical fallback-tile token.
    expect(read("components/app/identity/person-portrait.tsx")).toContain("PLAYER_IDENTITY_FALLBACK_SURFACE");
  });
});

describe("4 · every roster action resolves to a REAL existing route/action", () => {
  it("assign stays the EXISTING gated RPC write (no new assignment system)", () => {
    expect(manager).toMatch(/assignWorkerToProjectAction/);
    expect(manager).toMatch(/endAssignmentAction/);
    expect(actionsLib).toMatch(/rpc\("assign_worker_to_project"/);
    expect(actionsLib).toMatch(/rpc\("end_worker_project_assignment"/);
    // App-side, assignments are NEVER inserted directly.
    expect(actionsLib).not.toMatch(/from\("project_worker_assignments"\)[\s\S]{0,80}\.insert\(/);
    expect(manager).not.toMatch(/\.insert\(|\.rpc\(/);
  });

  it("the roster assign link jumps to the real assign form on the same page", () => {
    expect(manager).toContain('data-testid="roster-assign-link"');
    expect(manager).toMatch(/href="#assign-worker"/);
    expect(manager).toMatch(/id="assign-worker"/);
  });

  it("the roster board link opens the EXISTING manager-gated operations route", () => {
    expect(manager).toContain('data-testid="roster-operations-link"');
    expect(manager).toMatch(/href=\{`\/dashboard\/projects\/\$\{p\.id\}\/operations`\}/);
    expect(
      existsSync(join(APP, "app/[locale]/dashboard/projects/[id]/operations/page.tsx")),
    ).toBe(true);
  });

  it("visibility gates are unchanged: both surfaces stay manager-only", () => {
    for (const src of [
      projectsPage,
      read("app/[locale]/dashboard/projects/[id]/operations/page.tsx"),
    ]) {
      expect(src).toMatch(/MANAGER_ROLES = new Set<Role>\(\["company", "agency"\]\)/);
      expect(src).toMatch(/MANAGER_ROLES\.has\(role\)/);
    }
  });
});

describe("5 · no game layer, no duplicate system, the country market page stays admin-gated", () => {
  it("no new sports/game/league/division/ranking component files", () => {
    const offenders = readdirSync(join(APP, "components", "app")).filter((f) =>
      /^(sports|game|league|division|ranking)-/i.test(f),
    );
    expect(offenders).toEqual([]);
  });

  it("league remains ONLY the admin market-intelligence page (no public league route)", () => {
    expect(existsSync(join(APP, "app/[locale]/dashboard/admin/league/page.tsx"))).toBe(true);
    expect(existsSync(join(APP, "app/[locale]/dashboard/league"))).toBe(false);
    expect(existsSync(join(APP, "app/[locale]/(marketing)/league"))).toBe(false);
  });

  it("no cross-user worker-card route was invented for the roster links", () => {
    expect(existsSync(join(APP, "app/[locale]/dashboard/workers"))).toBe(false);
    expect(manager).not.toMatch(/dashboard\/workers\//);
  });
});
