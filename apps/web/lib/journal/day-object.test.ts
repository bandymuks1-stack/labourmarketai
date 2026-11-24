import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildDayObject, type DayObjectEntryInput } from "./day-object";

const entry = (over: Partial<DayObjectEntryInput> & { id: string }): DayObjectEntryInput => ({
  places: [],
  activity: null,
  minutes: 0,
  verification: "self_reported",
  decisions: [],
  photoCount: 0,
  skills: [],
  ...over,
});

describe("buildDayObject — one day of real work", () => {
  it("an empty day is an empty object, never invented", () => {
    const d = buildDayObject([]);
    expect(d.entryCount).toBe(0);
    expect(d.totalMinutes).toBe(0);
    expect(d.places).toEqual([]);
    expect(d.skills).toEqual([]);
    expect(d.confirmedMinutes).toBe(0);
  });

  it("sums the canonical minutes and says which entries have none", () => {
    const d = buildDayObject([
      entry({ id: "a", minutes: 240 }),
      entry({ id: "b", minutes: 90 }),
      entry({ id: "c", minutes: 0 }),
    ]);
    expect(d.totalMinutes).toBe(330);
    expect(d.untimedCount).toBe(1);
  });

  it("places and activities are distinct, in first-seen order", () => {
    const d = buildDayObject([
      entry({ id: "a", places: ["Org", "Site 1"], activity: "Tiling" }),
      entry({ id: "b", places: ["Org", "Site 2"], activity: "Tiling" }),
    ]);
    expect(d.places).toEqual(["Org", "Site 1", "Site 2"]);
    expect(d.activities).toEqual(["Tiling"]);
  });

  it("only someone else's confirmation is proof; a self-confirmation is counted apart", () => {
    const d = buildDayObject([
      entry({
        id: "a",
        minutes: 120,
        verification: "verified",
        decisions: [{ result: "approved", role: "manager", at: "2026-09-29T10:00:00Z", automatic: false }],
      }),
      entry({ id: "b", minutes: 60, verification: "self_confirmed" }),
      entry({ id: "c", minutes: 30, verification: "verification_pending" }),
      entry({ id: "d", minutes: 30, verification: "disputed" }),
    ]);
    expect(d.confirmedCount).toBe(1);
    expect(d.selfConfirmedCount).toBe(1);
    expect(d.waitingCount).toBe(1);
    expect(d.contestedCount).toBe(1);
    expect(d.confirmedMinutes).toBe(120);
    expect(d.confirmations).toEqual([
      { role: "manager", at: "2026-09-29T10:00:00Z", automatic: false },
    ]);
  });

  it("a rejected or returned decision is not listed as a confirmation", () => {
    const d = buildDayObject([
      entry({
        id: "a",
        verification: "returned",
        decisions: [{ result: "changes_requested", role: "manager", at: null, automatic: false }],
      }),
    ]);
    expect(d.confirmations).toEqual([]);
  });

  it("a skill is confirmed for the day when any entry carrying it is", () => {
    const d = buildDayObject([
      entry({ id: "a", skills: [{ id: "s1", name: "Tiling", confirmed: false }] }),
      entry({
        id: "b",
        skills: [
          { id: "s1", name: "Tiling", confirmed: true },
          { id: "s2", name: "Grouting", confirmed: false },
        ],
      }),
    ]);
    expect(d.skills).toEqual([
      { id: "s1", name: "Tiling", confirmed: true },
      { id: "s2", name: "Grouting", confirmed: false },
    ]);
  });

  it("photos are counted from real uploads only", () => {
    const d = buildDayObject([
      entry({ id: "a", photoCount: 3 }),
      entry({ id: "b", photoCount: 0 }),
    ]);
    expect(d.photoCount).toBe(3);
  });
});

describe("the day object surface stays honest", () => {
  const root = join(__dirname, "..", "..");
  const surface = [
    readFileSync(join(root, "components/app/journal/journal-day-object.tsx"), "utf8"),
    readFileSync(join(root, "lib/journal/day-object.ts"), "utf8"),
    readFileSync(join(root, "lib/journal/day-photo-previews.ts"), "utf8"),
  ].join("\n");

  it("uses no generated imagery and no service-role client", () => {
    expect(surface).not.toMatch(/gemini|stock photo|placeholder-photo|createAdminClient|service_role|generateImage/i);
  });

  it("reads photos under the viewer's own session on the private bucket", () => {
    const reader = readFileSync(join(root, "lib/journal/day-photo-previews.ts"), "utf8");
    expect(reader).toMatch(/createClient\(\)/);
    expect(reader).toMatch(/journal-entry-photos/);
    expect(reader).not.toMatch(/getPublicUrl/);
  });

  it("a self-confirmation is never drawn in the confirmation green", () => {
    const view = readFileSync(join(root, "components/app/journal/journal-day-object.tsx"), "utf8");
    expect(view).toMatch(/state="SELF_ATTESTED"/);
    expect(view).toMatch(/state="ORGANIZATION_ATTESTED"/);
  });
});

describe("the day photo viewer", () => {
  const root = join(__dirname, "..", "..");
  const viewer = readFileSync(join(root, "components/app/journal/journal-photo-viewer.tsx"), "utf8");
  const view = readFileSync(join(root, "components/app/journal/journal-day-object.tsx"), "utf8");

  it("opens only the already-signed private URLs — it fetches, signs and stores nothing", () => {
    expect(viewer).not.toMatch(/createClient|createSignedUrl|supabase|fetch\(|getPublicUrl|service_role/);
    expect(view).toMatch(/<JournalPhotoViewer/);
  });

  it("is a real modal: shared focus contract, explicit close, Escape via the hook", () => {
    expect(viewer).toMatch(/useDialogFocus\(/);
    expect(viewer).toMatch(/role="dialog"/);
    expect(viewer).toMatch(/aria-modal="true"/);
    expect(viewer).toMatch(/journal-photo-viewer-close/);
  });

  it("the image always fits the viewport and labels cross the boundary as strings", () => {
    expect(viewer).toMatch(/max-h-\[78dvh\]/);
    expect(viewer).toMatch(/max-w-full/);
    expect(viewer).toMatch(/counterTemplate: string/);
  });
});
