import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE SIGNED-IN HOME HOLDS STILL (P0, production ux-metrics walk 2026-10-26).
 *
 * Cumulative layout shift on `/[locale]/dashboard` measured ≈ 0.55 on the
 * worker's phone and ≈ 0.31 on a desktop in all six locales (good < 0.1).
 * The owner's own Chrome attributed the largest shift (0.154, t≈8.0 s) to the
 * ŠIANDIEN frame arriving only when the player card had been read, pushing the
 * conversation below it; the next (0.034, t≈9.1 s) to the home's late regions
 * moving the stations. These pins keep the causes from coming back. They are
 * SOURCE guards on purpose: the shift is a property of what renders before
 * the slow reads finish, which a static read can prove.
 *
 * What #1011 fixed stays fixed and is pinned beside it: the surface reaches
 * the shell at once — nothing here may await a slow read above a boundary.
 */
const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The body of a top-level function, from its declaration to the next one. */
function fnBody(src: string, decl: RegExp): string {
  const at = src.search(decl);
  expect(at, `declaration ${decl} not found`).toBeGreaterThan(-1);
  const rest = src.slice(at + 1);
  const next = rest.search(/\n(?:export )?(?:async )?function \w+/);
  return next === -1 ? src.slice(at) : src.slice(at, at + 1 + next);
}

const SCREEN = stripComments(read("components/app/today/today-screen.tsx"));
const REGIONS = read("components/app/home/home-regions.tsx");
const SERVER = read("lib/today/today-server.ts");
const THREAD = read("components/app/conversation/chat/conversation-thread.tsx");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const PAGE = read("app/[locale]/dashboard/page.tsx");

