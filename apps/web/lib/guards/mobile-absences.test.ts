/**
 * GUARD — leave & absence from the phone through the web page's own
 * capabilities (owner order 2026-11-16: one shared client, no parallel
 * backend): a worker requests or cancels time off for their own worker
 * record; a manager approves or rejects. Prepared first, confirmed with the
 * same input; the web's own words in every locale.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ABSENCE_STATUSES, ABSENCE_TYPES } from "@/lib/leave/absences-model";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv"] as const;

describe("mobile leave & absence", () => {
  const screen = read("apps/mobile/src/screens/absences.tsx");

  it("reads and writes through the canonical capabilities only", () => {
    expect(screen).toContain('useCapability<MyAbsencesData>("absence.mine.list", NO_ARGS)');
    expect(screen).toContain('useCapability<ManagerAbsencesData>("absence.pending_review.list", NO_ARGS)');
    expect(screen).toContain('request: "absence.request"');
    expect(screen).toContain('cancel: "absence.cancel"');
    expect(screen).toContain('review: "absence.review"');
    expect(screen).toContain("name: `${CAPABILITY[act.kind]}_draft`");
    expect(screen).toContain("name: `${CAPABILITY[act.kind]}_confirm`");
    expect(screen).not.toMatch(/supabase\s*\.\s*from\(/);
  });

  it("confirms with the prepare's own input plus its token", () => {
    expect(screen).toContain("args: act.input,");
    expect(screen).toContain("args: { ...act.input, confirmationToken: token },");
  });

  it("offers exactly the web's absence types and knows every status", () => {
    const m = screen.match(/export const ABSENCE_TYPES: readonly AbsenceType\[\] = \[([^\]]+)\]/);
    expect([...(m?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1])).toEqual([...ABSENCE_TYPES]);
    const shapes = read("apps/mobile/src/capability-shapes.ts");
    const s = shapes.match(/export type AbsenceStatus = ([^;]+);/);
    expect([...(s?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1]).sort()).toEqual([...ABSENCE_STATUSES].sort());
  });

  it("shows the manager's review list only in an organization workspace", () => {
    expect(screen).toContain('useCapability<ContextListData>("context.list", NO_ARGS)');
    expect(screen).toMatch(/\{organization \? \(/);
    expect(read("apps/mobile/app/(shell)/today.tsx")).toContain('testID="today-open-absences"');
  });

  it("uses the web page's own words in every locale", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const a = JSON.parse(read(`apps/web/messages/${locale}.json`)).absences;
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const block = messages.slice(start, messages.indexOf(locale === "en" ? "\n} as const;" : "\n};", start));
      const pairs: [string, string][] = [
        ["absences.title", a.pageTitle],
        ["absences.myTitle", a.myTitle],
        ["absences.myEmpty", a.myEmpty],
        ["absences.noWorker", a.noWorker],
        ["absences.requestHeading", a.requestHeading],
        ["absences.requestButton", a.requestButton],
        ["absences.managerTitle", a.managerTitle],
        ["absences.managerEmpty", a.managerEmpty],
        ["absences.approve", a.approve],
        ["absences.reject", a.reject],
        ["absences.outcomeRequested", a.outcome.requested],
        ["absences.outcomeApproved", a.outcome.approved],
        ...ABSENCE_TYPES.map((t): [string, string] => [`absences.type.${t}`, a.types[t]]),
        ...ABSENCE_STATUSES.map((s): [string, string] => [`absences.status.${s}`, a.statuses[s]]),
      ];
      for (const [k, v] of pairs) expect(block, `${locale} ${k}`).toContain(`"${k}": ${JSON.stringify(v)}`);
    }
  });
});
