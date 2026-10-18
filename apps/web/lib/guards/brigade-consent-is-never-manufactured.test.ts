import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { consentFromProvenance } from "@/lib/planning/brigade-plan";

/**
 * B1 guard — the consent mapping, and the two ways it could quietly lie.
 *
 * A team act is the easiest place in the product to manufacture consent: the
 * owner names a brigade, and N people are committed. The team module already
 * distinguishes an accepted `join_team` invitation ('invited') from a member
 * added before that ledger existed ('direct') from a model that is not
 * applied at all ('unknown'). The only way that distinction survives into a
 * brigade act is if the mapping never collapses a pair — so it is pinned
 * behaviourally here, not just described in a comment.
 */
const APP = join(__dirname, "..", "..");
const SRC = readFileSync(join(APP, "lib/planning/brigade-plan.ts"), "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ");

describe("1. the three provenances stay three answers", () => {
  it("an accepted invitation is the only thing that counts as consent", () => {
    expect(consentFromProvenance("invited")).toBe("recorded");
  });

  it("'direct' is NOT consent — and is not the same as unknown", () => {
    expect(consentFromProvenance("direct")).toBe("not_recorded");
    expect(consentFromProvenance("direct")).not.toBe(consentFromProvenance("unknown"));
  });

  it("'unknown' is NOT read as absence of consent", () => {
    expect(consentFromProvenance("unknown")).toBe("unknown");
    expect(consentFromProvenance("unknown")).not.toBe(consentFromProvenance("direct"));
  });

  it("nothing but 'invited' can produce recorded consent", () => {
    for (const p of ["direct", "unknown"] as const) {
      expect(consentFromProvenance(p)).not.toBe("recorded");
    }
  });
});

describe("2. authority is the database's answer, not this file's", () => {
  it("no authority predicate is reimplemented here", () => {
    expect(code).not.toMatch(/caller_manages_worker|can_manage_project|owns_company/);
  });

  it("an unsupplied authority defaults to unknown, never to permitted", () => {
    expect(code).toMatch(/m\.authority \?\? "unknown"/);
  });
});

describe("3. the composition writes nothing", () => {
  it("calls no RPC and no write action", () => {
    expect(code).not.toMatch(/\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
    expect(code).not.toMatch(/"use server"/);
  });
});

describe("4. an unresolvable member is carried, not dropped", () => {
  it("a null workerId becomes an unknown member rather than vanishing", () => {
    // Dropping them would shrink the brigade and let a partial answer look
    // complete — the failure this whole primitive exists to prevent.
    expect(code).toMatch(/if \(m\.workerId === null\)/);
    expect(code).toMatch(/state: "unknown"/);
    expect(code).not.toMatch(/\.filter\(\s*\(?m\)?\s*=>\s*m\.workerId/);
  });
});
