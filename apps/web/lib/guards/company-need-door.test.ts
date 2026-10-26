import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { NEED_DOOR_HREF, NEED_DOOR_SURFACES, isFirstNeed } from "@/lib/company/need-door";
import { activeLocales } from "@/lib/i18n/config";

/**
 * THE FIRST NEED — measurement truth and the first door (activation audit
 * 2026-10-26 §2, fixes #2 and #3).
 *
 * What the audit found, and what this guard keeps from coming back:
 *   - the only tracked "describe a need" click linked to `#company-requests`,
 *     a section only the Needs door holds — on the Settings page it went
 *     nowhere, and the real doors (home, chat home, chat) were untracked;
 *   - the candidates panel sent the same event after ANY shortlist / contact /
 *     booking, so the door count rose with unrelated work;
 *   - the company intake never sent `demand_form_viewed`;
 *   - setup success offered only "Open the company workspace", and the home's
 *     first button was "Create the first project";
 *   - one action, seven labels — one of them "Publish", beside copy that says
 *     the need is not shown publicly.
 *
 * Source-level pins (the pattern every guard in this folder uses); the
 * production walks prove the intake itself still saves.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");
const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const DOOR = "components/app/need-door-link.tsx";
const CHAT = "components/app/conversation/chat/conversation-chat.tsx";
const HOME = "app/[locale]/dashboard/company/page.tsx";
const FIELD = "components/app/company-home-field-section.tsx";
const MODEL = "components/app/organization/company-model-screen.tsx";
const READBACK = "components/app/demand-requests-readback.tsx";
const SETTINGS_CARD = "components/app/company-next-actions.tsx";
const SETUP = "components/app/company-setup-form.tsx";
const NEEDS = "app/[locale]/dashboard/company/needs/page.tsx";
const CANDIDATES = "components/app/workspace/candidates-result.tsx";

/** Which file carries each door. Every surface the registry names is here. */
const DOOR_FILES: Record<(typeof NEED_DOOR_SURFACES)[number], string> = {
  chat: CHAT,
  company_home_first: FIELD,
  company_home_field: FIELD,
  company_home_actions: HOME,
  company_model: MODEL,
  company_needs_repeat: READBACK,
  company_settings: SETTINGS_CARD,
  company_setup: SETUP,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}
const SOURCES = [...walk(join(WEB, "app")), ...walk(join(WEB, "components"))].map((p) => ({
  rel: relative(WEB, p).replace(/\\/g, "/"),
  code: strip(readFileSync(p, "utf8")),
}));

