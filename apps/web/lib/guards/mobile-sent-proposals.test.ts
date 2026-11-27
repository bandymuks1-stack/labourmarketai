/**
 * GUARD — a company manages the booking proposals it sent from the phone
 * through the web bookings page's own capabilities (owner order 2026-11-16:
 * one shared client, no parallel backend): `booking.list` (outgoing),
 * `booking.reschedule` and `booking.withdraw`, each prepared and confirmed
 * with the same input; the server's own withdraw-reason vocabulary; the web
 * page's own words in every locale.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { WITHDRAW_REASON_KINDS } from "@/lib/booking/booking-state";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv"] as const;

describe("mobile proposals you sent", () => {
  const screen = read("apps/mobile/src/screens/sent-proposals.tsx");

  it("uses the canonical capabilities only, confirming with the same input plus the token", () => {
    expect(screen).toContain('useCapability<BookingListData>("booking.list", NO_ARGS)');
    expect(screen).toContain("name: `booking.${act.kind}_draft`");
    expect(screen).toContain("name: `booking.${act.kind}_confirm`");
    expect(screen).toContain("args: { ...act.input, confirmationToken: token },");
    expect(screen).not.toMatch(/supabase\s*\.\s*from\(|\.rpc\(/);
  });

  it("offers the server's own withdraw reasons, no more and no fewer", () => {
    const m = screen.match(/WITHDRAW_REASONS = \[([^\]]*)\] as const/);
    expect(m).not.toBeNull();
    const reasons = [...m![1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
    expect(reasons).toEqual([...WITHDRAW_REASON_KINDS]);
  });

  it("is an organization station on Today", () => {
    const today = read("apps/mobile/app/(shell)/today.tsx");
    const start = today.indexOf("{personal ? null : (");
    expect(today.slice(start, today.indexOf("</>", start))).toContain('testID="today-open-sent-proposals"');
  });

  it("uses the web bookings page's own words in every locale", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const b = JSON.parse(read(`apps/web/messages/${locale}.json`)).bookings;
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const block = messages.slice(start, messages.indexOf(locale === "en" ? "\n} as const;" : "\n};", start));
      const pairs: [string, string][] = [
        ["sentProposals.title", b.outgoing.title],
        ["sentProposals.empty", b.outgoing.empty],
        ["sentProposals.withdraw", b.actions.withdraw],
        ["sentProposals.confirmWithdraw", b.reason.confirmWithdraw],
        ["sentProposals.reschedule", b.reschedule.open],
        ["sentProposals.rescheduleAccepted", b.reschedule.openAccepted],
        ["sentProposals.reopenHint", b.reschedule.reopenHint],
        ["sentProposals.reopened", b.reschedule.reopened],
        ...WITHDRAW_REASON_KINDS.map((k): [string, string] => [`sentProposals.reason.${k}`, b.reason.withdraw[k]]),
      ];
      for (const [k, v] of pairs) expect(block, `${locale} ${k}`).toContain(`"${k}": ${JSON.stringify(v)}`);
    }
  });
});
