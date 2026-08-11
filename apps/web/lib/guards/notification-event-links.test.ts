import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  NOTIFICATION_ENTITY_HREF,
  notificationEventHref,
} from "@/lib/notifications/events";

/**
 * A STORED NOTIFICATION MUST BE REACHABLE, AND STILL CLEARABLE.
 *
 * The durable notification store (#1116, owner-gated) merged its rows into the
 * bell with NO destination at all: a worker was told "your absence was
 * rejected" and had nowhere to click. That was not laziness — the panel used
 * `!href` as its proxy for "this row has a persisted read state", so giving a
 * durable row a link silently removed the mark-all-read control. One field was
 * carrying two meanings.
 *
 * They are separate now: `durable` says HOW a row clears, `href` says WHERE it
 * goes. This guard pins both halves, because regressing either one is silent —
 * a bad href 404s a person who is already having a bad day, and a durable row
 * that stops being marked `durable` loses mark-all-read without any error.
 */

const APP_ROOT = join(__dirname, "..", "..");

/** Same route-existence technique the spine guard uses: a dashboard route is
 *  real only if its page file is on disk. */
function routeExists(href: string): boolean {
  const rel = href.replace(/^\//, "");
  for (const ext of ["tsx", "ts"]) {
    if (existsSync(join(APP_ROOT, "app", "[locale]", rel, `page.${ext}`)))
      return true;
  }
  return false;
}

describe("every stored event points at a real surface", () => {
  it("each entity type maps to a dashboard route that exists on disk", () => {
    const missing = Object.entries(NOTIFICATION_ENTITY_HREF).filter(
      ([, href]) => !routeExists(href),
    );
    expect(
      missing,
      `these notification targets do not exist as routes: ${missing
        .map(([k, v]) => `${k} -> ${v}`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("covers every entity type the write model can emit — no silent gap", () => {
    // Derived from the union in events.ts rather than retyped, so adding a
    // fourth entity type without a destination fails HERE instead of shipping
    // a notification that goes nowhere.
    const src = readFileSync(
      join(APP_ROOT, "lib", "notifications", "events.ts"),
      "utf8",
    );
    const union = src.match(
      /export type NotificationEntityType =([\s\S]*?);/,
    )?.[1];
    expect(union, "NotificationEntityType union not found").toBeTruthy();
    const declared = [...union!.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    expect(
      declared.filter((t) => !notificationEventHref(t)),
      "entity types with no destination",
    ).toEqual([]);
  });

  it("an unknown entity type yields no link rather than a broken one", () => {
    expect(notificationEventHref("not_a_real_entity")).toBeUndefined();
  });
});

describe("mark-all-read is keyed off durability, not off a missing link", () => {
  it("the panel tests `durable`, never `!href`", () => {
    const panel = readFileSync(
      join(APP_ROOT, "components", "app", "notification-panel.tsx"),
      "utf8",
    );
    // The exact regression this replaced: `notifications.some((n) => !n.href)`.
    // If it comes back, durable rows must again choose between being readable
    // and being reachable.
    expect(
      panel,
      "mark-all-read must not infer 'stored' from a missing href",
    ).not.toMatch(/some\(\s*\(\s*n\s*\)\s*=>\s*!\s*n\.href\s*\)/);
    expect(panel).toMatch(/some\(\s*\(\s*n\s*\)\s*=>\s*n\.durable\s*\)/);
  });

  it("durable rows are actually flagged where they are built", () => {
    const stream = readFileSync(
      join(APP_ROOT, "components", "app", "spine-stream.tsx"),
      "utf8",
    );
    expect(stream, "durable rows must carry durable: true").toMatch(
      /durable:\s*true/,
    );
    expect(stream, "durable rows must carry their href").toMatch(/href:\s*d\.href/);
  });
});
