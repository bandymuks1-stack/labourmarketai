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
    expect(switcher).toMatch(/if \(!pointerDown\.current\) setSelected\(i\);/);
    expect(switcher).toMatch(/tabIndex=\{untabbable \? -1 : undefined\}/);
    expect(switcher).toMatch(/const untabbable = slot < -1 \|\| slot > visible;/);
    expect(switcher).toMatch(/aria-label=\{prevLabel\}/);
    expect(switcher).toMatch(/aria-label=\{nextLabel\}/);
  });

  it("arrow-key focus never scrolls the clipped track, and a native scroll is undone", () => {
    // Codex P2 (#2783): focus() scrolled the overflow-hidden track and its
    // scrollLeft drifted outside the positioned geometry.
    expect(switcher).toMatch(/focus\(\{ preventScroll: true \}\)/);
    expect(switcher).not.toMatch(/\.focus\(\);/);
    expect(switcher).toMatch(/onScroll=\{\(e\) => \{\s*e\.currentTarget\.scrollLeft = 0;/);
  });

  it("the 3D plane never swallows a press meant for a card behind it", () => {
    // Real-mouse walk: cards at translateZ(-28px) sat behind the <ul> plane,
    // so elementFromPoint (and every click) resolved to the list.
    expect(switcher).toMatch(/<ul className="pointer-events-none relative h-full \[transform-style:preserve-3d\]">/);
    expect(switcher).toMatch(/pointerEvents: far \? "none" : "auto"/);
  });

  it("a pointer press does not move the window before the click lands", () => {
    // Codex P2 (#2783): mouse-down focus repositioned the window mid-press,
    // so the pressed card glided away and the click never activated it.
    expect(switcher).toMatch(/pointerDown\.current = true;/);
    expect(switcher).toMatch(/onPointerUp=[\s\S]{0,200}pointerDown\.current = false;/);
    expect(switcher).toMatch(/onPointerCancel=[\s\S]{0,120}pointerDown\.current = false;/);
  });

  it("a press released OFF the track still clears the press flag", () => {
    // Codex P2 (#2787): releasing outside the track fired neither the track's
    // pointerup nor pointercancel, so the flag stuck and Tab stopped moving
    // the window. The window-level listeners always see the release.
    expect(switcher).toMatch(/window\.addEventListener\("pointerup", release, true\);/);
    expect(switcher).toMatch(/window\.addEventListener\("pointercancel", release, true\);/);
    expect(switcher).toMatch(/const release = \(\) => \{\s*pointerDown\.current = false;\s*window\.removeEventListener\("pointerup", release, true\);\s*window\.removeEventListener\("pointercancel", release, true\);/);
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
