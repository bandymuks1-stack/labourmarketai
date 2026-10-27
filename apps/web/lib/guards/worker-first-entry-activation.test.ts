import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import { deriveTodayNext } from "@/lib/today/today-model";
import { deriveWorkCardState, WHY_EVIDENCE_FIRST } from "@/lib/worker/work-card-state";

/**
 * A NEW WORKER RECORDS A FIRST WORK ENTRY, SEES IT IN THE LIVING CV, AND IS
 * ASKED BACK — activation audit 2026-10-26, fixes #4, #5 and the journal part
 * of #7. Each block pins one change; the render proof for #4 lives in
 * `lib/home/home-regions-render.test.ts`.
 *
 *   #4  the home's ONE gold action leads to the first journal entry, the
 *       profession kept as a quiet secondary (never mandatory, never hidden);
 *   #5  the first worklog button says "Toliau / Continue" (it saves nothing:
 *       `important_write` consent gate) and only the confirm button says
 *       "Save"; the confirmation links the Living CV and asks back, calmly,
 *       without claiming the entry is confirmed;
 *   #7  the empty journal points UP to the recorder, has ONE primary button,
 *       journal-page saves are labelled "journal", and `journal_viewed` fires
 *       on the journal page only.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
type Json = Record<string, unknown>;
const mono = (loc: string) => JSON.parse(read(`messages/${loc}.json`)) as Json;
const journal = (loc: string) => JSON.parse(read(`messages/${loc}/journal.json`)) as Json;
const at = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o as Json | undefined)?.[k], obj);

const FLOW = read("components/app/conversation/worker-worklog-flow.tsx");
const LABELS = read("components/app/conversation/chat/labels.ts");
const QUICK = read("app/[locale]/dashboard/journal/quick-record.tsx");
const JOURNAL_PAGE = read("app/[locale]/dashboard/journal/page.tsx");
const NUMBERS_PAGE = read("app/[locale]/dashboard/work-in-numbers/page.tsx");

const ONBOARDED = {
  hasProfession: true,
  skillsCount: 0,
  availabilitySet: false,
  locationSet: false,
  paySet: false,
  evidenceCount: 0,
  confirmedAtMs: null,
} as const;

describe("#4 — the first work entry is the new worker's one next action", () => {
  it("the engine leads with the journal and keeps the profession as the secondary", () => {
    const next = deriveTodayNext(deriveWorkCardState(ONBOARDED, 0));
    expect(next).toMatchObject({
      kind: "action",
      dim: "evidence",
      href: "/dashboard/journal",
      whyKey: WHY_EVIDENCE_FIRST,
      secondary: { dim: "work", href: "/dashboard/profile#profile-edit" },
    });
  });

  it("a profession is never required to move on: one entry and the order resumes", () => {
    const card = deriveWorkCardState({ ...ONBOARDED, hasProfession: false, evidenceCount: 1 }, 0);
    expect(card.next.dim).toBe("work");
    expect(card.secondary).toBeNull();
  });

  it("the first-entry line exists in every active locale and never says 'later'", () => {
    const LATER = /later|vėliau|позже|later|später|później/i;
    for (const loc of activeLocales) {
      const line = at(mono(loc), "auth.dashboard.workCard.why.evidenceFirst");
      expect(typeof line === "string" && line.trim().length > 0, `${loc} why.evidenceFirst`).toBe(true);
      expect(line as string, loc).not.toMatch(LATER);
      expect(line as string, loc).not.toMatch(/\bdemo\b|verified|patvirtint|garantuo|guarantee/i);
    }
    // LT speaks to the person informally ("tu"), as the rest of the card does.
    const lt = at(mono("lt"), "auth.dashboard.workCard.why.evidenceFirst") as string;
    expect(lt).toMatch(/\btavo\b|\bdirbai\b/);
    expect(lt).not.toMatch(/\bjūs|\bjūsų/i);
  });
});

describe("#5 — one honest 'Save', then the Living CV and a calm way back", () => {
  it("the FIRST button says Continue; only the confirm step's button says Save", () => {
    const first = FLOW.match(/testId="worklog-save"[\s\S]*?<\/ChatAction>/)?.[0] ?? "";
    expect(first).toContain("{labels.continue}");
    expect(first).not.toContain("labels.save");
    const confirm = FLOW.match(/testId="worklog-confirm"[\s\S]*?<\/ChatAction>/)?.[0] ?? "";
    expect(confirm).toMatch(/labels\.working : labels\.save/);
    // The consent gate itself is untouched: the first press only prepares a
    // token, the confirm press spends it.
    expect(FLOW).toMatch(/prepareConfirmationAction\("worker\.log-work"/);
    expect(FLOW).toMatch(/confirmationToken: token/);
  });

  it("the confirmation links the Living CV and carries the come-back line", () => {
    const done = FLOW.slice(FLOW.indexOf('data-testid="worklog-done"'), FLOW.indexOf("const confirming ="));
    expect(done).toMatch(/href="\/cv"[\s\S]{0,400}data-testid="worklog-living-cv-link"/);
    expect(done).toContain('data-testid="worklog-living-cv-note"');
    expect(done).toContain('data-testid="worklog-come-back"');
    // Shown after EVERY save — not gated on skills or the pipeline outcome.
    const note = done.slice(done.indexOf("worklog-living-cv-note") - 200, done.indexOf("worklog-living-cv-note"));
    expect(note).not.toMatch(/&&\s*\(\s*$/);
  });

  it("the new label keys are resolved for every surface that mounts the flow", () => {
    for (const k of ["continue", "livingCvNote", "viewLivingCv", "comeBackNote"]) {
      expect(LABELS, k).toContain(`"${k}",`);
      expect(FLOW, k).toMatch(new RegExp(`\\b${k}: string;`));
    }
  });

  it("copy in every active locale: Continue ≠ Save, recorded ≠ confirmed, no streak / score / demo", () => {
    const NOT_CONFIRMED: Record<string, RegExp> = {
      lt: /nepatvirtint/,
      en: /not yet confirmed/,
      ru: /не подтвержден|никем не подтвержден/,
      nl: /nog door niemand bevestigd/,
      de: /noch von niemandem bestätigt/,
      pl: /niepotwierdzon/,
    };
    for (const loc of activeLocales) {
      const w = at(mono(loc), "conversation.worklog") as Record<string, string>;
      for (const k of ["continue", "livingCvNote", "viewLivingCv", "comeBackNote"]) {
        expect(w[k]?.trim(), `${loc} conversation.worklog.${k}`).toBeTruthy();
      }
      expect(w.continue, `${loc}: the first button must not read as a save`).not.toBe(w.save);
      expect(w.livingCvNote, `${loc}: says it is NOT confirmed`).toMatch(NOT_CONFIRMED[loc]!);
      const all = `${w.livingCvNote} ${w.comeBackNote} ${w.viewLivingCv}`;
      expect(all, loc).not.toMatch(/\bverified\b|patikrint|verifiz|zweryfikow|проверен/i);
      expect(all, loc).not.toMatch(/streak|\bXP\b|level[- ]?up|points|taškai|балл|punkty|\bdemo\b/i);
    }
    expect((at(mono("lt"), "conversation.worklog") as Record<string, string>).continue).toBe("Toliau");
  });
});

describe("#7 — the empty journal and the journal funnel", () => {
  it("the empty list points UP to the recorder (it sits above the list), in every active locale", () => {
    const BELOW: Record<string, RegExp> = {
      lt: /žemiau|apačioje/i,
      en: /\bbelow\b/i,
      ru: /ниже/i,
      nl: /hieronder/i,
      de: /\bunten\b/i,
      pl: /poniżej/i,
    };
    const ABOVE: Record<string, RegExp> = {
      lt: /viršuje/i,
      en: /\babove\b/i,
      ru: /выше/i,
      nl: /hierboven/i,
      de: /\boben\b/i,
      pl: /powyżej/i,
    };
    for (const loc of activeLocales) {
      const next = journal(loc).listEmptyNext as string;
      expect(next, loc).not.toMatch(BELOW[loc]!);
      expect(next, loc).toMatch(ABOVE[loc]!);
    }
    // …and the recorder really is above the list on the page.
    expect(JOURNAL_PAGE).toMatch(/<div id="journal-composer" className="order-1">/);
  });

  it("ONE primary on the empty journal: the door that leaves the page is secondary", () => {
    expect(JOURNAL_PAGE).toMatch(
      /cta=\{\{\s*label:\s*t\("listEmptyCta"\),\s*href:\s*"\/dashboard\?intent=log-work",\s*variant:\s*"secondary"\s*\}\}/,
    );
  });

  it("journal-page saves are labelled 'journal', chat saves 'conversation'", () => {
    expect(QUICK).toMatch(/<WorkerWorkLogFlow[\s\S]*?surface="journal"[\s\S]*?\/>/);
    expect(FLOW).toMatch(/surface = "conversation",/);
    const saved = FLOW.match(/trackFunnel\(FUNNEL_EVENTS\.journalEntrySaved, \{[\s\S]*?\}\);/)?.[0] ?? "";
    expect(saved).toMatch(/\bsurface,/);
    expect(saved).not.toContain('surface: "conversation"');
    // The recorder is the journal funnel's "started" step too.
    expect(QUICK).toMatch(/trackFunnel\(FUNNEL_EVENTS\.journalEntryStarted, \{ surface: "journal" \}\)/);
  });

  it("journal_viewed is emitted by the journal page only — never by work-in-numbers", () => {
    expect(JOURNAL_PAGE).toContain("FUNNEL_EVENTS.journalViewed");
    expect(NUMBERS_PAGE).not.toContain("journalViewed");
    // Sweep every page and component: nothing else may emit it.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(WEB, dir))) {
        const rel = `${dir}/${name}`;
        if (name === "node_modules" || name.startsWith(".")) continue;
        if (statSync(join(WEB, rel)).isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          if (read(rel).includes("FUNNEL_EVENTS.journalViewed")) offenders.push(rel);
        }
      }
    };
    walk("app");
    walk("components");
    expect(offenders).toEqual(["app/[locale]/dashboard/journal/page.tsx"]);
  });
});
