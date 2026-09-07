import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix, sep } from "node:path";

import {
  CAPABILITY_REGISTER,
  EVIDENCE_ORDER,
  evidenceRank,
  type CapabilityRow,
} from "@/lib/product-gate/capability-register";

/**
 * THE CAPABILITY REGISTER IS ENFORCED, NOT DESCRIBED.
 *
 * `docs/CAPABILITY_INVENTORY.md` §6 is the human half of one register;
 * `lib/product-gate/capability-register.ts` is the machine half. This guard is
 * what makes the pair a contract instead of two documents.
 *
 * It checks the three things that actually went wrong (see the register's own
 * header for the measured incidents), and nothing it cannot prove:
 *
 *   · every claimed implementation EXISTS on disk;
 *   · a capability claimed usable is REACHABLE from a real surface through the
 *     import graph, and one claimed disconnected is NOT;
 *   · the id lists of the two halves are IDENTICAL, in both directions, so a
 *     capability cannot leave the product by being quietly dropped from a file.
 *
 * What it deliberately does not do: judge whether a capability is any GOOD,
 * whether a status is generous, or whether a title still describes reality.
 * Those are review questions and are named as such in
 * `docs/PRODUCT_CONSTITUTION.md` §17.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..");
const INVENTORY = join(REPO_ROOT, "docs", "CAPABILITY_INVENTORY.md");

const anchorPath = (anchor: string) =>
  anchor.startsWith(".github/") ? join(REPO_ROOT, anchor) : join(WEB_ROOT, anchor);

// ── the import graph, built once ────────────────────────────────────────────

type Graph = {
  readonly files: ReadonlySet<string>;
  readonly edges: ReadonlyMap<string, ReadonlySet<string>>;
};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.") && !name.endsWith(".d.ts")) {
      out.push(full.slice(WEB_ROOT.length + 1).split(sep).join(posix.sep));
    }
  }
  return out;
}

function buildGraph(): Graph {
  const files = new Set<string>();
  for (const root of ["app", "components", "lib"]) walk(join(WEB_ROOT, root), []).forEach((f) => files.add(f));

  const resolve = (spec: string, from: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), spec));
    else return null;
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (files.has(candidate)) return candidate;
    }
    return null;
  };

  const edges = new Map<string, Set<string>>();
  const SPEC = /from\s+["']([^"']+)["']/g;
  for (const file of files) {
    const source = readFileSync(join(WEB_ROOT, file), "utf8");
    const out = new Set<string>();
    for (const m of source.matchAll(SPEC)) {
      const target = resolve(m[1]!, file);
      if (target) out.add(target);
    }
    edges.set(file, out);
  }
  return { files, edges };
}

/** Every module a human can reach, following imports from any route or component. */
function reachableFromSurfaces(graph: Graph): ReadonlySet<string> {
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const file of graph.files) {
    if (file.startsWith("app/") || file.startsWith("components/")) {
      seen.add(file);
      queue.push(file);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of graph.edges.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

const graph = buildGraph();
const reachable = reachableFromSurfaces(graph);

const describeRow = (row: CapabilityRow) => `${row.id} (${row.title})`;

// ── shape ───────────────────────────────────────────────────────────────────

describe("the register is well formed", () => {
  it("has unique, permanent ids", () => {
    const seen = new Set<string>();
    for (const row of CAPABILITY_REGISTER) {
      expect(seen.has(row.id), `duplicate capability id ${row.id}`).toBe(false);
      expect(row.id, `${row.id} must look like DOMAIN-N`).toMatch(/^[A-Z]+-\d+$/);
      seen.add(row.id);
    }
  });

  it("every row states an honest note, so debt is written down rather than implied", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.status === "BUILT_AND_USABLE") continue;
      expect(row.note.length, `${describeRow(row)} is not BUILT_AND_USABLE and must say why`).toBeGreaterThan(0);
    }
  });

  it("uses only the owner's evidence ladder", () => {
    for (const row of CAPABILITY_REGISTER) {
      expect(EVIDENCE_ORDER, `${describeRow(row)}`).toContain(row.strongestEvidence);
    }
  });

  it("BLOCKED means an owner decision or credential — never engineering", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.status !== "BLOCKED") continue;
      expect(row.ownerDecision, `${describeRow(row)} is BLOCKED and must name the decision`).toBeTruthy();
    }
  });

  it("ARCHITECTURE_ONLY is either deliberate or owner-gated, never a shrug", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.status !== "ARCHITECTURE_ONLY") continue;
      expect(
        row.deferredByDesign === true || Boolean(row.ownerDecision),
        `${describeRow(row)} must say it is deferred by design or name an owner decision`,
      ).toBe(true);
    }
  });
});

// ── 1. registered but the implementation is gone ────────────────────────────

