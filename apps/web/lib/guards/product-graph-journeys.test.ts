import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CAPABILITY_REGISTER,
  capabilityById,
  isLive,
} from "@/lib/product-gate/capability-register";
import {
  FLYWHEEL,
  FORBIDDEN_REDUCTIONS,
  PRODUCT_GRAPH,
  VALUE_CHAIN,
  graphNode,
  type GraphNodeId,
} from "@/lib/product-gate/product-graph";
import { JOURNEY_REGISTER } from "@/lib/product-gate/journey-register";
import { SEMANTIC_SEPARATIONS } from "@/lib/product-gate/semantic-separations";
import { WORLD_ELEMENTS } from "@/lib/product-gate/world-elements";

/**
 * THE PRODUCT MAY NOT GET SMALLER BY ACCIDENT.
 *
 * The capability register (guarded separately) proves that what we say we built
 * exists and is reachable. This guard protects the level above it: the SHAPE of
 * the product. It is the machine half of the owner's second review question —
 * not "did we break something that worked?" but "did we make impossible
 * something the architecture allowed?"
 *
 * Three things are enforced:
 *
 *   · THE GRAPH — 24 nodes, each realized by capabilities that exist. A node
 *     may go empty, and only by saying so, with a date and a reason. Nothing
 *     may empty a node silently, because that is precisely how a labour/work
 *     graph becomes a job board.
 *
 *   · THE JOURNEYS — six permanent chains. A link claiming to be LIVE whose
 *     capabilities are not live in the register fails. Marking a chain green by
 *     hoping is the failure mode; a route rendering is not a journey working.
 *
 *   · THE SEPARATIONS — eight distinctions that have each collapsed before.
 *     Where the vocabulary carrying a distinction can be checked, it is; where
 *     it cannot, the separation must name what a human has to accept instead.
 *     A tripwire is not a proof and is not presented as one.
 */

const WEB_ROOT = join(__dirname, "..", "..");

// ── the graph ───────────────────────────────────────────────────────────────

