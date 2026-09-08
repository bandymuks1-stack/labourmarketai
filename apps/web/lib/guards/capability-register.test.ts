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
 *   · a capability claimed usable is NAVIGABLE — something links to its route.
 *     This half was added on 2026-09-07 because the register itself shipped two
 *     false claims that only it could catch: `/dashboard/service-requests`
 *     recorded as "reachable only by typing the URL" while eight surfaces link
 *     to it, and `/dashboard/talent` named as a live surface with no inbound
 *     link at all;
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

/**
 * NAVIGATION reachability — the OTHER half of SEP-8, and the half the import
 * graph cannot see.
 *
 * `/dashboard/service-requests` is imported, rendered and complete, and this
 * register still shipped the claim that "no navigation leads to it — a human
 * reaches it only by typing the URL". Eight real `href`s said otherwise. The
 * claim came from prose, was never checked, and nothing could check it, because
 * the import graph answers a different question.
 *
 * So: a dashboard route surface counts as NAVIGABLE when some non-test source
 * outside that route's own directory carries an href to it. That is checkable,
 * and it is what "a person can get there" actually means.
 */
const dashboardRouteOf = (surface: string): string | null => {
  const m = /^app\/\[locale\]\/(dashboard\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)$/.exec(surface);
  return m ? `/${m[1]}` : null;
};

function navigableRoutes(): ReadonlySet<string> {
  const found = new Set<string>();
  for (const file of graph.files) {
    const source = readFileSync(join(WEB_ROOT, file), "utf8");
    for (const m of source.matchAll(/["'`](?:\/\$\{locale\})?(\/dashboard\/[a-z0-9/-]+)["'`]/g)) {
      const route = m[1]!;
      // A route linking to itself is not navigation.
      if (file.includes(`app/[locale]${route}/`)) continue;
      found.add(route);
    }
  }
  return found;
}

const navigable = navigableRoutes();

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

  it("a live capability's route surface is one a person can actually reach", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.internal) continue;
      if (row.status !== "BUILT_AND_USABLE" && row.status !== "PARTIAL") continue;
      const routes = row.surfaces.map(dashboardRouteOf).filter((r): r is string => r !== null);
      if (routes.length === 0) continue; // its surfaces are components, not routes
      expect(
        routes.some((r) => navigable.has(r)),
        `${describeRow(row)} claims status ${row.status}, and NOTHING links to ${routes.join(" or ")}. Imported is not the same as reachable: a person would have to type the URL.`,
      ).toBe(true);
    }
  });

  it("a capability disconnected for want of navigation really has none", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.disconnectedBecause !== "no_navigation" && row.disconnectedBecause !== "orphan_route") {
        continue;
      }
      for (const route of row.surfaces.map(dashboardRouteOf)) {
        if (route === null) continue;
        expect(
          navigable.has(route),
          `${describeRow(row)} says nothing navigates to ${route}, and something does. Somebody wired it — raise the status.`,
        ).toBe(false);
      }
    }
  });

  it("BUILT_NOT_CONNECTED says HOW it is disconnected, so the claim can be falsified", () => {
    for (const row of CAPABILITY_REGISTER) {
      if (row.status !== "BUILT_NOT_CONNECTED") continue;
      expect(
        row.disconnectedBecause,
        `${describeRow(row)} claims nothing leads to it without saying which kind of path is missing. "Nothing leads to it" is several different claims, checked in different ways; one that does not say which cannot be checked at all.`,
      ).toBeTruthy();
      if (row.disconnectedBecause === "no_importer") {
        expect(
          row.coreModule,
          `${describeRow(row)} claims no importer and names no module to check`,
        ).toBeTruthy();
      }
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