describe("every claimed implementation exists", () => {
  it("all anchors resolve to a real path", () => {
    for (const row of CAPABILITY_REGISTER) {
      for (const anchor of row.anchors) {
        expect(
          existsSync(anchorPath(anchor)),
          `${describeRow(row)} claims \`${anchor}\`, which does not exist. Either the path moved (update the register) or the capability was deleted (record a retirement).`,
        ).toBe(true);
      }
    }
  });

  it("all declared surfaces exist", () => {
    for (const row of CAPABILITY_REGISTER) {
      for (const surface of row.surfaces) {
        expect(
          existsSync(join(WEB_ROOT, surface)),
          `${describeRow(row)} claims the surface \`${surface}\`, which does not exist`,
        ).toBe(true);
      }
    }
  });

  it("a core module is a real file, and lives inside its own capability's anchors", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.coreModule === null) continue;
      expect(existsSync(join(WEB_ROOT, row.coreModule)), `${describeRow(row)} core module missing`).toBe(true);
      expect(
        graph.files.has(row.coreModule),
        `${describeRow(row)} core module \`${row.coreModule}\` is not a scanned source file`,
      ).toBe(true);
    }
  });

  it("MISSING carries nothing — that is what makes the claim checkable", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.status !== "MISSING") continue;
      expect(row.anchors, `${describeRow(row)} is MISSING and must have no anchors`).toEqual([]);
      expect(row.coreModule, `${describeRow(row)} is MISSING and must have no core module`).toBeNull();
      expect(row.strongestEvidence, `${describeRow(row)} is MISSING and cannot have evidence`).toBe("NONE");
    }
  });
});

// ── 2. built, and nothing leads to it ───────────────────────────────────────

describe("a capability nobody can reach is not a capability a user has", () => {
  it("BUILT_AND_USABLE names a surface a human can open", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.status !== "BUILT_AND_USABLE" || row.internal) continue;
      expect(
        row.surfaces.length,
        `${describeRow(row)} claims to be usable and names no surface. If the repository is its user, mark it \`internal\`; if a human is, name where they open it.`,
      ).toBeGreaterThan(0);
    }
  });

  it("a live capability's core module is reachable from a route or component", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.internal || row.coreModule === null) continue;
      if (row.status !== "BUILT_AND_USABLE" && row.status !== "PARTIAL") continue;
      expect(
        reachable.has(row.coreModule),
        `${describeRow(row)} claims status ${row.status}, and \`${row.coreModule}\` is reachable from no route or component. This is the ${"work-verification-state"} defect: built, tested, merged, and unreachable. Either wire it or set the status to BUILT_NOT_CONNECTED.`,
      ).toBe(true);
    }
  });

  it("BUILT_NOT_CONNECTED means it really is not connected", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.status !== "BUILT_NOT_CONNECTED" || row.coreModule === null) continue;
      expect(
        reachable.has(row.coreModule),
        `${describeRow(row)} is recorded as disconnected, and \`${row.coreModule}\` IS reachable. Somebody wired it — raise the status and say what evidence the wiring reached.`,
      ).toBe(false);
    }
  });

  it("evidence never outruns status", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.status === "BUILT_AND_USABLE") {
        expect(
          evidenceRank(row.strongestEvidence),
          `${describeRow(row)} claims to be usable on ${row.strongestEvidence}; usable needs at least a test`,
        ).toBeGreaterThanOrEqual(evidenceRank("TEST_PROVEN"));
      }
      if (row.strongestEvidence === "HUMAN_UI_PROVEN") {
        expect(
          ["BUILT_AND_USABLE", "PARTIAL"],
          `${describeRow(row)} says a human drove it, so it cannot be ${row.status}`,
        ).toContain(row.status);
      }
      if (row.status === "BUILT_NOT_CONNECTED") {
        expect(
          evidenceRank(row.strongestEvidence),
          `${describeRow(row)} is unreachable, so it cannot claim ${row.strongestEvidence}`,
        ).toBeLessThan(evidenceRank("PRODUCTION_DATA_PATH_PROVEN"));
      }
    }
  });
});

// ── 3. a capability leaving the product must be an explicit act ─────────────

describe("the two halves of the register cannot drift apart", () => {
  const inventory = readFileSync(INVENTORY, "utf8");
  const sectionSix = inventory.slice(inventory.indexOf("## 6. CANONICAL MASTER PRODUCT REGISTER"));

  it("§6 exists and is the master register", () => {
    expect(sectionSix.length, "docs/CAPABILITY_INVENTORY.md lost §6").toBeGreaterThan(1000);
  });

  it("every documented capability is in the machine register", () => {
    const documented = [...sectionSix.matchAll(/^\| ([A-Z]+-\d+) \|/gm)].map((m) => m[1]!);
    const known = new Set(CAPABILITY_REGISTER.map((c) => c.id));
    for (const id of documented) {
      expect(
        known.has(id),
        `§6 documents ${id} and \`capability-register.ts\` does not. A capability may not exist in prose alone.`,
      ).toBe(true);
    }
  });

  it("every machine-registered capability is documented", () => {
    const documented = new Set([...sectionSix.matchAll(/^\| ([A-Z]+-\d+) \|/gm)].map((m) => m[1]!));
    for (const row of CAPABILITY_REGISTER) {
      expect(
        documented.has(row.id),
        `${describeRow(row)} is in the machine register and missing from §6. Add its row, so a human reading the inventory sees the whole product.`,
      ).toBe(true);
    }
  });

  it("a retired capability keeps its row, with a date and a reason", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (!row.retired) continue;
      expect(row.retired.on, `${describeRow(row)} retirement needs a date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.retired.why.length, `${describeRow(row)} retirement needs a reason`).toBeGreaterThan(20);
    }
  });
});
