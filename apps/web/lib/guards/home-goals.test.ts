import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NAV_CARD_ICONS } from "@/components/navigation/nav-card-icon";
import { ROLE_GATED_PREFIXES } from "@/lib/auth/role-gated-routes";
import { NEED_DOOR_HREF } from "@/lib/company/need-door";
import { locales } from "@/lib/i18n/config";
import {
  AREA_CARD_ICONS,
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
import { isPinnableRef } from "@/lib/workspace/pins-model";
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
    expect(code).toMatch(/import \{ HomeGoalNavigator \} from "@\/components\/app\/home\/home-goal-navigator";/);
    expect(code).toMatch(/<HomeGoalNavigator\b/);
    // The client half is the shared navigator with the shared card's pin slot
    // filled in — it draws no control of its own.
    const client = read("components/app/home/home-goal-navigator.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(client).toMatch(/import \{ GoalNavigator, type NavigatorGoal \} from "@\/components\/navigation\/goal-navigator";/);
    expect(client).toMatch(/<GoalNavigator\b/);
    expect(client).not.toMatch(/<button\b|<Link\b|<a\b|grid-cols-|overflow-x-|snap-x|lucide-react/);
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
    // FIRST, above the person's own header: on a phone the composer covers the
    // bottom of the first screen and the goals must be whole above it
    // (integrated check 2026-11-12).
    expect(today.indexOf('<HomeGoalCards role="worker" />')).toBeGreaterThan(-1);
    expect(today.indexOf('<HomeGoalCards role="worker" />')).toBeLessThan(today.indexOf('data-testid="today-header"'));
    expect(today.indexOf('<HomeGoalCards role="worker" />')).toBeLessThan(today.indexOf('data-testid="today-regions"'));
    const pendingFrame = today.slice(today.indexOf("function TodayScreenPending"), today.indexOf("export function TodayScreen"));
    expect(pendingFrame.indexOf("<HomeGoalCardsPending />")).toBeLessThan(pendingFrame.indexOf("h-9 w-56"));
    // The frame-level placeholder reserves the navigation's footprint (home CLS).
    expect(today).toMatch(/<HomeGoalCardsPending \/>/);
    const company = read("components/app/organization/company-model-screen.tsx");
    expect(company.indexOf("<HomeGoalCards")).toBeGreaterThan(-1);
    expect(company.indexOf("<HomeGoalCards")).toBeLessThan(company.indexOf("<HomeAreaRail"));
    // The goals lead the organization home too: only its title and the one
    // need door stand before them, and it uses the wide column so the six
    // goals share one row on a desktop, as on the landing.
    expect(company.indexOf("<HomeGoalCards")).toBeLessThan(company.indexOf("<OrganizationApprovalsCard"));
    expect(company).toMatch(/data-testid="company-model"\s+className="mx-auto flex w-full max-w-6xl /);
    expect(read("app/[locale]/dashboard/page.tsx")).toMatch(/openingContextWide=\{Boolean\(workerToday \|\| companyOpeningContext\)\}/);
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

describe("the two people who had no home: a customer, and an employee inside an organization", () => {
  const CUSTOMER = { heldRoles: ["customer"], opensCompanySpace: false };
  const EMPLOYEE = { heldRoles: ["worker"], opensCompanySpace: false };
  const page = read("app/[locale]/dashboard/page.tsx");

  it("a customer with no organization meets their own requests first, and nothing they cannot open", () => {
    const goals = signedInGoals("customer", CUSTOMER);
    expect(goals.map((g) => g.id)).toEqual(["services", "orders", "partners"]);
    expect(goals[0].functions.map((fn) => fn.id)).toContain("myRequests");
    for (const goal of goals) {
      for (const fn of goal.functions) expect(routeIsAdmitted(fn.href, CUSTOMER), fn.id).toBe(true);
    }
    // "Find work" needs the worker role: the goal is not offered at all.
    expect(goals.map((g) => g.id)).not.toContain("work");
  });

  it("the customer's own door is shown only to a person who holds that role", () => {
    for (const role of ["worker", "company", "agency"] as const) {
      const ids = signedInGoals(role, role === "worker" ? WORKER : COMPANY_ONLY).flatMap((g) => g.functions.map((fn) => fn.id));
      expect(ids, role).not.toContain("myRequests");
    }
    expect(routeIsAdmitted("/dashboard/buyer", WORKER)).toBe(false);
  });

  it("an employee inside an organization gets their own functions, never the employer's", () => {
    const goals = signedInGoals("worker", EMPLOYEE);
    expect(goals[0].id).toBe("work");
    const hrefs = goals.flatMap((g) => g.functions.map((fn) => fn.href));
    expect(hrefs).toContain("/dashboard/journal");
    expect(hrefs.some((h) => h.startsWith("/dashboard/company"))).toBe(false);
  });

  it("the page gives them the shared navigator only where no role home exists", () => {
    expect(page).toMatch(/workerToday \|\| \(activeOrgWorkspace && identity === "company"\)\s*\? null\s*: activeRole === "customer"\s*\? "customer"\s*: "worker";/);
    expect(page).toMatch(/<section data-testid="goals-home"[^>]*>\s*<HomeGoalCards role=\{goalsOnlyRole\} \/>/);
    expect(page).toMatch(/!companyModel && goalsOnlyRole \? \(/);
  });

  it("the customer card has its text in all 11 catalogs", () => {
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const m = JSON.parse(read(`messages/${locale}.json`)).homeGoals.customer.myRequests;
      expect(m.label, locale).toBeTruthy();
      expect(m.hint, locale).toBeTruthy();
      expect(`${m.label} ${m.hint}`).not.toMatch(/^\[EN\]|\bdemo\b/i);
    }
  });
});

describe("one rail on the home: the remaining areas are cards of the shared rail", () => {
  const rail = read("components/app/home/home-area-rail.tsx").replace(/\/\*[\s\S]*?\*\//g, "");

  it("neither home mounts a second carousel; both hand their areas to the shared rail", () => {
    for (const file of ["components/app/today/today-screen.tsx", "components/app/organization/company-model-screen.tsx"]) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code, file).not.toMatch(/AreaSwitcher|area-switcher/);
      expect(code, file).toMatch(/<HomeAreaRail\b/);
    }
    expect(rail).toMatch(/import \{ CardRail \} from "@\/components\/navigation\/card-rail";/);
    expect(rail).toMatch(/<CardRail\b/);
    expect(rail).not.toMatch(/<Link\b|<a\b|<button\b|overflow-x-|snap-x|perspective|lucide-react/);
  });

  it("every area has a card icon, and no rail shows one icon twice", () => {
    for (const [areas, goals, name] of [
      [PERSONAL_WORK_AREAS, HOME_GOALS.worker, "worker"],
      [ORGANIZATION_WORK_AREAS, HOME_GOALS.company, "company"],
      [ORGANIZATION_WORK_AREAS, HOME_GOALS.agency, "agency"],
    ] as const) {
      const left = areasBeyondGoals(areas, goals);
      const icons = left.map((a) => AREA_CARD_ICONS[a.iconKey]);
      for (const [i, icon] of icons.entries()) expect(NAV_CARD_ICONS[icon], `${name}.${left[i].id}`).toBeTruthy();
      expect(new Set(icons).size, `${name} area icons`).toBe(icons.length);
    }
  });
});

describe("pinning from a function card: the shared slot, the row as the one writer", () => {
  const strip = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const client = strip("components/app/home/home-goal-navigator.tsx");
  const row = strip("components/app/conversation/chat/my-space-row.tsx");
  const cards = strip("components/app/home/home-goal-cards.tsx");

  it("a card offers a pin only for a reference the pin store accepts, with both names", () => {
    expect(cards).toMatch(/const ref = `link:\$\{fn\.href\}`;/);
    expect(cards).toMatch(/pinning: isPinnableRef\(ref\)/);
    expect(cards).toMatch(/tGoals\("pin\.add", \{ label \}\)/);
    expect(cards).toMatch(/tGoals\("pin\.remove", \{ label \}\)/);
    for (const role of ROLES) {
      for (const fn of HOME_GOALS[role]) {
        if (fn.door) continue;
        expect(isPinnableRef(`link:${fn.href}`), `${role}.${fn.id} can be pinned`).toBe(true);
      }
    }
  });

  it("the card never writes: it asks the row, and draws what the row published", () => {
    expect(client).not.toMatch(/pins-actions|pinAction|unpinAction/);
    expect(client).toMatch(/requestPinToggle\(\{ ref, label \}\)/);
    expect(client).toMatch(/if \(!pinning \|\| !pinned\.available\) return card;/);
    expect(row).toMatch(/publishPinned\(canEdit \? pins\.map\(\(p\) => p\.ref\) : null\)/);
    expect(row).toMatch(/setPinToggleHandler\(/);
  });

  it("the shared state: nothing is offered until the row announces itself", async () => {
    const sync = await import("@/lib/workspace/pin-sync");
    expect(sync.readPinnedOnServer()).toEqual({ available: false, refs: [] });
    expect(await sync.requestPinToggle({ ref: "link:/cv", label: "x" })).toEqual({ ok: false });
    let calls = 0;
    const stop = sync.subscribePinned(() => {
      calls += 1;
    });
    sync.publishPinned(["link:/cv"]);
    sync.publishPinned(["link:/cv"]);
    expect(calls, "an unchanged list does not re-render the cards").toBe(1);
    expect(sync.readPinned()).toEqual({ available: true, refs: ["link:/cv"] });
    const off = sync.setPinToggleHandler(async ({ ref }) => ({ ok: ref === "link:/cv" }));
    expect(await sync.requestPinToggle({ ref: "link:/cv", label: "x" })).toEqual({ ok: true });
    off();
    expect(await sync.requestPinToggle({ ref: "link:/cv", label: "x" })).toEqual({ ok: false });
    sync.publishPinned(null);
    expect(sync.readPinned().available).toBe(false);
    stop();
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
    expect(company.indexOf("<HomeQuickAccess />")).toBeGreaterThan(company.indexOf("<HomeAreaRail"));
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

describe("the signed-in skip link (WCAG 2.4.1)", () => {
  const header = read("components/app/conversation/chat/conversation-header.tsx");

  it("is the first thing in the one header, named in every catalog, and never changes the address", () => {
    const body = header.slice(header.indexOf('data-testid="app-header"'));
    expect(body.indexOf('data-testid="app-skip-link"')).toBeGreaterThan(-1);
    expect(body.indexOf('data-testid="app-skip-link"')).toBeLessThan(body.indexOf("<Link"));
    expect(header).toMatch(/href=\{`#\$\{APP_CONTENT_ID\}`\}/);
    expect(header).toMatch(/e\.preventDefault\(\);\s*target\.focus\(\);/);
    expect(header).toMatch(/sr-only focus:not-sr-only/);
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const text = JSON.parse(read(`messages/${locale}.json`)).common.skipToContent as string;
      expect(text, locale).toBeTruthy();
      expect(text, locale).not.toMatch(/^\[EN\]/);
    }
  });

  it("every shell that mounts the header gives the link exactly one place to land", () => {
    const chrome = read("components/app/dashboard-chrome.tsx");
    expect((chrome.match(/<main id=\{APP_CONTENT_ID\} tabIndex=\{-1\}/g) ?? []).length).toBe(2);
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect((chat.match(/id=\{APP_CONTENT_ID\}/g) ?? []).length).toBe(1);
    expect(chat.indexOf("id={APP_CONTENT_ID}")).toBeGreaterThan(chat.indexOf("<ConversationHeader title={labels.headerTitle}"));
  });
});
