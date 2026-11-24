import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyIntent } from "./intent-router";

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("'new jobs for me' is its own question, not a fresh search", () => {
  it.each([
    "Kokių naujų darbų man atsirado?",
    "Ar atsirado naujų skelbimų?",
    "Kokios naujos vakansijos atsirado?",
    "Any new jobs for me?",
    "What new jobs came up?",
    "Какие новые вакансии появились?",
    "Welke nieuwe vacatures zijn er?",
    "Gibt es neue Jobs für mich?",
    "Jakie nowe oferty pracy się pojawiły?",
  ])("%s -> new-jobs", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("new-jobs");
  });

  it("searches and statements keep their routes", () => {
    for (const [s, intent] of [
      ["Ieškau darbo", "find-work"],
      ["Rask man darbą", "find-work"],
      ["Parodyk išsaugotus darbus", "saved-opportunities"],
      ["Esu naujas darbuotojas", null],
    ] as const) {
      const got = classifyIntent(s).intent;
      if (intent) expect(got, s).toBe(intent);
      else expect(got, s).not.toBe("new-jobs");
    }
  });
});

describe("the chat uses the ONE job-alert matching, no matcher of its own", () => {
  const SRC = read("lib", "conversation", "new-jobs.ts");

  it("the criteria and the read are the alert emitter's own", () => {
    expect(SRC).toMatch(/buildOwnWorkerContext\(supabase, user\.id\)/);
    expect(SRC).toMatch(/loadJobAlertVacancies\(pairReaderFor\(supabase, nowIso\), criteria, nowIso\)/);
    expect(SRC).toMatch(/missingJobAlertCriteria\(criteria\)/);
    expect(SRC).toMatch(/jobAlertFacts\(v\)/);
    // no second matcher, no vacancy query of its own, nothing written
    expect(SRC).not.toMatch(/\.from\(|\.rpc\(|\.insert\(|\.update\(|searchPublicVacancies/);
  });

  it("the emitter builds its criteria the same way (chat, bell and board agree)", () => {
    const emitter = read("lib", "notifications", "event-emitters.ts");
    expect(emitter).toMatch(/professionSlugs: ctx\.subject\.professionSlugs\?\.length/);
    expect(emitter).toMatch(/preferredCountries: \[\.\.\.\(ctx\.subject\.preferredCountries \?\? \[\]\)\]/);
    expect(emitter).toMatch(/salaryMinEur: ctx\.subject\.salaryMinEur \?\? null/);
  });

  it("honest states: failure is never 'no new jobs'; missing preferences are named and asked", () => {
    expect(SRC).toMatch(/kind: "unavailable"/);
    expect(SRC).toMatch(/kind: "incomplete"/);
    const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
    const handler = chat.slice(chat.indexOf("newJobs: () => {"), chat.indexOf("productHelp: () => {"));
    expect(handler).toMatch(/newJobsNeedProfession/);
    expect(handler).toMatch(/newJobsNeedCountry/);
    expect(handler).toMatch(/newJobsUnavailable/);
    expect(handler).toMatch(/f:worker\.save-preferences/);
    // a company workspace has no such act
    expect(handler).toMatch(/activeOrganizationId/);
  });
});
