import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { REGISTERED_AGENTS } from "@/lib/ai/registry/registry";

/**
 * AI-3 — WHICH REGISTERED AGENTS ACTUALLY RUN.
 *
 * The capability register carried the sentence "six registered agents still
 * have zero call sites" as prose. Prose drifts: measured on 2026-09-14 the
 * number was SEVEN, not six, and nobody could have noticed without counting by
 * hand. This guard counts, so the claim is derived rather than remembered.
 *
 * WHY THE SEVEN ARE NOT SIMPLY "CONNECTED" (Step B finding, owner-reported).
 * Each one's domain is ALREADY answered deterministically, and connected:
 *
 *   document_assistant   → lib/conversation/documents-gap.ts — built precisely
 *                          to answer "what do I have / what expires / what is
 *                          missing / what is required", already in the chat.
 *   admin_risk           → lib/admin/readiness-overview.ts — aggregates missing
 *                          docs, expiring docs, billing state and the country
 *                          review queue, which IS this agent's input schema.
 *   country_readiness    → the researched matrix, now rendered per country
 *                          (components/marketing/country-readiness-requirements).
 *   skill_evidence       → lib/journal/skill-pipeline.ts.
 *   booking_risk         → the booking-conflict logic the agent's own header
 *                          says it must never bypass.
 *   support_onboarding   → the per-surface next-action derivations.
 *   translation_copy     → the DeepL provider route in lib/ai/runtime/providers.
 *
 * So giving them call sites is not a wiring job. It is either a SECOND,
 * model-based answer standing beside a working deterministic one — the parallel
 * truth the doctrine forbids (§2) and Step D exists to remove — or seven new
 * product surfaces, which Step B does not authorize. The decision is the
 * owner's; this guard only keeps the count honest until they make it.
 *
 * Note the direction of the constraint: an agent moving OUT of this list (it
 * gained a call site) also fails, so the register cannot silently keep saying
 * "zero call sites" about an agent that now runs.
 */

const APP = join(__dirname, "..", "..");

/** Agents with no `runAiAgent("<key>", …)` anywhere in product code. */
const EXPECTED_UNCALLED = [
  "admin_risk",
  "booking_risk",
  "country_readiness",
  "document_assistant",
  "skill_evidence",
  "support_onboarding",
  "translation_copy",
].sort();

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
        "market_explanation",
        "matching_explanation",
        "work_journal",
        "worker_profile",
      ].sort(),
    );
  });

  it("exactly the declared agents have zero call sites", () => {
    const uncalled = REGISTERED_AGENTS.filter((a) => !hasCallSite(a)).sort();
    expect(
      uncalled,
      "an agent gained or lost a call site — update EXPECTED_UNCALLED and the " +
        "AI-3 note in the capability register together, so the two cannot disagree",
    ).toEqual(EXPECTED_UNCALLED);
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
      "the AI-3 note must name the measured count of agents with no call site",
    ).toMatch(new RegExp(`${EXPECTED_UNCALLED.length}|seven`, "i"));
  });
});
