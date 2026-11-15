import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PUBLIC_INTENTS } from "@/lib/navigation/public-intents";

/**
 * THE MENU'S "CREATE A FREE CV" TELLS THE TRUTH ABOUT THE ACCOUNT (owner P0
 * 2026-11-15, F1).
 *
 * The menu and the goal cards marked the entry "no account needed" while
 * `/create-cv`'s only action is sign-up. The entry now goes where that
 * sign-up leads (the profile builder) and is an account link, so it carries
 * the "sign in" note. `/create-cv` itself is unchanged: an advert still opens
 * it, and it stays in the sitemap.
 */

const web = process.cwd();
const CREATE_CV_PAGE = "app/[locale]/(marketing)/create-cv/page.tsx";

describe("Create a free CV in the menu", () => {
  const entry = PUBLIC_INTENTS.flatMap((i) => i.links).find((l) => l.id === "createCv");

  it("is an account link into the profile builder", () => {
    expect(entry).toEqual({ id: "createCv", href: "/dashboard/profile", account: true });
  });

  it("goes where /create-cv's own sign-up goes", () => {
    const m = /const CREATE_CV_NEXT = "([^"]+)";/.exec(readFileSync(join(web, CREATE_CV_PAGE), "utf8"));
    expect(m?.[1]).toBe(entry?.href);
  });

  it("no menu entry marked as needing no account leads to /create-cv", () => {
    for (const l of PUBLIC_INTENTS.flatMap((i) => i.links)) {
      if (!l.account) expect(l.href, l.id).not.toBe("/create-cv");
    }
  });
});
