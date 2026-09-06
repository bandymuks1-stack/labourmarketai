import { describe, expect, it } from "vitest";

import {
  RECEIPT_TITLE_MAX,
  receiptTitle,
  scopeSkillsToConfirm,
} from "@/lib/journal/quick-confirm-model";

/**
 * Quick-confirm scope — the honesty of COUNTERPARTY_CONFIRMED (window 6).
 *
 * BEFORE: one tap on an entry verified EVERY declared-unverified skill of
 * the worker, whatever the entry said (a welding entry could verify a
 * roofing skill). AFTER: the tap verifies only the skills the entry is
 * linked to; the worker-wide list survives only for entries with no links
 * (and stays fully listed on the card); a failed skills read is a named
 * state that confirms nothing.
 */

const WELD = { id: "s-weld", slug: "welding-blueprint" };
const STEEL = { id: "s-steel", slug: "structural-steel" };
const ROOF = { id: "s-roof", slug: "roofing" };

describe("scopeSkillsToConfirm", () => {
  it("entry_links: with links, ONLY the linked declared-unverified skills are confirmed", () => {
    const r = scopeSkillsToConfirm({
      linkedSkillIds: new Set([WELD.id, STEEL.id]),
      workerUnverified: [WELD, STEEL, ROOF],
    });
    expect(r.scope).toBe("entry_links");
    expect(r.skills).toEqual([WELD, STEEL]);
    expect(r.skills.map((s) => s.id)).not.toContain(ROOF.id);
  });

  it("entry_links: a linked skill that is already verified is not in the candidate set → nothing to confirm, entry-only tap", () => {
    const r = scopeSkillsToConfirm({
      linkedSkillIds: new Set([WELD.id]),
      workerUnverified: [ROOF], // WELD verified earlier → absent from the unverified list
    });
    expect(r.scope).toBe("entry_links");
    expect(r.skills).toEqual([]);
  });

  it("worker_declared: zero links keeps the previous behaviour — the worker's whole unverified list, disclosed", () => {
    const r = scopeSkillsToConfirm({
      linkedSkillIds: new Set(),
      workerUnverified: [WELD, ROOF],
    });
    expect(r.scope).toBe("worker_declared");
    expect(r.skills).toEqual([WELD, ROOF]);
  });

  it("worker_declared: a FAILED link read means links unknown → same disclosed fallback, never a silent empty list", () => {
    const r = scopeSkillsToConfirm({
      linkedSkillIds: null,
      workerUnverified: [WELD],
    });
    expect(r.scope).toBe("worker_declared");
    expect(r.skills).toEqual([WELD]);
  });

  it("skills_unavailable: a FAILED worker_skills read confirms nothing and is named (not 'no unconfirmed skills')", () => {
    const r = scopeSkillsToConfirm({
      linkedSkillIds: new Set([WELD.id]),
      workerUnverified: null,
    });
    expect(r.scope).toBe("skills_unavailable");
    expect(r.skills).toEqual([]);
  });

  it("never invents a skill: the output is always a subset of the worker's unverified list", () => {
    const r = scopeSkillsToConfirm({
      linkedSkillIds: new Set(["s-unknown", WELD.id]),
      workerUnverified: [WELD],
    });
    expect(r.skills).toEqual([WELD]);
  });

  it("does not mutate its inputs", () => {
    const list = [WELD, STEEL];
    const r = scopeSkillsToConfirm({ linkedSkillIds: new Set(), workerUnverified: list });
    r.skills.push(ROOF);
    expect(list).toEqual([WELD, STEEL]);
  });
});

describe("receiptTitle", () => {
  it("is the entry's own first non-empty line, trimmed", () => {
    expect(receiptTitle("\r\n  Suvirinau metalo konstrukcijas pusautomačiu.\r\nAntra eilutė")).toBe(
      "Suvirinau metalo konstrukcijas pusautomačiu.",
    );
  });

  it("caps long lines with an ellipsis, never invents text", () => {
    const long = "a".repeat(RECEIPT_TITLE_MAX + 40);
    const out = receiptTitle(long);
    expect(out.length).toBe(RECEIPT_TITLE_MAX);
    expect(out.endsWith("…")).toBe(true);
    expect(receiptTitle("")).toBe("");
  });
});
