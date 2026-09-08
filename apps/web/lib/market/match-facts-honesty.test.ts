import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { explicitIdsReport, selectPoolIds } from "@/lib/market/supply-retrieval";

/**
 * A fact read that FAILED must not rank a worker as if the fact were ABSENT.
 *
 * THE DEFECT. `buildSupplyCandidates` read `worker_skills` and
 * `worker_professions` with `.data ?? []` and no error check. On a failure the
 * candidate was assembled with `skills: []` and `professionSlug: null` — which
 * is indistinguishable from a worker who has recorded nothing — and the engine
 * ranked a fully skilled person as unskilled, confidently and silently.
 *
 * The same file already knew the distinction: `prefsRes`, `langsRes` and
 * `practiceRes` map their errors to `null` ON PURPOSE, because those stores are
 * human-gated and `null` travels to the subject as an honest "not stated".
 * `worker_skills` and `worker_professions` are neither gated nor optional —
 * they are the facts the ranking is MADE of — and they had no such treatment.
 *
 * The report already carried the right vocabulary for this: `capped` and
 * `truncatedStages` exist to say "we did not look at everyone". `unreadableFacts`
 * says the different thing — we looked at everyone and could not read what we
 * needed about them.
 */

const SRC = readFileSync(
  join(process.cwd(), "lib/market/match-subject.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(process.cwd(), "app/[locale]/dashboard/company/scouting/page.tsx"),
  "utf8",
);

describe("the report says nothing was unreadable until something is", () => {
  it("a planned pool starts with an empty unreadableFacts", () => {
    const { report } = selectPoolIds([
      { tier: "skill", ids: ["a", "b"], truncated: false },
    ]);
    expect(report.unreadableFacts).toEqual([]);
  });

  it("an explicit-ids pool starts with an empty unreadableFacts", () => {
    expect(explicitIdsReport(["a"], ["a"]).unreadableFacts).toEqual([]);
  });

  it("it is a separate statement from capped — the two must not be conflated", () => {
    // capped says "we did not look at everyone". unreadableFacts says "we
    // looked and could not read". A caller that merged them would tell the
    // employer to narrow the need when narrowing changes nothing.
    const { report } = selectPoolIds(
      [{ tier: "skill", ids: ["a", "b", "c"], truncated: false }],
      2,
    );
    expect(report.capped).toBe(true);
    expect(report.unreadableFacts).toEqual([]);
  });
});

describe("the two ungated fact reads are checked, and the gated ones stay as they were", () => {
  it("skills and professions errors are recorded rather than swallowed", () => {
    expect(SRC).toMatch(/if \(skillsRes\.error\) unreadableFacts\.push\("skills"\)/);
    expect(SRC).toMatch(
      /if \(profsRes\.error\) unreadableFacts\.push\("professions"\)/,
    );
    expect(SRC).toMatch(/poolSize: candidates\.length, unreadableFacts/);
  });

  it("a failed primary workers read is not reported as an empty pool alone", () => {
    expect(SRC).toMatch(/unreadableFacts: \["workers"\]/);
  });

  it("the human-gated reads still map their errors to null, deliberately", () => {
    // Regression guard in the OTHER direction: turning these into
    // `unreadableFacts` would warn on every load in an environment where the
    // MP-1 / MP-2 migrations are simply not applied, which is not a failure.
    const gated = SRC.match(/\(r\.error \? \{ data: null \} : r\)/g) ?? [];
    expect(gated.length).toBe(3);
  });
});

describe("the employer is told, in their own language", () => {
  it("the scouting page shows it as its own notice, not folded into the pool note", () => {
    expect(PAGE).toMatch(/const factsUnreadable =/);
    expect(PAGE).toContain("result.retrieval.unreadableFacts.length > 0");
    expect(PAGE).toContain('data-testid="scouting-facts-unreadable"');
    expect(PAGE).toContain('t("pool.factsUnreadable")');
  });

  it("every locale that reaches this page has the whole pool notice", () => {
    // Six locales carried a `scouting` namespace with NO `pool` object at all,
    // so `t("pool.complete")` rendered its own key as visible text on every
    // load. next-intl has no fallback configured here, so a missing key is a
    // leak, not an English sentence.
    const locales = ["en", "lt", "de", "nl", "ru", "pl", "sv", "da", "et", "lv", "no"];
    for (const locale of locales) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as Record<string, { pool?: Record<string, string> }>;
      const pool = messages.scouting?.pool;
      expect(pool, `${locale}: scouting.pool missing`).toBeDefined();
      for (const key of ["complete", "capped", "factsUnreadable"]) {
        expect(typeof pool?.[key], `${locale}: pool.${key}`).toBe("string");
      }
    }
  });

  it("the counted notices keep their placeholder in every locale", () => {
    for (const locale of ["en", "lt", "de", "nl", "ru", "pl", "sv", "da", "et", "lv", "no"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as Record<string, { pool?: Record<string, string> }>;
      expect(messages.scouting?.pool?.complete).toContain("{count}");
      expect(messages.scouting?.pool?.capped).toContain("{count}");
    }
  });
});
