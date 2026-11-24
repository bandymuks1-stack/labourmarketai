import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  AI_PROMPT_REGISTRY,
  REGISTERED_AGENTS,
  RETIRED_AGENT_KEYS,
} from "@/lib/ai/registry/registry";
import { AGENT_TASK_TYPES } from "@/lib/ai/runtime/task-routing";

/**
 * AI-3 — WHICH REGISTERED AGENTS ACTUALLY RUN.
 *
 * The capability register carried the sentence "six registered agents still
 * have zero call sites" as prose. Prose drifts: measured on 2026-09-14 the
 * number was SEVEN, not six, and nobody could have noticed without counting by
 * hand. This guard counts, so the claim is derived rather than remembered.
 *
 * OWNER DECISION 2026-10-25 (registry row 10.11, "six registered AI agents
 * without a call site"). The six were each checked against the deterministic
 * answer their domain already had — purpose, inputs, outputs, prompt, schema
 * — and the per-capability evidence is the decision table in
 * docs/ai/INTERNAL_LLM_AGENTS_V1.md §4.1:
 *
 *   country_readiness    INTEGRATED. The sourced matrix stays the answer; the
 *                        agent reads ONE scope's rows back in plain language
 *                        as a labelled suggestion whose every step cites a row
 *                        (lib/country-readiness/readiness-reading-actions.ts).
 *   document_assistant   RETIRED — lib/conversation/documents-gap.ts already
 *                        answers missing / expiring / required, in the chat.
 *   admin_risk           RETIRED — lib/admin/readiness-overview.ts aggregates
 *                        exactly its input schema; an LLM severity on people
 *                        is a ranking doctrine §2.7 forbids.
 *   skill_evidence       RETIRED — lib/journal/skill-pipeline.ts + the wired
 *                        work_journal agent's `possible_skills`.
 *   booking_risk         RETIRED — the booking-conflict RPC + roster-conflicts.
 *   support_onboarding   RETIRED — lib/dashboard/next-action.ts, which forbids
 *                        a competing next-step resolver by name.
 *
 * So EXPECTED_UNCALLED is now EMPTY — and the guard keeps its honesty in both
 * directions: an agent registered without a call site turns this red (it must
 * be listed here, with the AI-3 note updated), and an agent moving out of the
 * list turns it red too, so the register cannot keep saying "uncalled" about
 * an agent that runs.
 */

const APP = join(__dirname, "..", "..");

/** Agents with no `runAiAgent("<key>", …)` anywhere in product code. */
const EXPECTED_UNCALLED: string[] = [
  // Empty since 2026-10-25 — see the owner decision above. A newly registered
  // agent without a call site must be listed here, on the record.
];

function productSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "tests") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // The registry declares agents and the eval harness exercises every one
      // of them off a fixture — neither is a product call site.
      const rel = relative(APP, full).split(sep).join("/");
      if (rel === "lib/ai/registry" || rel === "lib/ai/evals") continue;
      productSources(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE = productSources(join(APP, "lib"))
  .concat(productSources(join(APP, "app")))
  .concat(productSources(join(APP, "components")))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

/** A call site is `runAiAgent(` … `"<key>"` — the key may sit on the next
 *  line, which is how most of the real call sites are formatted. */
function hasCallSite(agent: string): boolean {
  return new RegExp(`runAiAgent(<[^>]*>)?\\(\\s*"${agent}"`).test(SOURCE);
}

describe("AI-3 call sites are counted, not remembered", () => {
  it("the sweep finds the agents that DO run (else it proves nothing)", () => {
    // If this fails the regex or the sweep is broken, and every "uncalled"
    // result below would be a false positive.
    const called = REGISTERED_AGENTS.filter(hasCallSite).sort();
    expect(called).toEqual(
      [
        "company_need",
        "conversation_intent",
        // Wired 2026-10-25 (owner decision, row 10.11): the plain-language
        // reading of the sourced country matrix.
        "country_readiness",
        "market_explanation",
        "matching_explanation",
        "translation_copy",
        // Wired 2026-09-22 (owner P0 §9): the reader-locale rendering of a
        // PUBLIC job advertisement — lib/vacancy-store/vacancy-translation-read.ts.
        "vacancy_translation",
        "work_journal",
        "worker_profile",
      ].sort(),
    );
  });

  it("the call-site detector is real (a guard that cannot fail is not a guard)", () => {
    // A key that exists nowhere must read as uncalled.
    expect(hasCallSite("no_such_agent_key")).toBe(false);
  });

  it("exactly the declared agents have zero call sites", () => {
    const uncalled = REGISTERED_AGENTS.filter((a) => !hasCallSite(a)).sort();
    expect(
      uncalled,
      "an agent gained or lost a call site — update EXPECTED_UNCALLED and the " +
        "AI-3 note in the capability register together, so the two cannot disagree",
    ).toEqual([...EXPECTED_UNCALLED].sort());
  });

  it("the capability register states the SAME number this guard measures", () => {
    const register = readFileSync(
      join(APP, "lib/product-gate/capability-register.ts"),
      "utf8",
    );
    const ai3 = register.slice(register.indexOf('id: "AI-3"'));
    const note = ai3.slice(0, ai3.indexOf("},"));
    expect(
      note,
      "the AI-3 note must name the measured count of agents with no call site " +
        "as `(<n> uncalled)` and the number registered as `<m> registered agents`",
    ).toContain(`(${EXPECTED_UNCALLED.length} uncalled)`);
    expect(note).toContain(`${REGISTERED_AGENTS.length} registered agents`);
  });
});

describe("the agents retired on 2026-10-25 stay retired, not half-present", () => {
  it.each([...RETIRED_AGENT_KEYS])("%s has no registry entry, no task mapping and no prompt file", (key) => {
    expect(Object.keys(AI_PROMPT_REGISTRY)).not.toContain(key);
    expect(Object.keys(AGENT_TASK_TYPES)).not.toContain(key);
    const file = join(APP, "lib/ai/registry/agents", `${key.replace(/_/g, "-")}.ts`);
    expect(existsSync(file), `${file} should be gone with its agent`).toBe(false);
    // And nothing in product code tries to run it.
    expect(hasCallSite(key)).toBe(false);
  });

  it("every retirement is written down where AI decisions live", () => {
    const doc = readFileSync(join(APP, "..", "..", "docs/ai/INTERNAL_LLM_AGENTS_V1.md"), "utf8");
    const at = doc.indexOf("## 4.1");
    expect(at, "docs/ai/INTERNAL_LLM_AGENTS_V1.md has no §4.1 decision table").toBeGreaterThanOrEqual(0);
    const table = doc.slice(at);
    for (const key of [...RETIRED_AGENT_KEYS, "country_readiness"]) {
      expect(table, `§4.1 has no row for ${key}`).toContain(`\`${key}\``);
    }
  });
});
