import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Worker notifications/messages framing guard (slice notifications-what-matters-v1,
 * PR F).
 *
 * The worker-facing notifications + messages surface must read as a calm
 * "Mano pranešimai / Kas dabar svarbu" layer — what needs attention, why, one
 * action — not an admin inbox. No fake urgency / matches / employer interest /
 * "someone viewed you". Empty states must be calm and reassuring.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));

const notif = (j: Record<string, unknown>) =>
  ((j.auth as { notifications: Record<string, string> }).notifications);
const comm = (j: Record<string, unknown>) =>
  j.communication as Record<string, string>;

describe("notifications/messages use 'Mano pranešimai / Kas dabar svarbu' framing", () => {
  it("LT bell is framed as the person's own notifications", () => {
    expect(notif(lt).label).toMatch(/mano pranešim/i);
  });
  it("EN bell mirrors the framing", () => {
    expect(notif(en).label).toMatch(/notification/i);
  });
  // ONE SURFACE, ONE NAME (owner walk 2026-09-28): the page is called what
  // the nav calls it — "Žinutės" — not a second name for the same place.
  for (const [name, j] of [["lt", lt], ["en", en]] as const) {
    it(`${name}: the messages page carries the nav's own name`, () => {
      const tabs = (j.auth as { dashboard: { tabs: Record<string, string> } }).dashboard.tabs;
      expect(comm(j).title).toBe(tabs.communication);
    });
  }
});

describe("empty states are calm and reassuring (not a scary failure)", () => {
  it("LT empty states reassure + point forward", () => {
    expect(notif(lt).emptyTitle).toMatch(/nieko nereikia/i);
    expect(notif(lt).emptyBody).toMatch(/matysite tai čia/i);
    // The messages empty state is one calm sentence INSIDE the workspace
    // (owner walk 2026-09-28) — no explanation of what will appear where.
    expect(comm(lt).empty).toMatch(/nėra/i);
    expect(comm(lt).empty.split(/[.!?]\s/).length).toBe(1);
  });
  it("EN empty states reassure + point forward", () => {
    expect(notif(en).emptyTitle).toMatch(/nothing needs your attention/i);
    expect(notif(en).emptyBody).toMatch(/you'll see it here/i);
    expect(comm(en).empty).toMatch(/no messages yet/i);
    expect(comm(en).empty.split(/[.!?]\s/).length).toBe(1);
  });
});

describe("no fake urgency / matches / employer interest / 'viewed you'", () => {
  for (const [name, j] of [["lt", lt], ["en", en]] as const) {
    it(`${name}: notifications + messages copy invents no fake signal`, () => {
      const blob = [
        JSON.stringify(notif(j)),
        comm(j).title,
        comm(j).empty,
        comm(j).footnote,
      ].join(" • ");
      expect(blob).not.toMatch(
        /someone viewed|viewed you|peržiūrėjo jūs|darbdavys domisi|employer is interested|\bmatch(ed|es|ing)\b|atitikmen|fake deadline|terminas baigiasi/i,
      );
      // no admin-inbox / module / pipeline wording
      expect(blob).not.toMatch(
        /inbox module|communication module|task queue|system notification|status pipeline|užduočių eilė/i,
      );
    });
  }
});

describe("the messages page reads calm, not an alert; routes stay reachable", () => {
  const page = read("app/[locale]/dashboard/communication/page.tsx");
  it("no warning banners and no refresh-mechanism explainer on the inbox", () => {
    // The old v1Notice ("messages update on reload…") explained the refresh
    // mechanism to the user — removed by the inbox contract; the surface now
    // refreshes itself on focus instead of explaining itself.
    expect(page).not.toMatch(/v1Notice/);
    expect(page).toMatch(/RefreshOnFocus/);
    expect(page).not.toMatch(/bg-state-warning/);
  });
  it("the messages list route still renders (reachable)", () => {
    expect(page).toMatch(/CommunicationListPage/);
    expect(page).toMatch(/conversations/);
  });
});
