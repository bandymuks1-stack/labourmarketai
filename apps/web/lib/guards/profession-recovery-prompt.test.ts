import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * The recovery prompt for workers onboarding never asked.
 *
 * Onboarding began asking what work a person does on 2026-08-21. Everyone who
 * signed up before that is past the only screen that asks — 25 of 29 onboarded
 * workers held no profession when this shipped — so their board cannot be
 * directed at their trade. This guard pins the four properties that make the
 * prompt an honest invitation rather than a nag or a guess.
 *
 * CRLF-normalised at the read: a Windows checkout materialises these sources
 * with carriage returns (no `.gitattributes`), which makes multi-line literals
 * unmatchable and produces a guard that passes on CI and fails on every
 * Windows machine. Same idiom as financial-ops.test.ts.
 */
const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r/g, "");

const PROMPT = read(join(web, "components", "app", "profession-recovery-prompt.tsx"));
const BOARD = read(
  join(web, "app", "[locale]", "dashboard", "opportunities", "page.tsx"),
);
const MESSAGES = join(web, "messages");

const LOCALES = readdirSync(MESSAGES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

describe("profession recovery prompt — an invitation, never a guess", () => {
  it("renders only when the worker genuinely has no work type", () => {
    // The gate is the ALREADY-loaded readiness flag, so the prompt costs no
    // extra query. If this ever becomes a fetch of its own, that is a
    // regression worth failing for.
    expect(BOARD).toMatch(
      /result\.kind === "ready" && !result\.readiness\.hasWorkType/,
    );
    expect(BOARD).toContain("<ProfessionRecoveryPrompt");
  });

  it("sends the worker to the CANONICAL profile editor, not a second one", () => {
    // The write surface stays worker-trade-profile on /dashboard/profile.
    expect(PROMPT).toMatch(/href="\/dashboard\/profile/);
    // No profession registry, no select, no write path inside the banner.
    expect(PROMPT).not.toMatch(/<select/);
    expect(PROMPT).not.toMatch(/PROFESSION_SLUGS|worker_professions|\.rpc\(/);
  });

  it("never infers a profession and never writes one", () => {
    // Assert on CODE, not prose: the component's own header explains that it
    // infers nothing, and an earlier revision of this guard matched that
    // sentence and failed the file for documenting the very property it was
    // checking. Strip comments first.
    const code = PROMPT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // No write path of any kind — a dismissal is not an answer.
    expect(code).not.toMatch(/complete_onboarding|\.rpc\(|\.insert\(|\.update\(/);
    // No source a trade could be guessed from.
    expect(code).not.toMatch(/journal|cv|nationality|employer|country/i);
  });

  it("is dismissible WITHOUT a database — device-local, no PII", () => {
    expect(PROMPT).toContain("localStorage");
    // One key holding a flag. Never an id, never profile data.
    expect(PROMPT).toMatch(/lm\.professionRecoveryPrompt\.v1\.dismissed/);
    expect(PROMPT).not.toMatch(/profile_id|worker_id|email/);
  });

  it("dismissal cannot outlive the answer", () => {
    // The parent stops rendering it the moment a profession exists, so a
    // stale dismissal flag can never suppress a prompt that should be gone —
    // and can never keep showing one that should be.
    expect(BOARD).toMatch(/!result\.readiness\.hasWorkType/);
  });

  it("measures the funnel with bounded names and NO metadata", () => {
    for (const e of [
      FUNNEL_EVENTS.professionRecoveryPromptSeen,
      FUNNEL_EVENTS.professionRecoveryPromptOpened,
      FUNNEL_EVENTS.professionRecoveryPromptDismissed,
    ]) {
      expect(typeof e).toBe("string");
    }
    // `seen` must fire from the mount effect, so it is a real denominator for
    // `opened` / `dismissed` rather than a count of page loads.
    expect(PROMPT).toMatch(/professionRecoveryPromptSeen/);
    expect(PROMPT).toMatch(/professionRecoveryPromptDismissed/);
    expect(PROMPT).toMatch(/professionRecoveryPromptOpened/);
    // Which trade a person picked is profile data — never an event payload.
    expect(PROMPT).not.toMatch(/trackFunnel\([^)]*,\s*\{/);
  });

  it("asks the question in every shipped locale, in that language", () => {
    const en = JSON.parse(read(join(MESSAGES, "en.json"))) as Record<
      string,
      { noWorkType?: Record<string, string> }
    >;
    const enCopy = en.opportunities?.noWorkType;
    expect(enCopy, "en must carry the copy").toBeTruthy();

    for (const loc of LOCALES) {
      const m = JSON.parse(read(join(MESSAGES, `${loc}.json`))) as Record<
        string,
        { noWorkType?: Record<string, string> }
      >;
      const copy = m.opportunities?.noWorkType;
      expect(copy, `${loc} is missing opportunities.noWorkType`).toBeTruthy();
      for (const key of ["title", "body", "cta", "dismiss"]) {
        const v = copy?.[key];
        expect(v, `${loc}.${key} missing`).toBeTruthy();
        expect((v ?? "").trim().length, `${loc}.${key} empty`).toBeGreaterThan(0);
        if (loc !== "en") {
          // English left in a non-English catalogue is the failure this
          // repository has shipped before (landing.hero, #1220 era) — the
          // marker was absent so the debt counter read clean while English
          // shipped. Compare against the source instead.
          expect(v, `${loc}.${key} is still the English string`).not.toBe(
            enCopy?.[key],
          );
        }
      }
    }
  });

  it("keeps BOTH controls reachable on a phone", () => {
    // Measured at 390px: before `min-h-11` was added to the CTA it rendered
    // 28px tall — under the 44px floor, on the primary action of a prompt
    // aimed at phone users. Both controls are pinned so neither drifts back.
    const ctaBlock = PROMPT.slice(
      PROMPT.indexOf("opportunities-no-work-type-cta") - 600,
      PROMPT.indexOf("opportunities-no-work-type-cta"),
    );
    const dismissBlock = PROMPT.slice(
      PROMPT.indexOf("opportunities-no-work-type-dismiss") - 600,
      PROMPT.indexOf("opportunities-no-work-type-dismiss"),
    );
    expect(ctaBlock, "CTA must carry the 44px touch floor").toMatch(/min-h-11/);
    expect(dismissBlock, "dismiss must carry the 44px touch floor").toMatch(
      /min-h-11/,
    );
  });
});
