import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WORK_AREA_ICONS } from "@/components/app/work-area-icons";
import { ROLE_GATED_PREFIXES } from "@/lib/auth/role-gated-routes";
import { NEED_DOOR_HREF } from "@/lib/company/need-door";
import { locales } from "@/lib/i18n/config";
import {
  HOME_GOALS,
  HOME_TOP_TASK_COUNT,
  admittedHomeGoals,
  areasBeyondGoals,
  goalIsAdmitted,
  routeIsAdmitted,
  routePath,
  type HomeGoalRole,
} from "@/lib/navigation/home-goals";
import { ORGANIZATION_WORK_AREAS, PERSONAL_WORK_AREAS } from "@/lib/navigation/work-areas";

/**
 * THE HOME GOALS (owner P0 No. 1, 2026-11-12 — navigation is the launch
 * blocker). The signed-in home leads with what the person came to DO, one tap
 * from the top, for the role they act in. This guard keeps four things true:
 *
 *   1. every goal starts at an EXISTING page (no new surface, no dead card);
 *   2. each role's top tasks are on the home itself: one navigation action,
 *      at every width (the cards are a plain grid — nothing behind an arrow);
 *   3. a goal is never a way in: only routes the layout's own gate would
 *      admit are drawn;
 *   4. the copy is plain, exists in ALL eleven catalogs (Swedish included)
 *      and never says "demo".
 *
 * What it does NOT prove: that a new person understands the home in five
 * seconds. Only people can confirm that.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const ROLES = Object.keys(HOME_GOALS) as HomeGoalRole[];

const WORKER = { heldRoles: ["worker"], opensCompanySpace: false };
const OWNER = { heldRoles: ["worker", "company"], opensCompanySpace: true };
const MANAGER_BY_MEMBERSHIP = { heldRoles: ["worker"], opensCompanySpace: true };

describe("every goal starts at an existing page", () => {
  for (const role of ROLES) {
    for (const goal of HOME_GOALS[role]) {
      it(`${role}.${goal.id} → ${goal.href}`, () => {
        const segs = routePath(goal.href).split("/").filter(Boolean);
        expect(existsSync(join(APP, "app", "[locale]", ...segs, "page.tsx"))).toBe(true);
        expect(WORK_AREA_ICONS[goal.iconKey]).toBeTruthy();
      });
    }
  }

  it("goal ids are unique per role and no role offers one route twice", () => {
    for (const role of ROLES) {
      const ids = HOME_GOALS[role].map((g) => g.id);
      const paths = HOME_GOALS[role].map((g) => routePath(g.href));
      expect(new Set(ids).size, role).toBe(ids.length);
      expect(new Set(paths).size, role).toBe(paths.length);
    }
  });
});

describe("the top tasks start from the home itself", () => {
  it("each role has its top tasks first, and a small set of goals", () => {
    expect(HOME_TOP_TASK_COUNT).toBe(3);
    expect(HOME_GOALS.worker.slice(0, 3).map((g) => g.id)).toEqual(["findWork", "recordWork", "myCv"]);
    expect(HOME_GOALS.company.slice(0, 3).map((g) => g.id)).toEqual(["findWorkers", "projects", "people"]);
    expect(HOME_GOALS.agency.slice(0, 3).map((g) => g.id)).toEqual(["offerPeople", "clients", "people"]);
    for (const role of ROLES) {
      expect(HOME_GOALS[role].length, role).toBeGreaterThanOrEqual(HOME_TOP_TASK_COUNT);
      // A home a person reads in five seconds does not offer a wall of cards.
      expect(HOME_GOALS[role].length, role).toBeLessThanOrEqual(6);
    }
  });

  it("the cards are a plain grid of links — nothing behind an arrow, a swipe or a menu", () => {
    const cards = read("components/app/home/home-goal-cards.tsx");
    expect(cards).toMatch(/grid grid-cols-2/);
    expect(cards).not.toMatch(/overflow-x-(auto|scroll)|snap-x|carousel|<details|aria-expanded/);
    expect(cards).toMatch(/<Link\s+href=\{goal\.href as "\/dashboard"\}/);
    expect(cards).toMatch(/admittedHomeGoals\(role, admission\)/);
    // Keyboard and reduced motion: a visible focus ring, no forced animation.
    expect(cards).toMatch(/focus-visible:ring-2/);
    expect(cards).toMatch(/motion-reduce:transition-none/);
    // Touch target: a card is far above the 44px floor.
    expect(cards).toMatch(/min-h-16[^"]*sm:min-h-28/);
  });

  it("both homes render the goals above everything a person has to read", () => {
    const today = read("components/app/today/today-screen.tsx");
    expect(today.indexOf('<HomeGoalCards role="worker" />')).toBeGreaterThan(today.indexOf('data-testid="today-header"'));
    expect(today.indexOf('<HomeGoalCards role="worker" />')).toBeLessThan(today.indexOf('data-testid="today-regions"'));
    // The frame-level placeholder reserves the cards' footprint (home CLS).
    expect(today).toMatch(/<HomeGoalCardsPending role="worker" \/>/);
    const company = read("components/app/organization/company-model-screen.tsx");
    expect(company.indexOf("<HomeGoalCards")).toBeGreaterThan(-1);
    expect(company.indexOf("<HomeGoalCards")).toBeLessThan(company.indexOf("<AreaSwitcher"));
  });
});

describe("a destination is shown once on the home", () => {
  it("the area switcher under the goals holds only the areas the goals do not offer", () => {
    const worker = areasBeyondGoals(PERSONAL_WORK_AREAS, HOME_GOALS.worker).map((a) => a.id);
    expect(worker).toEqual(["numbers", "profile", "gallery"]);
    const company = areasBeyondGoals(ORGANIZATION_WORK_AREAS, HOME_GOALS.company).map((a) => a.id);
    expect(company).toEqual(["messages", "clients", "candidates", "calendar", "capacity", "results", "history"]);
    // The need door and the needs area are the same place.
    expect(routePath(NEED_DOOR_HREF)).toBe("/dashboard/company/needs");
    expect(company).not.toContain("need");
    const agency = areasBeyondGoals(ORGANIZATION_WORK_AREAS, HOME_GOALS.agency).map((a) => a.id);
    for (const gone of ["need", "clients", "people", "candidates"]) expect(agency).not.toContain(gone);
  });

  it("both homes pass the filtered list to the switcher", () => {
    expect(read("components/app/today/today-screen.tsx")).toMatch(
      /areasBeyondGoals\(PERSONAL_WORK_AREAS, HOME_GOALS\.worker\)\.map/,
    );
    expect(read("components/app/organization/company-model-screen.tsx")).toMatch(
      /areasBeyondGoals\(ORGANIZATION_WORK_AREAS, HOME_GOALS\[role\]\)\.map/,
    );
  });
});

describe("a goal is a presentation, never a permission", () => {
  it("asks the ONE gate table", () => {
    const model = read("lib/navigation/home-goals.ts");
    expect(model).toMatch(/routeRequirement\(routePath\(href\)\)/);
    // No second list of gated prefixes.
    expect(model).not.toMatch(/"\/dashboard\/admin"|ROLE_GATED_PREFIXES/);
  });

  it("every gated prefix is refused to a person who does not hold its role", () => {
    const nobody = { heldRoles: [], opensCompanySpace: false };
    for (const row of ROLE_GATED_PREFIXES) {
      expect(routeIsAdmitted(row.prefix, nobody), row.prefix).toBe(false);
      expect(routeIsAdmitted(`${row.prefix}/anything#x`, nobody), row.prefix).toBe(false);
    }
  });

  it("an operator route is never admitted, whatever the person holds", () => {
    const everything = { heldRoles: ["worker", "company", "agency", "customer", "admin"], opensCompanySpace: true };
    expect(routeIsAdmitted("/dashboard/admin", everything)).toBe(false);
    expect(routeIsAdmitted("/dashboard/talent", everything)).toBe(false);
  });

  it("a worker is offered no employer goal; an owner and a manager by membership are", () => {
    expect(admittedHomeGoals("worker", WORKER).map((g) => g.id)).toEqual([
      "findWork",
      "recordWork",
      "myCv",
      "messages",
    ]);
    // A worker who somehow reaches the employer home gets only ungated doors.
    const leaked = admittedHomeGoals("company", WORKER).map((g) => g.href);
    for (const href of leaked) expect(href.startsWith("/dashboard/company")).toBe(false);
    expect(leaked).not.toContain(NEED_DOOR_HREF);
    expect(admittedHomeGoals("company", OWNER)).toHaveLength(HOME_GOALS.company.length);
    // `membership_accept_v1` grants no company role: the workspace opens the space.
    expect(admittedHomeGoals("company", MANAGER_BY_MEMBERSHIP)).toHaveLength(HOME_GOALS.company.length);
    expect(admittedHomeGoals("agency", MANAGER_BY_MEMBERSHIP)).toHaveLength(HOME_GOALS.agency.length);
  });

  it("a person without the worker role is not offered the worker-only board", () => {
    const companyOnly = { heldRoles: ["company"], opensCompanySpace: false };
    const findWork = HOME_GOALS.worker.find((g) => g.id === "findWork")!;
    expect(goalIsAdmitted(findWork, companyOnly)).toBe(false);
    expect(goalIsAdmitted(findWork, WORKER)).toBe(true);
  });
});

describe("DEMAND ≠ SUPPLY on the organization home (SEP-4)", () => {
  it("an agency is never offered the need door; an employer's first goal IS the need door", () => {
    expect(HOME_GOALS.agency.map((g) => g.href)).not.toContain(NEED_DOOR_HREF);
    expect(HOME_GOALS.company[0].href).toBe(NEED_DOOR_HREF);
  });

  it("the goal home follows the Needs door's own audience rule — one agency rule (ORG-2)", () => {
    const server = read("lib/navigation/home-goals-server.ts");
    expect(server).toMatch(/resolveNeedsAudience\(\{ companyType, capabilities \}\)\.audience === "offer" \? "agency" : "company"/);
    // No second agency rule: the type is never compared here.
    expect(server).not.toMatch(/===\s*"staffing_agency"/);
    expect(read("components/app/organization/company-model-screen.tsx")).toMatch(/loadOrganizationGoalRole\(\)/);
  });
});

describe("a visible way to ask the assistant, opening the ONE conversation (step 4)", () => {
  const entry = read("components/app/home/ask-composer-entry.tsx");

  it("sits with the goals on both homes and is a real, named button", () => {
    const cards = read("components/app/home/home-goal-cards.tsx");
    expect(cards).toMatch(/<AskAssistantEntry label=\{t\("ask\.label"\)\} hint=\{t\("ask\.hint"\)\} \/>/);
    expect(entry).toMatch(/<button\s+type="button"\s+data-testid="home-ask-assistant"/);
    expect(entry).toMatch(/min-h-14/);
    expect(entry).toMatch(/focus-visible:ring-2/);
  });

  it("opens nothing new: it moves focus to the composer the home already has", () => {
    expect(entry).toContain(`COMPOSER_INPUT_SELECTOR = '[data-testid="composer-input"]'`);
    expect(entry).toMatch(/input\.focus\(\{ preventScroll: true \}\)/);
    // The composer still carries the marker the entry looks for.
    expect(read("components/app/conversation/chat/composer.tsx")).toMatch(/data-testid="composer-input"/);
    // No second chat, dialog or route behind the entry.
    const code = entry.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/<Link|href=|router\.|useRouter|<dialog|MobileSheet|fetch\(/);
  });

  it("honours reduced motion", () => {
    expect(entry).toMatch(/prefers-reduced-motion: reduce/);
    expect(entry).toMatch(/motion-reduce:transition-none/);
  });

  it("the composer is on screen under an opening context, so the entry always has a target", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/\{opening && !openingContext \? null : \(\s*<Composer/);
  });

  for (const locale of locales) {
    it(`${locale}: the entry has plain copy`, () => {
      const ask = JSON.parse(read(`messages/${locale}.json`)).homeGoals?.ask as { label?: string; hint?: string };
      expect(ask?.label, locale).toBeTruthy();
      expect(ask?.hint, locale).toBeTruthy();
      for (const text of [ask.label!, ask.hint!]) {
        expect(text).not.toMatch(/\[EN\]|\bdemo\b/i);
        expect(text.length).toBeLessThanOrEqual(56);
      }
    });
  }
});

describe("quick access: the organization's active projects and open needs, by name (step 3)", () => {
  const quick = read("components/app/home/home-quick-access.tsx");
  const code = quick.replace(/\/\*[\s\S]*?\*\//g, "");

  it("reads through existing readers — no new query text, table or store", () => {
    expect(code).toMatch(/await listManagedProjects\(\{ activeOnly: true, organizationId \}\)/);
    // The needs are the request-cached list the home's opening brief already
    // read: zero extra queries, and an agency's offers are not in it (SEP-4).
    expect(code).toMatch(/await listCompanyDemands\(\)/);
    expect(code).not.toMatch(/\.from\(|createClient|supabase/);
    expect(read("lib/scouting/scouting.ts")).toMatch(/const readCompanyDemandsOnce = cache\(/);
    // The working bucket only: the finished bucket is not read to be thrown away.
    expect(read("lib/projects/projects.ts")).toMatch(
      /opts\.activeOnly \? \{ data: \[\] as unknown\[\], error: null \} : bucket\(true\)/,
    );
  });

  it("stays inside the active workspace and lists a few rows, not a wall", () => {
    // The organization is part of the QUERY, before the reader's page limit
    // (Codex P2 on #3269): another organization's newer projects cannot crowd
    // this one's out of a capped page.
    expect(read("lib/projects/projects.ts")).toMatch(
      /if \(opts\.organizationId\) q = q\.eq\("organization_id", opts\.organizationId\);/,
    );
    expect(code).toMatch(/all\.filter\(\(p\) => p\.status !== "completed"\)/);
    expect(code).toMatch(/r\.status !== "closed"/);
    expect(code).toMatch(/export const QUICK_ACCESS_LIMIT = 3;/);
    expect((code.match(/\.slice\(0, QUICK_ACCESS_LIMIT\)/g) ?? []).length).toBe(2);
  });

  it("claims nothing it could not read: an empty or failed list is absent", () => {
    expect(code).toMatch(/if \(projects\.length === 0 && needs\.length === 0\) return null;/);
    expect(code).toMatch(/\{projects\.length > 0 && \(/);
    expect(code).toMatch(/\{needs\.length > 0 && \(/);
    // No "0 projects" or "nothing yet" sentence on this block.
    for (const locale of locales) {
      const q = JSON.parse(read(`messages/${locale}.json`)).homeGoals.quick as Record<string, string>;
      for (const text of Object.values(q)) expect(text, locale).not.toMatch(/\b0\b|\[EN\]|\bdemo\b/i);
    }
  });

  it("is drawn only where the layout's gate admits the person, and every row is a real link", () => {
    expect(code).toMatch(/routeIsAdmitted\(PROJECTS_HREF, admission\) \? loadActiveProjects\(organizationId\) : \[\]/);
    expect(code).toMatch(/routeIsAdmitted\(NEEDS_HREF, admission\) \? loadOpenNeeds\(\) : \[\]/);
    expect(code).toMatch(/href: `\$\{PROJECTS_HREF\}\/\$\{p\.id\}`/);
    expect(existsSync(join(APP, "app", "[locale]", "dashboard", "projects", "[id]", "page.tsx"))).toBe(true);
    // The needs rows open the Needs door's READBACK of saved needs — not the
    // intake section above it (Codex P2 on #3269).
    expect(code).toMatch(/#demand-readback-title/);
    expect(code).not.toMatch(/#company-requests/);
    expect(read("components/app/demand-requests-readback.tsx")).toMatch(/id="demand-readback-title"/);
    // A stored stand-in title is shown through the readback's own resolver.
    expect(code).toMatch(/resolveDemandTitle\(n\.title, \{/);
    expect(code).toMatch(/min-h-11/);
    expect(code).toMatch(/focus-visible:ring-2/);
  });

  it("closes the organization home behind its own boundary, so it cannot push the goals down", () => {
    const company = read("components/app/organization/company-model-screen.tsx");
    expect(company).toMatch(/<Suspense fallback=\{null\}>\s*<HomeQuickAccess \/>\s*<\/Suspense>/);
    expect(company.indexOf("<HomeQuickAccess />")).toBeGreaterThan(company.indexOf("<AreaSwitcher"));
  });

  for (const locale of locales) {
    it(`${locale}: quick access copy`, () => {
      const q = JSON.parse(read(`messages/${locale}.json`)).homeGoals?.quick as Record<string, string> | undefined;
      for (const key of ["title", "projects", "needs", "allProjects", "allNeeds", "untitledProject"]) {
        expect(q?.[key], `${locale}.${key}`).toBeTruthy();
      }
    });
  }
});

describe("plain copy in every catalog", () => {
  for (const locale of locales) {
    it(`${locale}: every goal has a label, and a hint unless its action is a shared door`, () => {
      const m = JSON.parse(read(`messages/${locale}.json`)) as {
        homeGoals?: { title?: string } & Record<string, Record<string, { label?: string; hint?: string }>>;
      };
      const goals = m.homeGoals;
      expect(goals?.title, `${locale} title`).toBeTruthy();
      const all: string[] = [goals!.title!];
      for (const role of ROLES) {
        for (const goal of HOME_GOALS[role]) {
          const copy = goals![role]?.[goal.id];
          expect(copy?.label, `${locale} ${role}.${goal.id}.label`).toBeTruthy();
          all.push(copy!.label!);
          if (goal.href !== NEED_DOOR_HREF) {
            expect(copy?.hint, `${locale} ${role}.${goal.id}.hint`).toBeTruthy();
            all.push(copy!.hint!);
          }
        }
      }
      for (const text of all) {
        expect(text, locale).not.toMatch(/\[EN\]|\bdemo\b/i);
        // Short enough to read at a glance on a 360px card.
        expect(text.length, `${locale}: "${text}"`).toBeLessThanOrEqual(48);
      }
    });
  }

  it("non-English catalogs are translated, not copied", () => {
    const en = JSON.stringify(JSON.parse(read("messages/en.json")).homeGoals);
    for (const locale of locales) {
      if (locale === "en") continue;
      expect(JSON.stringify(JSON.parse(read(`messages/${locale}.json`)).homeGoals), locale).not.toBe(en);
    }
  });
});
