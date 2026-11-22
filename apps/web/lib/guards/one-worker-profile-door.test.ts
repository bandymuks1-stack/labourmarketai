import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WORKER_PROFILE_DOOR_NEXT } from "@/lib/marketing/worker-profile-door";
import { PUBLIC_INTENTS } from "@/lib/navigation/public-intents";

/**
 * ONE CV / PROFILE DOOR, NO FUNCTION LOST (owner P0 2026-11-15, F6).
 *
 * Every public "create your profile / CV" action ends in the same place, the
 * profile builder (`/dashboard/profile`: upload or paste a CV, or describe the
 * work; review each fact; confirm). The pages stay, each with its own job:
 * `/create-cv` (free CV), `/worker-intake` (a questionnaire kept through
 * sign-up), `/for-workers` and `/work-abroad`. Before this, the last two
 * signed up with no `next` and left the person on a bare dashboard.
 */

const web = process.cwd();
const read = (rel: string) => readFileSync(join(web, rel), "utf8");
const M = "app/[locale]/(marketing)";

describe("every worker profile / CV door ends in the profile builder", () => {
  it("/for-workers: the hero's sign-up returns to the builder", () => {
    expect(read(`${M}/for-workers/page.tsx`)).toContain("ctaNext={WORKER_PROFILE_DOOR_NEXT}");
  });

  it("/work-abroad: 'Create worker profile' returns to the builder", () => {
    const src = read(`${M}/work-abroad/page.tsx`);
    expect(src).toContain("relPath={`/${locale}${WORKER_PROFILE_DOOR_HREF}`}");
    expect(src).not.toContain("relPath={`/${locale}/auth/signup`}");
  });

  it("/worker-intake, /create-cv and the menu already do", () => {
    expect(read(`${M}/worker-intake/page.tsx`)).toContain("WORKER_PROFILE_DOOR_HREF");
    expect(/const CREATE_CV_NEXT = "([^"]+)";/.exec(read(`${M}/create-cv/page.tsx`))?.[1]).toBe(WORKER_PROFILE_DOOR_NEXT);
    const createCv = PUBLIC_INTENTS.flatMap((i) => i.links).find((l) => l.id === "createCv");
    expect(createCv?.href).toBe(WORKER_PROFILE_DOOR_NEXT);
  });

  it("no page was removed", () => {
    for (const page of ["create-cv", "worker-intake", "for-workers", "work-abroad"]) {
      expect(() => read(`${M}/${page}/page.tsx`), page).not.toThrow();
    }
  });
});
