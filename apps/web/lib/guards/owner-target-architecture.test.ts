import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PRODUCT_GRAPH } from "@/lib/product-gate/product-graph";
import { JOURNEY_REGISTER } from "@/lib/product-gate/journey-register";
import { SEMANTIC_SEPARATIONS } from "@/lib/product-gate/semantic-separations";
import { CAPABILITY_REGISTER } from "@/lib/product-gate/capability-register";

const REPO = resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

/**
 * Markdown prose, flattened to one line: blockquote markers and wrapping
 * removed. Sentences in this document legitimately wrap and legitimately sit
 * inside `>` quotes, so a regex over the raw text asserts the LINE BREAKS as
 * much as the words — it goes red on a reflow that changed nothing. Three of
 * the pins below are whole sentences, so they match against this instead.
 */
const prose = (rel: string) =>
  read(rel)
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ");

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

  it("ARCH-1's four nodes are REAL nodes, not prose (owner APPROVED 2026-09-14)", () => {
    // Before ARCH-1 these lived only in the value chain and the flywheel text.
    // A concept with no node cannot lose its last capability, so the one
    // mechanism built to stop silent narrowing was blind to four of the
    // twenty-eight things it protects. This is the assertion that closes that.
    const ids = new Set(PRODUCT_GRAPH.map((n) => n.id));
    for (const id of ["institutions", "supply", "matching", "recognition"]) {
      expect(
        ids.has(id as (typeof PRODUCT_GRAPH)[number]["id"]),
        `"${id}" is an owner-approved first-class node (ARCH-1) and is not in product-graph.ts. Removing it re-opens the silent-narrowing hole ARCH-1 closed; that needs a NEW owner decision, not a deletion.`,
      ).toBe(true);
    }
    expect(PRODUCT_GRAPH.length).toBe(28);
  });

  it("ARCH-1 added MEANING, not modules — every new node reuses existing capabilities", () => {
    // The owner approved the nodes with an explicit limit: "not authorization
    // to create four duplicate modules, routes, databases or UI sections."
    // The check that enforces it is that each new node's capabilities were
    // ALREADY in the register — a node inventing its own capability id is the
    // duplication the decision forbade.
    const registered = new Set(CAPABILITY_REGISTER.map((c) => c.id));
    for (const id of ["institutions", "supply", "matching", "recognition"]) {
      const node = PRODUCT_GRAPH.find((n) => n.id === id);
      expect(node, `${id} missing`).toBeTruthy();
      expect(node!.capabilities.length).toBeGreaterThan(0);
      for (const cap of node!.capabilities) {
        expect(
          registered.has(cap),
          `Node "${id}" names capability ${cap}, which is not in the register. ARCH-1 was approved as a semantic decision only — a new node may not bring a new capability with it.`,
        ).toBe(true);
      }
    }
  });

  it("RECOGNITION does not absorb demonstrated capability (SEP-6)", () => {
    // SKL-2 is deterministic journal → skill recognition: DEMONSTRATED
    // capability. This node is RECOGNISED EQUIVALENCE against a formal
    // requirement. One node holding both IS the SEP-6 collapse — demonstrated
    // capability silently satisfying a formal requirement.
    const recognition = PRODUCT_GRAPH.find((n) => n.id === "recognition");
    expect(recognition?.capabilities).not.toContain("SKL-2");
    expect(read(CANONICAL)).toMatch(/SKL-2[\s\S]{0,400}SEP-6/);
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

  it("ARCH-2 keeps RPL independence binding while its structure stays deferred", () => {
    // The principle binds NOW even though nothing is built. The risk this
    // pins is the opposite of the usual one: not that someone builds it, but
    // that a later reader sees "deferred" and treats the rule as undecided.
    const s = read(CANONICAL);
    expect(s).toMatch(/### 1\.10 Recognised equivalence/);
    expect(prose(CANONICAL)).toMatch(/never by the beneficiary/i);
    // The five mandatory properties. Dropping any one is how an equivalence
    // becomes an unfalsifiable claim about a person.
    for (const property of ["Evidence", "Provenance", "Requirement linkage", "validity", "receipt"]) {
      expect(s.toLowerCase(), `ARCH-2 property "${property}" dropped`).toContain(property.toLowerCase());
    }
    // Still no structure — the deferral is real, and this is what proves it.
    const graph = PRODUCT_GRAPH.find((n) => n.id === "recognition");
    expect(graph?.capabilities).toContain("SKL-9");
  });

  it("ARCH-4 disclosure stays consent-scoped, and aggregate-only", () => {
    const s = read(CANONICAL);
    expect(s).toMatch(/### 1\.11 Team capability disclosure — consent-scoped/);
    expect(prose(CANONICAL)).toMatch(/never exposed to arbitrary authenticated employers/i);
    // The columns are the boundary. Widening past aggregate counts to member
    // identities is a NEW owner decision, and this names what "aggregate"
    // meant when the owner approved it.
    for (const col of ["skill_slug", "members_declared", "members_confirmed"]) {
      expect(s).toContain(col);
    }
    expect(s).toMatch(/No names, no worker ids/i);
  });

  it("UNAUTHORIZED is not ZERO is recorded as a standing rule, not a team footnote", () => {
    // The owner raised it while deciding ARCH-4 and scoped it wider than
    // teams. Recording it under ARCH-4 alone would lose that.
    const s = read(CANONICAL);
    expect(s).toMatch(/### 1\.12 UNAUTHORIZED is not ZERO/);
    expect(prose(CANONICAL)).toMatch(/must never be interpreted as zero capability/i);
    expect(s).toMatch(/SEP-7/);
  });

  it("keeps the open owner decisions visible and unresolved by agents", () => {
    const s = read(CANONICAL);
    for (const id of ["PER-11", "ORG-2", "EVID-2", "EVID-6", "MKT-7", "GOV-1"]) {
      expect(s, `carried-forward owner decision ${id} was dropped`).toContain(id);
    }
    expect(s).toMatch(/no agent may settle these/i);
  });
});
