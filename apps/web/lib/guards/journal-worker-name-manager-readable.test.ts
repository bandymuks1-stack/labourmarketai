import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NO_READABLE_NAME,
  WORKER_NAME_FIELDS,
  resolveWorkerName,
} from "@/lib/journal/worker-name";

/**
 * A MANAGER MUST BE ABLE TO SEE WHO THEY ARE CONFIRMING.
 *
 * Every manager-facing journal surface used to read the worker's name from
 * `workers(profiles(full_name, email))`. `profiles` RLS is
 * `(id = auth.uid()) OR is_admin()` — in production and locally — so that
 * embed is `null` for anyone reviewing somebody else's entry, and the name
 * degraded to `"—"`. Measured: `/dashboard/inbox/quick` showed `—` on 14 of
 * 14 cards while the row really held `Dev Worker`.
 *
 * `workers.display_name` is readable by the same manager, because `workers`
 * RLS is `can_view_worker(id)` and that already returns TRUE for them. This
 * guard pins BOTH halves: the surfaces must ask for the readable column, and
 * the resolver must prefer it.
 *
 * Not a grep for a happy word — each assertion has a negative control, because
 * a guard that cannot fail is worse than no guard (#1319).
 */
const WEB = join(__dirname, "..", "..");

const SURFACES = [
  "lib/journal/review-queue.ts",
  "lib/journal/review-report.ts",
  "lib/journal/journal-window-report.ts",
  "app/[locale]/dashboard/inbox/page.tsx",
] as const;

const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

describe("journal surfaces name the worker from a column the manager may read", () => {
  it.each(SURFACES)("%s selects the shared worker-name fields", (rel) => {
    const src = read(rel);
    expect(
      src,
      `${rel} must embed the shared WORKER_NAME_FIELDS, not a hand-written profiles-only embed`,
    ).toMatch(/workers(!inner)?\(\$\{WORKER_NAME_FIELDS\}\)/);
  });

  it.each(SURFACES)(
    "%s no longer reads the name from a profiles-only embed",
    (rel) => {
      const src = read(rel);
      // The exact shape that produced "—" for every manager.
      expect(
        src,
        `${rel} still embeds workers(profiles(...)) without display_name — the manager cannot read that`,
      ).not.toMatch(/workers(!inner)?\(profiles\(/);
    },
  );

  it("the employer's confirm-work roster names people from `workers`, never from a profiles embed or a raw id", () => {
    // Production walk 2026-09-05 (`169df06f`, defect D2): the manager saw
    // "Darbų peržiūra dar neįjungta: #8cda64" — a profile-id fragment — because
    // `engagement_contexts … profiles(full_name, email)` is null under
    // `profiles` RLS. The read must go through the manager-readable column.
    const src = read("lib/company/org-employee-engagements.ts");
    expect(src, "must select the shared WORKER_NAME_FIELDS from `workers`").toMatch(
      /from\("workers"\)[\s\S]{0,120}select\(`profile_id, \$\{WORKER_NAME_FIELDS\}`\)/,
    );
    expect(src, "must resolve through resolveWorkerName").toMatch(/resolveWorkerName\(/);
    // Negative controls — the exact shapes that produced the id fragment.
    expect(src, "no profiles(...) embed on engagement_contexts").not.toMatch(/journal_review_enabled, profiles\(/);
    expect(src, "no raw id fallback").not.toMatch(/#\$\{[^}]*slice\(/);
    expect(src, "no hand-rolled email fallback").not.toMatch(/email\?\.split\("@"\)\[0\]/);
  });

  it("the shared embed actually asks for display_name", () => {
    // Negative control for the two assertions above: if WORKER_NAME_FIELDS
    // stopped naming display_name they would both still pass while every
    // surface went back to showing a dash.
    expect(WORKER_NAME_FIELDS).toMatch(/\bdisplay_name\b/);
    expect(WORKER_NAME_FIELDS).toMatch(/profiles\(full_name, email\)/);
  });

  it("no journal surface keeps its own copy of the dash fallback", () => {
    for (const rel of SURFACES) {
      const src = read(rel);
      expect(
        src,
        `${rel} must call resolveWorkerName rather than re-deriving the name`,
      ).not.toMatch(/email\.split\("@"\)\[0\]/);
    }
  });
});

describe("resolveWorkerName prefers what the caller can actually read", () => {
  const profiles = { full_name: "Full Name", email: "someone@example.test" };

  it("uses display_name when present", () => {
    expect(resolveWorkerName({ display_name: "Dev Worker", profiles })).toBe(
      "Dev Worker",
    );
  });

  it("falls back to the profile full name — the worker's own rows", () => {
    expect(resolveWorkerName({ display_name: null, profiles })).toBe("Full Name");
  });

  it("falls back to the email local part", () => {
    expect(
      resolveWorkerName({
        display_name: null,
        profiles: { full_name: null, email: "someone@example.test" },
      }),
    ).toBe("someone");
  });

  it("returns the dash only when NOTHING is readable — the manager's old case", () => {
    // This is exactly what every manager saw: workers readable, profiles not.
    expect(resolveWorkerName({ display_name: null, profiles: null })).toBe(
      NO_READABLE_NAME,
    );
    expect(resolveWorkerName(null)).toBe(NO_READABLE_NAME);
  });

  it("treats a blank display_name as absence, not as a name", () => {
    // A "" or "   " display_name would otherwise render as an empty card
    // header, which reads as a broken page rather than a missing name.
    expect(resolveWorkerName({ display_name: "   ", profiles })).toBe("Full Name");
    expect(resolveWorkerName({ display_name: "", profiles })).toBe("Full Name");
  });

  it("trims a padded display_name", () => {
    expect(resolveWorkerName({ display_name: "  Dev Worker  ", profiles })).toBe(
      "Dev Worker",
    );
  });
});