describe("the ŠIANDIEN frame paints first — its head awaits nothing slow", () => {
  const head = fnBody(SCREEN, /async function TodayScreenHead\b/);

  it("the head awaits neither the player card nor the work-card head", () => {
    expect(head).not.toMatch(/loadTodayHead\(|getWorkerPlayerCard\(|getWorkerCard\(/);
    // The name is the request-cached session name; the profession streams.
    expect(head).toMatch(/loadTodayDisplayName\(\)/);
    expect(head).toMatch(/<Suspense fallback=\{<InlinePending \/>\}>\s*<TodayProfession \/>/);
  });

  it("nothing in the whole screen file awaits the player card", () => {
    expect(SCREEN).not.toMatch(/loadTodayHead|getWorkerPlayerCard/);
  });

  it("the profession reader is the ONE cached profession read, not the card", () => {
    const body = SERVER.slice(SERVER.indexOf("export const loadTodayProfessions"));
    const own = body.slice(0, body.indexOf("});") + 3);
    expect(own).toMatch(/getProfessionEntries\(\)/);
    expect(own).toMatch(/getPrimaryProfessionSlug\(\)/);
    expect(own).not.toMatch(/getWorkerPlayerCard/);
  });

  it("#1011 holds: the exported screen is synchronous and the head sits behind its own boundary", () => {
    expect(SCREEN).not.toMatch(/export async function TodayScreen\b/);
    expect(SCREEN).toMatch(/<Suspense fallback=\{<TodayScreenPending \/>\}>\s*<TodayScreenHead locale=\{locale\} \/>/);
  });
});

describe("no late region appears out of nothing above the stations", () => {
  const head = fnBody(SCREEN, /async function TodayScreenHead\b/);
  const aboveStations = head.slice(0, head.indexOf('data-testid="today-stations"'));

  it("every boundary above the stations has a pending state that takes room", () => {
    expect(aboveStations.indexOf('data-testid="today-header"')).toBeGreaterThan(-1);
    expect(aboveStations).not.toMatch(/fallback=\{null\}/);
    const boundaries = aboveStations.match(/<Suspense fallback=\{[^}]*\}/g) ?? [];
    // header profession + header state + WAITING + visibility + TRACE +
    // RUNNING + OUTSIDE + BECAUSE.
    expect(boundaries.length).toBe(8);
  });

  it("the regions reserve their height while they read", () => {
    expect(aboveStations).toMatch(/<HomeRegionPending label=\{t\("reading"\)\} size="action" \/>\}>\s*<HomeWaiting/);
    expect(aboveStations).toMatch(/<Suspense fallback=\{<HomeLinePending \/>\}>\s*<HomeEmployerVisibility/);
    expect(aboveStations).toMatch(/<HomeRegionPending label=\{t\("reading"\)\} \/>\}>\s*<HomeTrace/);
    expect(aboveStations).toMatch(/<HomeRegionPending label=\{t\("reading"\)\} \/>\}>\s*<HomeOutside/);
    expect(aboveStations).toMatch(/<HomeRegionPending label=\{t\("reading"\)\} \/>\}>\s*<HomeBecause/);
  });

  it("the placeholders carry a minimum height — the region's own frame, not a one-line box", () => {
    expect(REGIONS).toMatch(/const PENDING_RESERVE = \{\s*action: "min-h-\d+[^"]*",\s*region: "min-h-\d+[^"]*",/);
    const pending = REGIONS.slice(REGIONS.indexOf("export function HomeRegionPending"));
    expect(pending.slice(0, 900)).toMatch(/PENDING_RESERVE\[size\]/);
    expect(REGIONS).toMatch(/data-testid="home-line-pending"\s*className="min-h-\d+/);
  });

  it("the availability line — failure-only, known last — closes the frame after the stations", () => {
    const stations = head.indexOf('data-testid="today-stations"');
    const availability = head.indexOf("<HomeAvailability />");
    expect(availability).toBeGreaterThan(stations);
  });

  it("the frame-level pending state draws the whole footprint, stations included", () => {
    const pending = fnBody(SCREEN, /function TodayScreenPending\b/);
    expect(pending).toMatch(/<HomeRegionPending size="action" \/>/);
    expect(pending).toMatch(/<HomeLinePending \/>/);
    expect(pending).toMatch(/data-testid="today-stations-pending"/);
    // The area switcher's track is `h-40`; the reservation matches it.
    expect(pending).toMatch(/className="mt-2 h-40"/);
    expect(read("components/app/area-switcher.tsx")).toMatch(/className="relative h-40 /);
  });
});

describe("the greeting under the home is not re-centred by late arrivals", () => {
  it("the opening column is centred only when no wide home sits above it", () => {
    expect(THREAD).toMatch(/const wideIntroAbove = Boolean\(intro && introWide\);/);
    expect(THREAD).toMatch(/!wideIntroAbove && isOpening \? "my-auto" : ""/);
  });
});

describe("the S2 intro reserves its space only when it will render", () => {
  it("the chat's intro boundary has a sized pending state, never null", () => {
    const chat = stripComments(CHAT);
    expect(chat).toMatch(/<Suspense fallback=\{<PersonalWorkspaceIntroPending \/>\}>\s*<PersonalWorkspaceIntroStream/);
    expect(chat).not.toMatch(/<Suspense fallback=\{null\}>\s*<PersonalWorkspaceIntroStream/);
    const pending = CHAT.slice(CHAT.indexOf("function PersonalWorkspaceIntroPending"));
    expect(pending.slice(0, 600)).toMatch(/className="min-h-\d+/);
  });

  it("the page hands a payload only when the block can render — decided before the slow read", () => {
    const page = stripComments(PAGE);
    expect(page).toMatch(/const introMayShow = personalIntroMayShow\(\{/);
    expect(page).toMatch(/: introMayShow\s*\? loadPersonalIntroPayload\(\)\s*: null;/);
    // The page's OWN decided identity (never a `?? "worker"` fallback on the
    // page — w6-honesty-small-fixes). For a missing role both it and the
    // loader's rule land on "person", so the two cannot disagree.
    expect(page).toMatch(/personalIntroMayShow\(\{[\s\S]*?\n\s*identity,\n/);
    expect(page).toMatch(/const identity = baseIdentityForRole\(activeRole\) \?\? "person";/);
  });

  it("#1011 holds: the payload is still never awaited by the page", () => {
    const page = stripComments(PAGE);
    expect(page).not.toMatch(/await loadPersonalIntroPayload\(/);
    expect(page).not.toMatch(/await personalIntroPayload/);
  });
});

describe("the head's work card is fed the row already in hand", () => {
  it("loadTodayHead passes the core row to getWorkerCard (no second `workers` select)", () => {
    const head = SERVER.slice(SERVER.indexOf("export const loadTodayHead"));
    expect(head.slice(0, 3000)).toMatch(/\}, \{ row: worker \}\);/);
  });
});
