import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PRODUCT_GRAPH } from "@/lib/product-gate/product-graph";
import { JOURNEY_REGISTER } from "@/lib/product-gate/journey-register";
import { SEMANTIC_SEPARATIONS } from "@/lib/product-gate/semantic-separations";

const REPO = resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

const CANONICAL = "docs/OWNER_TARGET_ARCHITECTURE_V1.md";

/**
 * WHAT THIS PROTECTS — that exactly ONE document is the architecture, and that
 * it stays reconciled with the machine halves.
 *
 * THE FAILURE THIS WAS WRITTEN FOR, 2026-09-14. The owner asked which document
 * was the canonical final architecture. There was no answer. `CLAUDE.md` named
 * TWO entry points four lines apart; three different graphs described the same
 * product, all machine-enforced and none identical; `docs/ARCHITECTURE.md` §10
 * promised a supersession registry and listed nothing; and the most recent
 * full audit had been measured against an architecture pasted into a chat
 * prompt, because no repo document contained it.
 *
 * None of that was disagreement. Every one of those documents was sincere and
 * locally correct. The product still got narrowed, because an agent reads one
 * real document and everything it omits stops being anybody's business.
 *
 * So the invariants below are structural, and deliberately few. This guard
 * cannot check that the product IS the architecture — see the canonical file's
 * §8 on what is not machine-checkable. It checks that there is one file to
 * read, that it has not drifted from the registers, and that no second file
 * has quietly reclaimed the title.
 */
describe("owner target architecture — one file, and it stays reconciled", () => {
  it("the canonical architecture exists and declares version, date and status", () => {
    expect(existsSync(resolve(REPO, CANONICAL))).toBe(true);
    const s = read(CANONICAL);
    expect(s).toMatch(/\|\s*\*\*Version\*\*\s*\|/);
    expect(s).toMatch(/\|\s*\*\*Date\*\*\s*\|/);
    expect(s).toMatch(/ACTIVE — THE canonical architecture/);
  });

  it("CLAUDE.md sends agents to it FIRST", () => {
    // The two-entry-point defect in its original form: CLAUDE.md named
    // ARCHITECTURE.md as "the ONE canonical architecture entry point" and
    // ARCHITECTURE_UNIVERSAL four lines later.
    const claude = read("CLAUDE.md");
    expect(claude).toContain(CANONICAL);
    const firstCanonical = claude.indexOf(CANONICAL);
    for (const other of [
      "docs/ARCHITECTURE.md",
      "docs/ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md",
    ]) {
      const at = claude.indexOf(other);
      if (at === -1) continue;
      expect(
        at > firstCanonical,
        `CLAUDE.md points at ${other} before the canonical architecture. Whichever is named first is the one an agent reads.`,
      ).toBe(true);
    }
  });

  it("no OTHER document claims to be the canonical architecture entry point", () => {
    // The claim, not the word. "Canonical" appears legitimately in dozens of
    // files (canonical reader, canonical path, canonical mark); what may not
    // recur is a second file announcing itself as THE entry point.
    for (const rel of [
      "docs/ARCHITECTURE.md",
      "docs/ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md",
      "LABOURMARKET_AI_PREMIUM_FULL_PROJECT_COMPLETION_MASTER_COMMAND_V2.md",
      "LABOURMARKET_AI_FUNCTIONAL_COMPLETION_MASTER_REPORT_2026-08-17.md",
      "LABOURMARKET_AI_WORK_OS_VECTICUM_COMPLETION_REPORT.md",
    ]) {
      if (!existsSync(resolve(REPO, rel))) continue;
      const s = read(rel);
      expect(
        /CANONICAL ARCHITECTURE ENTRY POINT|Status:\*{0,2} CANONICAL BASELINE/.test(s),
        `${rel} still announces itself as the canonical entry point. Two entry points is the defect this guard exists for.`,
      ).toBe(false);
      expect(
        /NOT THE CANONICAL ARCHITECTURE|SUPERSEDED AS ARCHITECTURE/.test(s),
        `${rel} carries no ACTIVE/SUPPORTING/SUPERSEDED banner, so a reader cannot tell it is not the architecture.`,
      ).toBe(true);
    }
  });

  it("every graph node in the register appears in the canonical target graph", () => {
    // Drift in the direction that matters: the registers are what the guards
    // and the product-truth bootstrap actually read, so a node present there
    // and absent from the architecture means the architecture has silently
    // stopped describing the product.
    const s = read(CANONICAL);
    for (const node of PRODUCT_GRAPH) {
      const words = node.id.split("_").filter((w) => w.length > 3);
      const hit = words.every((w) => new RegExp(w, "i").test(s));
      expect(
        hit,
        `Graph node "${node.id}" is in product-graph.ts and not described in ${CANONICAL} §1.2. Either add it to the target or record its removal as an owner decision — never let the two drift.`,
      ).toBe(true);
    }
  });

  it("the four nodes this reconciliation ADDED are flagged as an owner decision", () => {
    // INSTITUTIONS, SUPPLY and MATCHING were promoted from prose to nodes on
    // owner text of 2026-09-14. That is the single substantive extension this
    // reconciliation made, and an agent may not make it silently: ARCH-1 is
    // where the owner confirms or corrects it.
    const s = read(CANONICAL);
    expect(s).toContain("ARCH-1");
    for (const added of ["INSTITUTIONS", "SUPPLY", "MATCHING"]) {
      expect(s).toContain(added);
    }
    expect(
      /ARCH-1[\s\S]{0,900}(INSTITUTIONS|SUPPLY|MATCHING)/.test(s),
      "ARCH-1 must name the nodes it is asking about, or the owner cannot answer it.",
    ).toBe(true);
  });

  it("every permanent journey id is named", () => {
    const s = read(CANONICAL);
    for (const j of JOURNEY_REGISTER) {
      expect(s, `journey ${j.id} is missing from the canonical architecture`).toContain(j.id);
    }
  });

  it("every semantic separation is carried, by id", () => {
    const s = read(CANONICAL);
    for (const sep of SEMANTIC_SEPARATIONS) {
      expect(s, `${sep.id} is missing from the canonical architecture`).toContain(sep.id);
    }
  });

  it("TARGET and STATUS stay separate sections", () => {
    // The whole point of the file. A target that absorbs current status is a
    // target that shrinks every time something is hard to build.
    const s = read(CANONICAL);
    const target = s.indexOf("## 1. THE TARGET ARCHITECTURE");
    const status = s.indexOf("## 11. CURRENT IMPLEMENTATION STATUS");
    expect(target).toBeGreaterThan(-1);
    expect(status).toBeGreaterThan(target);
    expect(s).toMatch(/Missing code never weakens/i);
  });

  it("names the six distribution surfaces", () => {
    // Absent from the entire authority stack before 2026-09-14: the
    // constitution and the doctrine contain zero references to any of them.
    const s = read(CANONICAL);
    for (const surface of ["PWA", "Google Play", "App Store", "ChatGPT", "Claude connector", "MCP"]) {
      expect(s, `distribution surface "${surface}" is missing`).toContain(surface);
    }
  });

  it("keeps the open owner decisions visible and unresolved by agents", () => {
    const s = read(CANONICAL);
    for (const id of ["PER-11", "ORG-2", "EVID-2", "EVID-6", "MKT-7", "GOV-1"]) {
      expect(s, `carried-forward owner decision ${id} was dropped`).toContain(id);
    }
    expect(s).toMatch(/no agent may settle these/i);
  });
});
