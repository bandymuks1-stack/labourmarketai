import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ORGANIZATION_DOOR_ORDER,
  ORGANIZATION_DOOR_ROUTES,
} from "@/lib/company/organization-doors";

/**
 * COMPANY CONTEXT IS COMPANY MANAGEMENT + THE MARKETPLACE IS REACHABLE
 * (owner order 2026-10-01; walked on the real build as the synthetic QA
 * company owner).
 *
 * Findings this pins:
 *   D1  the company home showed the owner's PERSONAL work column ("Tavo
 *       darbas dabar — what your own entries say") beside the company chat;
 *   D2  the avatar menu offered the owner's personal profile / player card /
 *       CV while acting as the organization;
 *   D3  the personal journal said nothing about whose journal it was;
 *   D4  a failing dashboard page replaced the whole shell with the bare
 *       "Įvyko klaida" screen (no workspace chip, no way home);
 *   E1  the organization doors had no marketplace door;
 *   E2  the service-requests "connections" sent a COMPANY to the worker-only
 *       board, which bounces it away;
 *   E3  the people search drew a Message button for everyone, which dead-ends
 *       for anyone without a recorded relationship.
 *
 * The core nav stays context-free (context-parity-one-calendar.test.ts); the
 * fixes below are in the CONTENT of each surface, not a second nav.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

describe("company context shows no personal work column or personal identity entries", () => {
  it("the context panel does not read or draw the person's own work context outside the personal workspace", () => {
    const panel = read("components/app/world-state/context-panel.tsx");
    expect(panel).toMatch(/resultContext !== "personal" && panel\.mode !== "entity" && !showsResult/);
    expect(panel).toMatch(/orgRestingHome \|\|/);
    // the personal read is not even issued outside the personal workspace
    expect(panel).toMatch(/resultContext !== "personal"\s*\?[\s\S]{0,200}Promise\.resolve\(\)/);
  });

  it("the avatar menu hides personal profile, player card and CV in an organization workspace", () => {
    const menu = read("components/app/account-menu.tsx");
    expect(menu).toMatch(/const isOrgContext = menuResultContext === "organization"/);
    expect(menu).toMatch(/isOrgContext\s*\?\s*\{ href: "\/dashboard\/company\/settings"/);
    expect(menu).toMatch(/isOrgContext \? null : \(\s*<Link\s+href="\/cv"/);
  });

  it("the personal journal states whose journal it is when the acting workspace is an organization", () => {
    const journal = read("app/[locale]/dashboard/journal/page.tsx");
    expect(journal).toMatch(/data-testid="journal-org-context-notice"/);
    expect(journal).toMatch(/w\.kind === "organization"/);
  });

  it("a failing dashboard page keeps the shell: a dashboard-segment error boundary exists", () => {
    const file = join(WEB, "app", "[locale]", "dashboard", "error.tsx");
    expect(existsSync(file)).toBe(true);
    const src = read("app/[locale]/dashboard/error.tsx");
    expect(src).toMatch(/^"use client";/);
    expect(src).toMatch(/export \{ default \} from "\.\.\/error"/);
  });
});

describe("the marketplace is reachable and does not dead-end", () => {
  it("the organization doors carry a marketplace door to the real service/request loop", () => {
    expect(ORGANIZATION_DOOR_ORDER).toContain("market");
    expect(ORGANIZATION_DOOR_ROUTES.market).toBe("/dashboard/service-requests");
    expect(
      existsSync(join(WEB, "app", "[locale]", "dashboard", "service-requests", "page.tsx")),
    ).toBe(true);
    for (const loc of ["lt", "en", "de", "nl", "pl", "ru"]) {
      const m = JSON.parse(read(`messages/${loc}.json`)) as {
        organizationDoors: { market?: string };
      };
      expect(m.organizationDoors.market, loc).toBeTruthy();
    }
  });

  it("a company never gets the worker-only board as its matching door", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/isCompany\s*\?\s*\{[\s\S]{0,120}href: "\/dashboard\/company\/scouting"/);
    expect(page).toMatch(/resolveEmployerCompanyContext\(\)/);
    // the worker board stays the matching door for everyone else
    expect(page).toMatch(/href: "\/dashboard\/opportunities"/);
  });

  it("the people search draws Message only where a thread can actually open", () => {
    const page = read("app/[locale]/dashboard/network/page.tsx");
    expect(page).toMatch(/resolveContactPermission\(p\.profileId\)/);
    expect(page).toMatch(/isContactPermitted\(/);
    expect(page).toMatch(/p\.profileId && contactable\.has\(p\.profileId\)/);
    expect(page).toMatch(/search\.noContactYet/);
  });
});
