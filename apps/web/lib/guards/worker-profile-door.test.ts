import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WORKER_PROFILE_DOOR_HREF, WORKER_PROFILE_DOOR_NEXT } from "@/lib/marketing/worker-profile-door";
import { PUBLIC_INTENTS } from "@/lib/navigation/public-intents";

/**
 * ONE DOOR TO "BUILD YOUR PROFILE / CV" (owner P0 2026-11-15, F2 / F6).
 *
 * A production audit found the button "Susikurti profilį / CV" on
 * /work-opportunities (and the same button on /skills and /professions)
 * opening /worker-intake, titled "Darbuotojo registracija": a form of 15+
 * fields that stores nothing, whose sign-up link carried no `next`, so the
 * person typed everything twice or lost it. Meanwhile /create-cv's CTAs went
 * to sign-up with the profile builder as the return path: two doors for one
 * thing, one of them broken.
 *
 * Now every such button opens the same sign-up, carrying the same builder,
 * before anything is typed; the intake page stays (it stores nothing and
 * says so) and its own sign-up and login links carry the builder too.
 */

const web = process.cwd();
const read = (rel: string) => readFileSync(join(web, rel), "utf8");
const MARKETING = "app/[locale]/(marketing)";

describe("the door", () => {
  it("opens sign-up and returns to the profile builder", () => {
    expect(WORKER_PROFILE_DOOR_NEXT).toBe("/dashboard/profile");
    expect(WORKER_PROFILE_DOOR_HREF).toBe(`/auth/signup?next=${encodeURIComponent("/dashboard/profile")}`);
    expect(existsSync(join(web, "app/[locale]/dashboard/profile/page.tsx")), "the builder is a real page").toBe(true);
  });

  it("is the same path the free-CV page's own CTAs carry (one door, not two)", () => {
    const src = read(`${MARKETING}/create-cv/page.tsx`);
    const m = /const CREATE_CV_NEXT = "([^"]+)";/.exec(src);
    expect(m, "create-cv still names its return path").not.toBeNull();
    expect(m![1]).toBe(WORKER_PROFILE_DOOR_NEXT);
  });
});

describe("every public 'build your profile / CV' button is that door", () => {
  for (const page of ["work-opportunities", "skills", "professions"]) {
    it(`/${page}`, () => {
      const src = read(`${MARKETING}/${page}/page.tsx`);
      expect(src, "no button leads to the intake any more").not.toMatch(/href="\/worker-intake"/);
      expect(src).toMatch(/<TrackedCta\s+href=\{WORKER_PROFILE_DOOR_HREF\}\s+ctaId="[a-z_]+_profile"/);
    });
  }
});

describe("/worker-intake stays, and its account links carry the builder", () => {
  const src = read(`${MARKETING}/worker-intake/page.tsx`);
  it("sign-up and login both return to the profile builder", () => {
    expect(src).toMatch(/relPath=\{`\/\$\{locale\}\$\{WORKER_PROFILE_DOOR_HREF\}`\}/);
    expect(src).toMatch(/relPath=\{`\/\$\{locale\}\/auth\/login\?next=\$\{encodeURIComponent\(WORKER_PROFILE_DOOR_NEXT\)\}`\}/);
    expect(src, "no bare sign-up or login link is left").not.toMatch(/relPath=\{`\/\$\{locale\}\/auth\/(signup|login)`\}/);
  });

  it("its title does not call it a registration: it registers nobody", () => {
    for (const loc of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const title = (JSON.parse(read(`messages/${loc}.json`)) as { workerIntake?: { title?: string } }).workerIntake?.title;
      if (title === undefined) continue; // the catalog falls back for this namespace
      expect(title, loc).not.toMatch(/regist|регистр|rejestr|anmeld/i);
    }
  });
});

describe("the menu's Create CV entry says an account comes first (F1)", () => {
  it("opens the signed-in profile builder, marked as an account destination", () => {
    // It pointed at /create-cv as a no-account page, so the home's goal card
    // promised "no account needed" while that page's only action is sign-up.
    const entry = PUBLIC_INTENTS.find((i) => i.id === "work")?.links.find((l) => l.id === "createCv");
    expect(entry).toEqual({ id: "createCv", href: WORKER_PROFILE_DOOR_NEXT, account: true });
  });
});
