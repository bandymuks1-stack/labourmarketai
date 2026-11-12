import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NAV_CARD_ICONS } from "@/components/navigation/nav-card-icon";
import { ROLE_GATED_PREFIXES } from "@/lib/auth/role-gated-routes";
import { NEED_DOOR_HREF } from "@/lib/company/need-door";
import { locales } from "@/lib/i18n/config";
import {
  GOAL_FUNCTIONS,
  HOME_GOALS,
  ROLE_GOAL_ORDER,
  admittedHomeGoals,
  areasBeyondGoals,
  goalIsAdmitted,
  isDoorFor,
  routeIsAdmitted,
  routePath,
  signedInGoals,
  type HomeGoalRole,
} from "@/lib/navigation/home-goals";
import { PUBLIC_INTENT_IDS } from "@/lib/navigation/public-intents";
import { ORGANIZATION_WORK_AREAS, PERSONAL_WORK_AREAS } from "@/lib/navigation/work-areas";

/**
 * THE SIGNED-IN HOME'S GOALS (owner P0 No. 1, 2026-11-12 — navigation is the
 * launch blocker; V2: ONE navigation system for the public site and the
 * signed-in app). This guard keeps five things true:
 *
 *   1. the home uses the SHARED goal navigator and the SHARED six goals —
 *      no second rail, card or list of goals;
 *   2. every function starts at an EXISTING page (no new surface, no dead card);
 *   3. goal → function: at most two navigation actions to the start of any
 *      function, for every role;
 *   4. a goal is never a way in: only what the layout's own gate admits is
 *      offered, and a goal whose primary function is closed is not offered;
 *   5. the copy is plain, exists in ALL eleven catalogs (Swedish included)
 *      and never says "demo".
 *
 * What it does NOT prove: that a new person understands the home in five
 * seconds. Only people can confirm that.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const ROLES = Object.keys(HOME_GOALS) as HomeGoalRole[];
const ALL_FUNCTIONS = Object.values(GOAL_FUNCTIONS).flat();

const WORKER = { heldRoles: ["worker"], opensCompanySpace: false };
const OWNER = { heldRoles: ["worker", "company"], opensCompanySpace: true };
const MANAGER_BY_MEMBERSHIP = { heldRoles: ["worker"], opensCompanySpace: true };
const COMPANY_ONLY = { heldRoles: ["company"], opensCompanySpace: true };

describe("one navigation system: the shared navigator and the shared goals", () => {
  const cards = read("components/app/home/home-goal-cards.tsx");
  const code = cards.replace(/\/\*[\s\S]*?\*\//g, "");

  it("the home renders Lane A's GoalNavigator and defines no card or rail of its own", () => {
    expect(code).toMatch(/import \{ GoalNavigator \} from "@\/components\/navigation\/goal-navigator";/);
    expect(code).toMatch(/<GoalNavigator\b/);
    // No second implementation: no grid of links, no scroller, no 3D track.
    expect(code).not.toMatch(/<Link\b|grid-cols-|overflow-x-|snap-x|perspective|<AreaSwitcher/);
    expect(code).toMatch(/signedInGoals\(role, admission\)/);
  });

  it("the goals are the public site's six — same ids, same names, same icons", () => {
    expect(Object.keys(GOAL_FUNCTIONS).sort()).toEqual([...PUBLIC_INTENT_IDS].sort());
    for (const role of ROLES) {
      for (const id of ROLE_GOAL_ORDER[role]) expect(PUBLIC_INTENT_IDS, `${role}.${id}`).toContain(id);
      expect(new Set(ROLE_GOAL_ORDER[role]).size, role).toBe(ROLE_GOAL_ORDER[role].length);
    }
    expect(code).toMatch(/t\(`intents\.\$\{goal\.id\}\.short`\)/);
    expect(code).toMatch(/iconKey: GOAL_ICONS\[goal\.id\]/);
    expect(code).toMatch(/href: goalHref\(goal\.id\)/);
  });

  it("each role meets its own goal first; 'For agencies' is an agency's alone", () => {
    expect(ROLE_GOAL_ORDER.worker[0]).toBe("work");
    expect(ROLE_GOAL_ORDER.company[0]).toBe("workers");
    expect(ROLE_GOAL_ORDER.agency[0]).toBe("agencies");
    expect(ROLE_GOAL_ORDER.worker).not.toContain("agencies");
    expect(ROLE_GOAL_ORDER.company).not.toContain("agencies");
  });

  it("both homes render the goals above everything a person has to read", () => {
    const today = read("components/app/today/today-screen.tsx");
    expect(today.indexOf('<HomeGoalCards role="worker" />')).toBeGreaterThan(today.indexOf('data-testid="today-header"'));
    expect(today.indexOf('<HomeGoalCards role="worker" />')).toBeLessThan(today.indexOf('data-testid="today-regions"'));
    // The frame-level placeholder reserves the navigation's footprint (home CLS).
    expect(today).toMatch(/<HomeGoalCardsPending \/>/);
    const company = read("components/app/organization/company-model-screen.tsx");
    expect(company.indexOf("<HomeGoalCards")).toBeGreaterThan(-1);
    expect(company.indexOf("<HomeGoalCards")).toBeLessThan(company.indexOf("<AreaSwitcher"));
  });
});

describe("every function starts at an existing page", () => {
  for (const [goal, functions] of Object.entries(GOAL_FUNCTIONS)) {
    for (const fn of functions) {
      it(`${goal}.${fn.id} → ${fn.href}`, () => {
        const segs = routePath(fn.href).split("/").filter(Boolean);
        expect(existsSync(join(APP, "app", "[locale]", ...segs, "page.tsx"))).toBe(true);
        expect(NAV_CARD_ICONS[fn.iconKey], `${fn.id} icon`).toBeTruthy();
      });
    }
  }

  it("within a goal: unique ids, one route once, and no icon repeated across the rail", () => {
    for (const [goal, functions] of Object.entries(GOAL_FUNCTIONS)) {
      const rail = functions.filter((fn) => !fn.door);
      expect(new Set(functions.map((f) => f.id)).size, goal).toBe(functions.length);
      expect(new Set(functions.map((f) => routePath(f.href))).size, goal).toBe(functions.length);
      expect(new Set(rail.map((f) => f.iconKey)).size, `${goal} icons`).toBe(rail.length);
    }
  });

  it("a small set per goal: a rail a person reads at a glance", () => {
    for (const [goal, functions] of Object.entries(GOAL_FUNCTIONS)) {
      expect(functions.length, goal).toBeGreaterThanOrEqual(2);
      expect(functions.length, goal).toBeLessThanOrEqual(5);
    }
  });
});

describe("at most two navigation actions to the start of any function", () => {
  it("every function of a role's home is a card of a goal the home shows, or the door on the home itself", () => {
    for (const role of ROLES) {
      const admission = role === "worker" ? WORKER : OWNER;
      const shown = signedInGoals(role, admission);
      const inRails = new Set(shown.flatMap((goal) => goal.functions.map((fn) => fn.id)));
      for (const fn of admittedHomeGoals(role, admission)) {
        // goal (1) → function card (2); the door is on the home: 1.
        expect(inRails.has(fn.id) || isDoorFor(role, fn), `${role}.${fn.id}`).toBe(true);
      }
    }
  });

  it("the navigator opens a function card directly — a real link, no further step", () => {
    const navigator = read("components/navigation/goal-navigator.tsx");
    expect(navigator).toMatch(/testId="function-rail"\s+cards=\{active\.functions\}/);
    const rail = read("components/navigation/card-rail.tsx");
    expect(rail).toMatch(/Every card is a plain link/);
  });
});

describe("a destination is shown once on the home", () => {
  it("the area switcher under the goals holds only the areas the goals do not offer", () => {
    const worker = areasBeyondGoals(PERSONAL_WORK_AREAS, HOME_GOALS.worker).map((a) => a.id);
    expect(worker).toEqual(["numbers", "profile", "gallery"]);
    const company = areasBeyondGoals(ORGANIZATION_WORK_AREAS, HOME_GOALS.company).map((a) => a.id);
    expect(company).toEqual(["messages", "calendar", "capacity", "results", "history"]);
    // The need door and the needs area are the same place.
    expect(routePath(NEED_DOOR_HREF)).toBe("/dashboard/company/needs");
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

  it("the employer's need door is on the home once: the tracked link, never also a rail card", () => {
    for (const role of ROLES) {
      for (const goal of signedInGoals(role, OWNER)) {
        expect(goal.functions.some((fn) => fn.door), `${role}.${goal.id}`).toBe(false);
      }
    }
    const company = read("components/app/organization/company-model-screen.tsx");
    expect(company).toMatch(/\{role === "company" \? \(\s*<NeedDoorLink\s+surface="company_model"/);
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

  it("a worker is offered no employer goal and no employer function", () => {
    const shown = signedInGoals("worker", WORKER);
    expect(shown.map((goal) => goal.id)).toEqual(["work", "services", "orders", "partners"]);
    for (const goal of shown) {
      for (const fn of goal.functions) expect(fn.href.startsWith("/dashboard/company"), fn.id).toBe(false);
    }
    // Even on the employer's goal order, a worker gets no employer goal:
    // its primary function is closed to them, so the goal is not offered.
    expect(signedInGoals("company", WORKER).map((goal) => goal.id)).not.toContain("workers");
    expect(signedInGoals("agency", WORKER).map((goal) => goal.id)).not.toContain("agencies");
    for (const goal of signedInGoals("company", WORKER)) {
      for (const fn of goal.functions) expect(fn.href.startsWith("/dashboard/company"), fn.id).toBe(false);
    }
  });

  it("an owner and a manager by membership get the employer goals; membership grants no role", () => {
    expect(signedInGoals("company", OWNER).map((goal) => goal.id)).toEqual([
      "workers",
      "services",
      "orders",
      "partners",
      "work",
    ]);
    // `membership_accept_v1` grants no company role: the workspace opens the space.
    expect(signedInGoals("company", MANAGER_BY_MEMBERSHIP)[0].id).toBe("workers");
    expect(signedInGoals("agency", MANAGER_BY_MEMBERSHIP)[0].id).toBe("agencies");
  });

  it("a person without the worker role is not offered the worker's goal", () => {
    const findWork = GOAL_FUNCTIONS.work[0];
    expect(findWork.href).toBe("/dashboard/opportunities");
    expect(goalIsAdmitted(findWork, COMPANY_ONLY)).toBe(false);
    expect(signedInGoals("company", COMPANY_ONLY).map((goal) => goal.id)).not.toContain("work");
    expect(goalIsAdmitted(findWork, WORKER)).toBe(true);
  });
});

describe("DEMAND ≠ SUPPLY on the organization home (SEP-4)", () => {
  it("an agency is never offered the need door; the employer's door is the need door", () => {
    expect(HOME_GOALS.agency.map((fn) => fn.href)).not.toContain(NEED_DOOR_HREF);
    expect(HOME_GOALS.company[0].href).toBe(NEED_DOOR_HREF);
    expect(isDoorFor("company", HOME_GOALS.company[0])).toBe(true);
    for (const fn of ALL_FUNCTIONS) expect(isDoorFor("agency", fn), fn.id).toBe(false);
    expect(GOAL_FUNCTIONS.agencies[0].id).toBe("offerPeople");
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
    expect(cards).toMatch(/<AskAssistantEntry label=\{tGoals\("ask\.label"\)\} hint=\{tGoals\("ask\.hint"\)\} \/>/);
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
    expect(code).toMatch(/await listManagedProjects\(\{ activeOnly: true \}\)/);
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
    expect(code).toMatch(/p\.organizationId === organizationId && p\.status !== "completed"/);
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
    // The needs list is a section the Needs door really holds.
    expect(read("app/[locale]/dashboard/company/needs/page.tsx")).toMatch(/id="company-requests"/);
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
  const get = (m: Record<string, unknown>, key: string): unknown =>
    key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], m);

  for (const locale of locales) {
    it(`${locale}: every function has a name, and every goal the shared navigator's copy`, () => {
      const m = JSON.parse(read(`messages/${locale}.json`)) as Record<string, unknown>;
      const texts: string[] = [];
      for (const fn of ALL_FUNCTIONS) {
        const label = get(m, fn.labelKey);
        expect(label, `${locale} ${fn.labelKey}`).toBeTypeOf("string");
        texts.push(label as string);
        // The door's line is the tracked link's own wording, not a hint.
        if (fn.hintKey && !fn.door) {
          const hint = get(m, fn.hintKey);
          expect(hint, `${locale} ${fn.hintKey}`).toBeTypeOf("string");
          texts.push(hint as string);
        }
      }
      for (const goal of PUBLIC_INTENT_IDS) {
        for (const part of ["short", "title", "description"]) {
          expect(get(m, `siteNav.intents.${goal}.${part}`), `${locale} ${goal}.${part}`).toBeTypeOf("string");
        }
      }
      for (const text of texts) {
        expect(text, locale).not.toMatch(/\[EN\]|\bdemo\b/i);
        // Short enough to read at a glance on a phone card.
        expect(text.length, `${locale}: "${text}"`).toBeLessThanOrEqual(48);
      }
    });
  }
});
