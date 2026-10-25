import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { TODAY_STATIONS } from "@/lib/today/today-route";
import {
  ORGANIZATION_WORK_AREAS,
  PERSONAL_WORK_AREAS,
  workAreasFor,
} from "@/lib/navigation/work-areas";
import { WORK_AREA_ICONS } from "@/components/app/work-area-icons";

/**
 * THE AREA SWITCHER (owner order 2026-10-25, phase 2 of the one navigation
 * system): the home surfaces present the work areas as light 3D cards — the
 * chosen one in front, neighbours turned slightly away — from ONE area model
 * per workspace. Reduced-motion and keyboard safe; no new dependency.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const switcher = read("components/app/area-switcher.tsx");

describe("one area model per workspace", () => {
  it("personal areas ARE the stations, in their order (opportunities first)", () => {
    expect(PERSONAL_WORK_AREAS.map((a) => a.href)).toEqual(TODAY_STATIONS.map((s) => s.href));
    expect(workAreasFor("personal")).toBe(PERSONAL_WORK_AREAS);
  });

  it("organization areas are the company model's doors, everyday six first", () => {
    expect(ORGANIZATION_WORK_AREAS.slice(0, 6).map((a) => a.id)).toEqual([
      "need",
      "offer",
      "market",
      "people",
      "projects",
      "messages",
    ]);
    expect(workAreasFor("organization")).toBe(ORGANIZATION_WORK_AREAS);
  });

  it("every area resolves to an existing page and has an icon", () => {
    for (const a of [...PERSONAL_WORK_AREAS, ...ORGANIZATION_WORK_AREAS]) {
      expect(WORK_AREA_ICONS[a.iconKey], `${a.id} icon`).toBeTruthy();
      const segs = a.href.split(/[?#]/)[0].split("/").filter(Boolean);
      expect(existsSync(join(APP, "app", "[locale]", ...segs, "page.tsx")), `${a.href}`).toBe(true);
    }
  });

  it("area labels exist in every routed locale", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de", "pl"]) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const get = (k: string) => k.split(".").reduce((o: Record<string, unknown> | undefined, p) => o?.[p] as Record<string, unknown> | undefined, m);
      for (const a of [...PERSONAL_WORK_AREAS, ...ORGANIZATION_WORK_AREAS]) {
        expect(get(a.labelKey), `${loc} ${a.labelKey}`).toBeTruthy();
      }
      expect(m.common.nav.previous, `${loc} previous`).toBeTruthy();
      expect(m.common.nav.next, `${loc} next`).toBeTruthy();
    }
  });
});

describe("the switcher is a chooser, not a sideways strip", () => {
  it("positions cards instead of scrolling — no scrollbar, no overflow-x scroll", () => {
    expect(switcher).not.toMatch(/overflow-x-(auto|scroll)|snap-x/);
    expect(switcher).toMatch(/overflow-hidden \[perspective:1100px\]/);
    expect(switcher).toMatch(/aria-roledescription="carousel"/);
  });

  it("every card is a real link; the current area is marked", () => {
    expect(switcher).toMatch(/<Link\b[\s\S]{0,200}href=\{item\.href/);
    expect(switcher).toMatch(/aria-current=\{isHere \? "page" : undefined\}/);
  });

  it("keyboard: arrows move the selection, focus brings a card to the front, far cards leave the tab order", () => {
    expect(switcher).toMatch(/"ArrowLeft"/);
    expect(switcher).toMatch(/"ArrowRight"/);
    expect(switcher).toMatch(/onFocus=\{\(\) => setSelected\(i\)\}/);
    expect(switcher).toMatch(/tabIndex=\{untabbable \? -1 : undefined\}/);
    expect(switcher).toMatch(/const untabbable = slot < -1 \|\| slot > visible;/);
    expect(switcher).toMatch(/aria-label=\{prevLabel\}/);
    expect(switcher).toMatch(/aria-label=\{nextLabel\}/);
  });

  it("reduced motion: no rotation and no transitions (pure CSS)", () => {
    // The default pose includes the rotation; the motion-reduce pose is the
    // same transform WITHOUT rotateY.
    expect(switcher).toMatch(/\[transform:[^\]]*rotateY\(var\(--area-ry\)\)/);
    expect(switcher).toMatch(/motion-reduce:\[transform:(?:(?!rotateY)[^\]])*\]/);
    expect(switcher).toMatch(/motion-reduce:transition-none/);
  });

  it("no new dependency — lucide + React only", () => {
    const imports = [...switcher.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    for (const i of imports) expect(i.startsWith("@/") || i === "react" || i === "lucide-react", i).toBe(true);
  });
});

describe("the home surfaces use it", () => {
  it("the worker's ŠIANDIEN stations and the company home doors render the switcher", () => {
    expect(read("components/app/today/today-screen.tsx")).toMatch(/<AreaSwitcher\b/);
    expect(read("components/app/organization/company-model-screen.tsx")).toMatch(/<AreaSwitcher\b/);
  });
});
