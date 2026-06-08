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
  it("LT bell + messages are framed as the person's own messages", () => {
    expect(notif(lt).label).toMatch(/mano pranešim/i);
    expect(comm(lt).title).toMatch(/pranešim/i);
    expect(comm(lt).subtitle).toMatch(/svarbu/i);
  });
  it("EN bell + messages mirror the framing", () => {
    expect(notif(en).label).toMatch(/notification/i);
    expect(comm(en).title).toMatch(/message/i);
    expect(comm(en).subtitle).toMatch(/matters now/i);
  });
});

describe("empty states are calm and reassuring (not a scary failure)", () => {
  it("LT empty states reassure + point forward", () => {
    expect(notif(lt).emptyTitle).toMatch(/nieko nereikia/i);
    expect(notif(lt).emptyBody).toMatch(/matysite tai čia/i);
    expect(comm(lt).empty).toMatch(/matysite tai čia/i);
  });
  it("EN empty states reassure + point forward", () => {
    expect(notif(en).emptyTitle).toMatch(/nothing needs your attention/i);
    expect(notif(en).emptyBody).toMatch(/you'll see it here/i);
    expect(comm(en).empty).toMatch(/you'll see it here/i);
  });
});

describe("no fake urgency / matches / employer interest / 'viewed you'", () => {
  for (const [name, j] of [["lt", lt], ["en", en]] as const) {
    it(`${name}: notifications + messages copy invents no fake signal`, () => {
      const blob = [
        JSON.stringify(notif(j)),
        comm(j).title,
        comm(j).subtitle,
        comm(j).v1Notice,
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
  it("the honest note is a muted line, not a warning banner", () => {
    expect(page).toMatch(/data-testid="communication-honest-note"/);
    expect(page).not.toMatch(/bg-state-warning/);
  });
  it("the messages list route still renders (reachable)", () => {
    expect(page).toMatch(/CommunicationListPage/);
    expect(page).toMatch(/conversations/);
  });
});
