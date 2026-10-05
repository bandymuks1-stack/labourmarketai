import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CapabilityTag } from "@/components/app/work-world/capability-tag";
import { RelationRail } from "@/components/app/work-world/relation-rail";
import { Spine, SpineItem } from "@/components/app/work-world/spine";
import { StateMark, WORK_STATES, workStateOfStanding } from "@/components/app/work-world/state-mark";
import { WorkBar } from "@/components/app/work-world/work-bar";
import {
  livingCvRail,
  type LivingCvStoryData,
} from "@/components/app/cv/living-cv-story";

/**
 * THE PRODUCT VOCABULARY GUARD.
 *
 * One visual language for the work graph (docs/product — premium product
 * system): a person, a capability, a state, the history spine and the work bar
 * look the same on every surface, and the cinematic layer later amplifies
 * THESE shapes rather than inventing others. This guard freezes the three
 * properties that make the vocabulary trustworthy:
 *
 *   1. A state is ALWAYS shape + word — never colour alone.
 *   2. UNKNOWN is its own state and is never drawn as a zero-length bar.
 *   3. A link of the work chain is "done" only when the record behind it
 *      exists (the rail is a map of what the data knows, not a progress bar).
 */

/** The sentence-case vocabulary. (primitives.tsx / evidence-chain.tsx are the
 *  earlier work-world grammar; they keep their own contract.) */
const VOCAB_FILES = ["state-mark.tsx", "spine.tsx", "capability-tag.tsx", "relation-rail.tsx", "work-bar.tsx"];
const VOCAB_DIR = join(__dirname, "..", "..", "components", "app", "work-world");

describe("state vocabulary", () => {
  it("defines exactly the provenance-ladder states", () => {
    expect([...WORK_STATES].sort()).toEqual(
      ["confirmed", "disputed", "recorded", "returned", "unknown", "waiting"],
    );
  });

  it("renders every state as a glyph AND a word (never colour alone)", () => {
    for (const state of WORK_STATES) {
      const html = renderToStaticMarkup(h(StateMark, { state, children: `word-${state}` }));
      expect(html).toContain("<svg");
      expect(html).toContain(`word-${state}`);
      expect(html).toContain(`data-state="${state}"`);
    }
  });

  it("gives each state a distinct shape signature", () => {
    const sig = (s: (typeof WORK_STATES)[number]) =>
      renderToStaticMarkup(h(StateMark, { state: s, children: "x" }))
        .replace(/class="[^"]*"/g, "")
        .replace(/data-state="[^"]*"/g, "");
    const sigs = new Set(WORK_STATES.map(sig));
    expect(sigs.size).toBe(WORK_STATES.length);
  });

  it("keeps gold out of confirmation (BRAND ≠ CONFIRMATION, SEP-3)", () => {
    const src = readFileSync(join(VOCAB_DIR, "state-mark.tsx"), "utf8");
    const confirmedLine = /confirmed:\s*"([^"]+)"/.exec(src)?.[1] ?? "";
    expect(confirmedLine).toContain("trust-accent");
    expect(confirmedLine).not.toContain("brand-blue");
  });

  it("uses no uppercase mono telemetry styling (sentence case system)", () => {
    for (const f of VOCAB_FILES) {
      const src = readFileSync(join(VOCAB_DIR, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(src, f).not.toMatch(/\buppercase\b/);
      expect(src, f).not.toMatch(/tracking-label/);
    }
  });
});

describe("standing → state bridge (one colour rule, defined once)", () => {
  it("only a confirmation by someone else is 'confirmed'", () => {
    expect(workStateOfStanding("ORGANIZATION_ATTESTED")).toBe("confirmed");
    expect(workStateOfStanding("THIRD_PARTY_ATTESTED")).toBe("confirmed");
    expect(workStateOfStanding("INDEPENDENTLY_VERIFIED")).toBe("confirmed");
    expect(workStateOfStanding("SELF_ATTESTED")).toBe("recorded");
    expect(workStateOfStanding("SELF_REPORTED")).toBe("recorded");
    expect(workStateOfStanding("DISPUTED")).toBe("disputed");
    expect(workStateOfStanding("UNKNOWN")).toBe("unknown");
  });

  it("a self-attested spine node is never painted confirmed", () => {
    const html = (standing: "SELF_ATTESTED" | "ORGANIZATION_ATTESTED") =>
      renderToStaticMarkup(h(Spine, null, h(SpineItem, { position: "past", standing, children: "x" })));
    expect(html("SELF_ATTESTED")).not.toContain("bg-trust-accent");
    expect(html("ORGANIZATION_ATTESTED")).toContain("bg-trust-accent");
  });
});

describe("capability tag", () => {
  it("marks the tier by shape, not only by colour", () => {
    for (const tier of ["confirmed", "evidence", "declared"] as const) {
      const html = renderToStaticMarkup(h(CapabilityTag, { tier, children: "Tiling" }));
      expect(html).toContain("<svg");
      expect(html).toContain(`data-tier="${tier}"`);
      expect(html).toContain("Tiling");
    }
  });
});

describe("work bar", () => {
  it("never draws less than a visible sliver and never more than the whole", () => {
    expect(renderToStaticMarkup(h(WorkBar, { widthPercent: 0, confirmedPercent: 0 }))).toContain("width:6%");
    expect(renderToStaticMarkup(h(WorkBar, { widthPercent: 900, confirmedPercent: 400 }))).toContain("width:100%");
  });
});

describe("spine", () => {
  it("marks the present, the past and the not-yet-history", () => {
    const html = renderToStaticMarkup(
      h(
        Spine,
        null,
        h(SpineItem, { position: "now", children: "a" }),
        h(SpineItem, { position: "past", children: "b" }),
        h(SpineItem, { position: "next", children: "c" }),
      ),
    );
    for (const p of ["now", "past", "next"]) expect(html).toContain(`data-position="${p}"`);
  });
});

describe("relation rail", () => {
  const labels = { work: "W", evidence: "E", confirmed: "C", history: "H", next: "N", label: "chain" };
  const story = (over: Partial<LivingCvStoryData>): LivingCvStoryData => ({
    name: "x",
    initials: "X",
    professions: [],
    engagements: [],
    skills: { confirmed: [], evidence: [], declared: [] },
    ...over,
  });
  const states = (d: LivingCvStoryData) => livingCvRail(d, labels).map((s) => s.state);

  it("with no data nothing is done and the first link is the way forward", () => {
    expect(states(story({}))).toEqual(["current", "open", "open", "open", "open"]);
  });

  it("a link is done only when its record exists", () => {
    const d = story({
      engagements: [
        { id: "1", organization: "o", title: null, period: "", current: true, recorded: { hours: 4, confirmedHours: 0 }, recordedText: null },
      ],
      skills: { confirmed: [], evidence: ["tiling"], declared: [] },
    });
    // work ✓ evidence ✓ confirmed ✗(current) history ✓ next(open)
    expect(states(d)).toEqual(["done", "done", "current", "done", "open"]);
  });

  it("declared skills alone are NOT evidence (declared ≠ shown)", () => {
    const d = story({ skills: { confirmed: [], evidence: [], declared: ["tiling"] } });
    expect(states(d)[1]).not.toBe("done");
  });

  it("renders as a labelled ordered list", () => {
    const html = renderToStaticMarkup(
      h(RelationRail, { label: "chain", stages: livingCvRail(story({}), labels) }),
    );
    expect(html).toContain('aria-label="chain"');
    expect(html).toContain("<ol");
  });
});