describe("the canonical product graph stays whole", () => {
  it("has unique node ids and a name for each", () => {
    const seen = new Set<string>();
    for (const node of PRODUCT_GRAPH) {
      expect(seen.has(node.id), `duplicate graph node ${node.id}`).toBe(false);
      seen.add(node.id);
      expect(node.name.length, `${node.id} needs a name`).toBeGreaterThan(0);
      expect(node.definition.length, `${node.id} needs a definition`).toBeGreaterThan(40);
    }
  });

  it("every node maps to a real world element (one product, two views)", () => {
    const elements = new Set(WORLD_ELEMENTS.map((e) => e.id));
    for (const node of PRODUCT_GRAPH) {
      expect(elements.has(node.worldElement), `${node.id} → unknown world element`).toBe(true);
    }
  });

  it("every node names capabilities that exist in the register", () => {
    for (const node of PRODUCT_GRAPH) {
      expect(node.capabilities.length, `${node.id} must name at least one capability`).toBeGreaterThan(0);
      for (const id of node.capabilities) {
        expect(capabilityById(id), `${node.id} names unknown capability ${id}`).toBeDefined();
      }
    }
  });

  it("a node with no live capability says so, with a date and a reason", () => {
    for (const node of PRODUCT_GRAPH) {
      const live = node.capabilities.filter((id) => {
        const row = capabilityById(id);
        return row ? isLive(row) : false;
      });
      if (live.length > 0) {
        expect(
          node.unrealized,
          `${node.id} has live capabilities (${live.join(", ")}) and is still marked unrealized`,
        ).toBeUndefined();
        continue;
      }
      const declared = node.unrealized ?? node.narrowedOn;
      expect(
        declared,
        `${node.id} has no live capability left and nothing declares that. A node emptying out is a product decision — record \`unrealized\` (not built yet) or \`narrowedOn\` (deliberately dropped), with a reason. Silence here is how the product narrows.`,
      ).toBeDefined();
      if (node.unrealized) {
        expect(node.unrealized.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(node.unrealized.why.length, `${node.id} must say why`).toBeGreaterThan(40);
      }
      if (node.narrowedOn) {
        expect(node.narrowedOn.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(node.narrowedOn.by.length, `${node.id} narrowing needs an accountable name`).toBeGreaterThan(0);
        expect(node.narrowedOn.why.length, `${node.id} narrowing needs a reason`).toBeGreaterThan(40);
      }
    }
  });

  it("every domain capability belongs to at least one node — nothing floats free", () => {
    // The graph enumerates the LABOUR/WORK DOMAIN. Two register domains are
    // deliberately not nodes in it: `platform` is the machinery the product
    // runs on, and `communication` is a surface over the graph rather than a
    // part of it — "chat is one universal interaction surface over the graph;
    // it is not the graph itself" (Product Constitution §14). Everything else
    // must extend one of the 24 nodes, or it is a second product inside the
    // product.
    const SURFACE_OR_MACHINERY = new Set(["platform", "communication"]);
    const claimed = new Set(PRODUCT_GRAPH.flatMap((n) => n.capabilities));
    for (const row of CAPABILITY_REGISTER) {
      if (row.internal || SURFACE_OR_MACHINERY.has(row.domain)) continue;
      expect(
        claimed.has(row.id),
        `${row.id} (${row.title}) belongs to no graph node. Either it extends one of the 24 nodes, or it is a second product inside the product.`,
      ).toBe(true);
    }
  });

  it("the flywheel and the value chain reference only real nodes", () => {
    const check = (steps: readonly { step: string; nodes: readonly GraphNodeId[] }[], label: string) => {
      expect(steps.length, `${label} must not be emptied`).toBeGreaterThan(3);
      for (const s of steps) {
        expect(s.nodes.length, `${label} step "${s.step}" names no node`).toBeGreaterThan(0);
        for (const id of s.nodes) expect(graphNode(id), `${label} names unknown node ${id}`).toBeDefined();
      }
    };
    check(FLYWHEEL, "the flywheel");
    check(VALUE_CHAIN, "the value chain");
  });

  it("keeps the list of things this product must never be reduced to", () => {
    expect(FORBIDDEN_REDUCTIONS.length).toBeGreaterThanOrEqual(11);
    for (const f of FORBIDDEN_REDUCTIONS) {
      expect(f.wouldRequire.length, `"${f.to}" must say what narrowing would take`).toBeGreaterThan(30);
    }
  });
});

// ── the journeys ────────────────────────────────────────────────────────────

describe("the permanent journey contracts", () => {
  it("ids are unique and permanent", () => {
    const seen = new Set<string>();
    for (const j of JOURNEY_REGISTER) {
      expect(seen.has(j.id), `duplicate journey ${j.id}`).toBe(false);
      seen.add(j.id);
      expect(j.id).toMatch(/^J-[A-Z-]+$/);
      expect(j.steps.length, `${j.id} must have steps`).toBeGreaterThan(2);
    }
  });

  it("covers the six actors the owner named", () => {
    const ids = JOURNEY_REGISTER.map((j) => j.id);
    for (const required of [
      "J-WORKER-EVIDENCE",
      "J-COMPANY-EXECUTION",
      "J-AGENCY-SUPPLY",
      "J-INSTITUTION-OUTCOME",
      "J-IMPORT-HISTORY",
      "J-TIME-FREEDOM",
    ]) {
      expect(ids, `${required} is a permanent contract and may not be deleted`).toContain(required);
    }
  });

  it("every step names capabilities that exist", () => {
    for (const j of JOURNEY_REGISTER) {
      for (const step of j.steps) {
        expect(step.capabilities.length, `${j.id} · "${step.step}" names no capability`).toBeGreaterThan(0);
        for (const id of step.capabilities) {
          expect(capabilityById(id), `${j.id} · "${step.step}" names unknown capability ${id}`).toBeDefined();
        }
      }
    }
  });

  it("a step claiming LIVE is backed by capabilities that are actually live", () => {
    for (const j of JOURNEY_REGISTER) {
      for (const step of j.steps) {
        if (step.link !== "LIVE") continue;
        for (const id of step.capabilities) {
          const row = capabilityById(id)!;
          expect(
            isLive(row),
            `${j.id} · "${step.step}" is marked LIVE and depends on ${id}, which the register records as ${row.status}. A journey link may not be greener than the capability under it.`,
          ).toBe(true);
        }
      }
    }
  });

  it("a broken or unbuilt step says why, in words", () => {
    for (const j of JOURNEY_REGISTER) {
      for (const step of j.steps) {
        if (step.link === "LIVE") continue;
        expect(
          (step.because ?? "").length,
          `${j.id} · "${step.step}" is ${step.link} and must say why it is still in the contract`,
        ).toBeGreaterThan(40);
      }
    }
  });

  it("no journey is silently emptied of its purpose", () => {
    for (const j of JOURNEY_REGISTER) {
      expect(j.why.length, `${j.id} must say what breaks in the product if this chain breaks`).toBeGreaterThan(40);
      if (j.retired) {
        expect(j.retired.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(j.retired.why.length).toBeGreaterThan(40);
      }
    }
  });
});

// ── the separations ─────────────────────────────────────────────────────────

describe("the distinctions that may never collapse", () => {
  it("each separation records what it separates and what it cost when it collapsed", () => {
    const seen = new Set<string>();
    for (const s of SEMANTIC_SEPARATIONS) {
      expect(seen.has(s.id), `duplicate separation ${s.id}`).toBe(false);
      seen.add(s.id);
      expect(s.separates.length, `${s.id} must separate at least two things`).toBeGreaterThan(1);
      expect(s.rule.length, `${s.id} needs a rule`).toBeGreaterThan(40);
      expect(
        s.collapsedBefore.length,
        `${s.id} must keep the record of what went wrong. Deleting the incident is how the lesson is lost.`,
      ).toBeGreaterThan(40);
    }
  });

  it("a machine or tripwire separation anchors to a module that still carries its vocabulary", () => {
    for (const s of SEMANTIC_SEPARATIONS) {
      if (s.enforcement === "review") continue;
      expect(s.anchor, `${s.id} claims ${s.enforcement} enforcement and must name an anchor`).toBeTruthy();
      const path = join(WEB_ROOT, s.anchor!);
      expect(existsSync(path), `${s.id} anchor \`${s.anchor}\` does not exist`).toBe(true);
      const source = readFileSync(path, "utf8");
      expect(s.vocabulary.length, `${s.id} must name the vocabulary that carries the distinction`).toBeGreaterThan(0);
      for (const token of s.vocabulary) {
        expect(
          source.includes(token),
          `${s.id}: \`${token}\` is gone from ${s.anchor}. The distinction it carried (${s.separates.join(" ≠ ")}) may have gone with it. This is a tripwire, not a proof — if the rename is genuine, update the register; if the concept was removed, that is a product decision.`,
        ).toBe(true);
      }
    }
  });

  it("a separation no machine can check names what a human must accept instead", () => {
    for (const s of SEMANTIC_SEPARATIONS) {
      if (s.enforcement !== "review") continue;
      expect(
        (s.manualAcceptance ?? "").length,
        `${s.id} cannot be machine-checked and must say what review has to do instead. Silence would leave a rule nobody owns.`,
      ).toBeGreaterThan(60);
    }
  });

  it("keeps the eight separations that have each already cost a user a wrong answer", () => {
    const ids = SEMANTIC_SEPARATIONS.map((s) => s.id);
    for (const required of ["SEP-1", "SEP-2", "SEP-3", "SEP-4", "SEP-5", "SEP-6", "SEP-7", "SEP-8"]) {
      expect(ids, `${required} may not be deleted`).toContain(required);
    }
  });
});
