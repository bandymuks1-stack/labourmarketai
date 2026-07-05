import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SPORTS OPERATING MODEL guards (Commercial Readiness train WAGON 6, audit
 * area 10).
 *
 * The wagon makes the sports metaphor USABLE — an operating model, never a
 * game layer. These pins keep that true:
 *
 *   1. EXPLAINER PRESENT + HONEST — /about carries the model section
 *      (player card = capability card, team/brigade = work unit,
 *      object/project = field of play, owner/operator = assignment manager,
 *      divisions/leagues = grouping/status layers). Any mention of a
 *      ranking-token in the explainer copy MUST be a negation ("never to
 *      rank", "no rankings") — a ranking CLAIM fails; invented score tokens
 *      (points totals, player values) are banned outright.
 *   2. STAFFING VIEW IS REAL ROWS ONLY — the per-object roster renders
 *      project_worker_assignments reads (status=active, RLS-scoped); no
 *      sample/demo data pin, no private contact fields on the read path.
 *   3. ONE IDENTITY SYSTEM — roster chips + ops-board cards use the SAME
 *      playerInitials monogram as the worker Player Card (no local initials
 *      copies — the old ops-board `split(/s+/)` bug stays dead).
 *   4. ACTIONS RESOLVE TO REAL EXISTING WRITES — assign/end go through the
 *      EXISTING assign_worker_to_project / end_worker_project_assignment
 *      RPCs; no app-side insert into project_worker_assignments.
 *   5. NO GAME LAYER / NO DUPLICATE SYSTEM — no new card/team/league/game
 *      component files, no non-admin league route, no cross-user worker-card
 *      route invented; the admin league page stays admin-gated as-is.
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

describe("1 · the model explainer exists on /about and is honest", () => {
  it("about page renders the sports-model section with a linkable anchor", () => {
    expect(aboutPage).toContain('data-testid="about-sports-model"');
    expect(aboutPage).toContain('id="sports-model"');
    expect(aboutPage).toMatch(/t\.raw\("sportsModel\.rows"\)/);
    expect(aboutPage).toMatch(/t\("sportsModel\.heading"\)/);
    expect(aboutPage).toMatch(/t\("sportsModel\.noRanking"\)/);
  });

  for (const locale of LOCALES) {
    const messages = JSON.parse(read(`messages/${locale}.json`));
    const ns = messages.about?.sportsModel;
    const values = stringValues(ns);

    it(`${locale}: full explainer catalogue (5 mappings + honesty line)`, () => {
      expect(ns, `${locale} about.sportsModel`).toBeTruthy();
      expect(String(ns.heading ?? "").length).toBeGreaterThan(0);
      expect(String(ns.intro ?? "").length).toBeGreaterThan(0);
      expect(Array.isArray(ns.rows) && ns.rows.length === 5).toBe(true);
      for (const row of ns.rows) {
        expect(String(row.term ?? "").length).toBeGreaterThan(0);
        expect(String(row.meaning ?? "").length).toBeGreaterThan(0);
      }
      expect(String(ns.noRanking ?? "").length).toBeGreaterThan(0);
    });

    it(`${locale}: ranking-tokens appear ONLY as negations, never as claims`, () => {
      const offenders = values.filter(
        (v) => RANKING_TOKEN.test(v) && !NEGATION_TOKEN.test(v),
      );
      expect(offenders, offenders.join(" | ")).toEqual([]);
      // The honesty line explicitly negates rankings.
      expect(RANKING_TOKEN.test(String(ns.noRanking))).toBe(true);
      expect(NEGATION_TOKEN.test(String(ns.noRanking))).toBe(true);
    });

    it(`${locale}: no invented score/value tokens anywhere in the explainer`, () => {
      const offenders = values.filter((v) => SCORE_TOKEN.test(v));
      expect(offenders, offenders.join(" | ")).toEqual([]);
    });

    it(`${locale}: projects-board compact explainer keys present and claim-free`, () => {
      const projects = messages.projects;
      expect(String(projects.model?.note ?? "").length).toBeGreaterThan(0);
      expect(String(projects.model?.link ?? "").length).toBeGreaterThan(0);
      expect(String(projects.assign?.fromRoster ?? "").length).toBeGreaterThan(0);
      const boardValues = stringValues([
        projects.model,
        projects.assign?.fromRoster,
      ]);
      const offenders = boardValues.filter(
        (v) => (RANKING_TOKEN.test(v) && !NEGATION_TOKEN.test(v)) || SCORE_TOKEN.test(v),
      );
      expect(offenders, offenders.join(" | ")).toEqual([]);
    });
  }

  it("projects board links the compact note to the /about explainer", () => {
    expect(projectsPage).toContain('data-testid="projects-model-note"');
    expect(projectsPage).toMatch(/t\("model\.note"\)/);
    expect(projectsPage).toMatch(/href="\/about#sports-model"/);
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

describe("3 · one Player Card identity system (shared monogram, no local copies)", () => {
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
    expect(manager).toMatch(/bg-ink-700/);
    expect(manager).toMatch(/text-text-primary/);
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

describe("5 · no game layer, no duplicate system, league stays admin-gated", () => {
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
