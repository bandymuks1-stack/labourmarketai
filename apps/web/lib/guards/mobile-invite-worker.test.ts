/**
 * GUARD — an organization invites a person to its roster from the phone
 * through the web chat's own `company.invite-worker` (owner order 2026-11-16:
 * one shared client, no parallel backend), prepared and confirmed with the
 * prepare's own input; no company id is sent; the web's own words in every
 * locale. The person accepts under Offers (already on the phone).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv"] as const;

describe("mobile invite a worker", () => {
  const screen = read("apps/mobile/src/screens/invite-worker.tsx");

  it("uses the canonical capability only, confirming with the prepare's own input", () => {
    expect(screen).toContain('name: "company.invite-worker.prepare"');
    expect(screen).toContain('name: "company.invite-worker.confirm"');
    expect(screen).toContain("args: { input: prepared.input, confirmationToken: prepared.confirmationToken },");
    expect(screen).not.toMatch(/supabase\s*\.\s*from\(|companyId/);
  });

  it("is an organization station on Today", () => {
    const today = read("apps/mobile/app/(shell)/today.tsx");
    const start = today.indexOf("{personal ? null : (");
    expect(today.slice(start, today.indexOf("</>", start))).toContain('testID="today-open-invite-worker"');
  });

  it("uses the web chat's own words in every locale", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const c = JSON.parse(read(`apps/web/messages/${locale}.json`)).conversation;
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const block = messages.slice(start, messages.indexOf(locale === "en" ? "\n} as const;" : "\n};", start));
      const pairs: [string, string][] = [
        ["inviteWorker.title", c.actions.company.inviteWorker.label],
        ["inviteWorker.email", c.forms.fields.workerEmail],
        ["inviteWorker.emailPlaceholder", c.forms.fields.workerEmailPlaceholder],
        ["inviteWorker.note", c.forms.fields.inviteNote],
        ["inviteWorker.notePlaceholder", c.forms.fields.inviteNotePlaceholder],
        ["inviteWorker.done", c.chat.agencyInviteCandidateDone],
        ["inviteWorker.exists", c.chat.agencyInviteCandidateExists],
      ];
      for (const [k, v] of pairs) expect(block, `${locale} ${k}`).toContain(`"${k}": ${JSON.stringify(v)}`);
    }
  });
});