describe("the need door: one address, one event, one label", () => {
  it("points at the canonical intake, which the Needs door actually holds", () => {
    expect(NEED_DOOR_HREF).toBe("/dashboard/company/needs#demand-intake");
    expect(read(NEEDS)).toMatch(/id="demand-intake"/);
  });

  it("the shared door fires company_demand_action_clicked with its surface and renders the one label", () => {
    const src = strip(read(DOOR));
    expect(src).toMatch(/^"use client";/);
    expect(src).toMatch(/href=\{NEED_DOOR_HREF as "\/dashboard"\}/);
    expect(src).toMatch(/trackFunnel\(FUNNEL_EVENTS\.companyDemandActionClicked, \{\s*surface,/);
    expect(src).toMatch(/useTranslations\("roleDashboards\.company\.needDoor"\)/);
    expect(src).toMatch(/\{t\("label"\)\}/);
    // No caller-supplied wording: the label cannot drift per door.
    expect(src).not.toMatch(/\bchildren\b/);
  });

  for (const surface of NEED_DOOR_SURFACES) {
    it(`door "${surface}" emits the click with its own surface`, () => {
      const src = strip(read(DOOR_FILES[surface]));
      if (surface === "chat") {
        expect(src).toMatch(
          /trackFunnel\(FUNNEL_EVENTS\.companyDemandActionClicked, \{\s*surface: "chat",/,
        );
      } else if (surface === "company_needs_repeat") {
        expect(src).toMatch(/event=\{FUNNEL_EVENTS\.companyDemandActionClicked\}/);
        expect(src).toMatch(/eventMetadata=\{\{ surface: "company_needs_repeat"/);
      } else {
        expect(src).toMatch(new RegExp(`<NeedDoorLink[^>]*surface="${surface}"`));
      }
    });
  }

  it("the chat counts the door tap and the form it opens", () => {
    const src = strip(read(CHAT));
    // The starter / follow-up chip and the bridge link to the Needs door.
    expect(src).toMatch(
      /chip\.id\.split\("\?"\)\[0\] === "f:company\.create-demand" \|\| chip\.id === `link:\$\{NEED_DOOR_HREF\}`/,
    );
    // The bridge chips still name the same address the constant holds.
    expect(src).toContain(`id: "link:${NEED_DOOR_HREF}"`);
    expect(src).toMatch(
      /actionId === "company\.create-demand"\) \{\s*trackFunnel\(FUNNEL_EVENTS\.demandFormViewed, \{\s*surface: "chat",/,
    );
  });

  it("company_demand_action_clicked is sent ONLY from need doors", () => {
    const allowed = new Set([DOOR, CHAT, READBACK]);
    const emitters = SOURCES.filter((s) => s.code.includes("companyDemandActionClicked")).map((s) => s.rel);
    expect(emitters.filter((rel) => !allowed.has(rel))).toEqual([]);
    // The candidates panel's writes are counted server-side (chat_action_persisted,
    // shortlist_added, contact_requested) — never as a need-door click.
    expect(strip(read(CANDIDATES))).not.toMatch(/companyDemandActionClicked/);
  });
});

describe("no dead anchor", () => {
  it("nothing links to #company-requests (the section exists on the Needs door only)", () => {
    const offenders = SOURCES.filter((s) => /href=\{?["'`]#company-requests/.test(s.code)).map((s) => s.rel);
    expect(offenders).toEqual([]);
  });

  it("the doors in scope no longer hand-write the intake address", () => {
    for (const rel of [MODEL, SETTINGS_CARD, SETUP]) {
      expect(strip(read(rel)), rel).not.toContain("company/needs#demand-intake");
    }
    // The home's action row and field route the need through the shared door.
    expect(strip(read(HOME))).not.toContain("company/needs#demand-intake");
    expect(strip(read(HOME))).toMatch(/<NeedDoorLink surface="company_home_actions" testId="company-primary-action-need"/);
    expect(strip(read(FIELD))).toMatch(/<NeedDoorLink\s+surface="company_home_field"\s+testId="company-home-need-new"/);
  });
});

describe("the intake reports that it rendered", () => {
  it("the Needs door sends demand_form_viewed inside #demand-intake, before the wizard", () => {
    const src = strip(read(NEEDS));
    const section = src.indexOf('id="demand-intake"');
    const view = src.indexOf("event={FUNNEL_EVENTS.demandFormViewed}");
    const wizard = src.indexOf("<DemandRequestButton");
    expect(section).toBeGreaterThan(-1);
    expect(view).toBeGreaterThan(section);
    expect(wizard).toBeGreaterThan(view);
    expect(src).toMatch(/surface: "company_needs"/);
  });
});

describe("the first need is the first door", () => {
  it("setup success: the need door is primary, the workspace secondary beside it", () => {
    const src = strip(read(SETUP));
    const need = src.search(/<NeedDoorLink\s+surface="company_setup"/);
    const workspace = src.indexOf('data-testid="company-setup-go-workspace"');
    expect(need).toBeGreaterThan(-1);
    expect(workspace).toBeGreaterThan(need);
    expect(src).toMatch(/buttonLinkClassName\("primary", "sm"\)/);
    expect(src).toMatch(/buttonLinkClassName\(needFirst \? "secondary" : "primary", "sm"\)/);
    // An agency's Needs door opens on its OFFER; an institution starts with
    // learners — both keep the workspace as their primary door.
    expect(src).toMatch(
      /const needFirst = savedType !== "staffing_agency" && presetCapability !== "training_provider";/,
    );
  });

  it("company home: with no need yet, the need card stands above the field; projects stay, quieter", () => {
    // The page hands the field what it needs to decide (no extra read).
    expect(strip(read(HOME))).toMatch(/companyType=\{companyRow\?\.companyType \?\? null\}/);
    const src = strip(read(FIELD));
    const card = src.indexOf("{needFirst ? <CompanyFirstNeedCard /> : null}");
    const field = src.indexOf('aria-labelledby="company-home-field-title"');
    expect(card).toBeGreaterThan(-1);
    expect(field).toBeGreaterThan(card);
    expect(src).toMatch(
      /const needFirst = isFirstNeed\(\{\s*hasCompany: true,\s*audience: resolveNeedsAudience\(\{ companyType, capabilities \}\)\.audience,\s*readback: needs,/,
    );
    // The card: the shared door as the one primary, the calm invite line.
    expect(src).toMatch(/<NeedDoorLink\s+surface="company_home_first"/);
    expect(src).toMatch(/data-testid="company-first-need-invite"/);
    expect(src).toMatch(/\/dashboard\/network\?type=join_as_employee/);
    // "Create the first project" stays, in the quiet grammar while the card shows.
    expect(src).toMatch(
      /href="\/dashboard\/company\/projects\/new"\s*className=\{`\$\{needFirst \? ACTION_LINK : PRIMARY_LINK\} w-fit`\}\s*data-testid="company-home-projects-empty-cta"/,
    );
    expect(src).toMatch(/testId="company-home-need-new"\s*className=\{`\$\{needFirst \? ACTION_LINK : PRIMARY_LINK\}/);
  });

  it("the home holds one primary action: the first-need card's door", () => {
    expect((strip(read(HOME)).match(/buttonLinkClassName\("primary"/g) ?? []).length).toBe(0);
    expect((strip(read(FIELD)).match(/buttonLinkClassName\("primary"/g) ?? []).length).toBe(1);
  });

  it("isFirstNeed: only a successful read with no demand row, only where the Needs door asks for a need", () => {
    const ok = (directions: string[]) => ({ kind: "ok" as const, rows: directions.map((direction) => ({ direction })) });
    expect(isFirstNeed({ hasCompany: true, audience: "need", readback: ok([]) })).toBe(true);
    // An agency's own offer is not a need.
    expect(isFirstNeed({ hasCompany: true, audience: "need", readback: ok(["supply"]) })).toBe(true);
    // Any demand row — draft, open or closed — means the company has been here.
    expect(isFirstNeed({ hasCompany: true, audience: "need", readback: ok(["demand"]) })).toBe(false);
    // Unknown is not zero.
    expect(isFirstNeed({ hasCompany: true, audience: "need", readback: { kind: "error" } })).toBe(false);
    expect(isFirstNeed({ hasCompany: true, audience: "need", readback: { kind: "needs-migration" } })).toBe(false);
    // An organization whose Needs door opens on its offer.
    expect(isFirstNeed({ hasCompany: true, audience: "offer", readback: ok([]) })).toBe(false);
    expect(isFirstNeed({ hasCompany: false, audience: "need", readback: ok([]) })).toBe(false);
  });
});

describe("one honest label per locale", () => {
  const PUBLISH = /publish|paskelb|опубликов|publiceer|veröffentlich|opublik/i;
  for (const loc of activeLocales) {
    it(`${loc}: every need door says the same thing, and it does not say "publish"`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const door = m.roleDashboards?.company?.needDoor;
      for (const k of ["label", "firstTitle", "firstBody", "noNeedYet", "noNeedYetInvite"]) {
        expect(typeof door?.[k] === "string" && door[k].trim() !== "", `${loc}.needDoor.${k}`).toBe(true);
      }
      // The chat's starter chip opens the same intake: same words.
      expect(m.conversation.chat.chipNeedWorkers).toBe(door.label);
      expect(door.label).not.toMatch(PUBLISH);
      expect(JSON.stringify(door)).not.toMatch(PUBLISH);
      // The retired second wordings stay retired.
      expect(m.companyModel?.primary).toBeUndefined();
      expect(m.organizationDoors?.pages?.now?.newNeed).toBeUndefined();
      expect(m.companyHome?.missing?.needsCta).toBeUndefined();
    });
  }
});
