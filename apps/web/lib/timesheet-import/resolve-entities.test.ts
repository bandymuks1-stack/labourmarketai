import { describe, expect, it } from "vitest";

import {
  normalizeLabel,
  resolveEntityLabel,
} from "@/lib/timesheet-import/resolve-entities";

/**
 * The resolver's one binding rule, tested from both sides: it resolves only
 * an exact or single-unambiguous match, and EVERYTHING else comes back as
 * `ambiguous` (with the candidates) or `unresolved` — never a guess. Hours
 * against the wrong person are the defect this whole surface exists to
 * prevent.
 */

const WORKERS = [
  { id: "w-1", name: "Jonas Kazlauskas" },
  { id: "w-2", name: "Jonas Petrauskas" },
  { id: "w-3", name: "Vitalii Ivanov" },
] as const;

const OBJECTS = [
  { id: "o-1", name: "Object 01 — Peleniškės" },
  { id: "o-2", name: "Object 05 — Sandėlis" },
] as const;

describe("normalizeLabel", () => {
  it("is case- and diacritics-insensitive and collapses punctuation", () => {
    expect(normalizeLabel("PELENIŠKĖS")).toBe(normalizeLabel("peleniskes"));
    expect(normalizeLabel("Object 01 — Peleniškės")).toBe("object 01 peleniskes");
  });
});

describe("resolveEntityLabel", () => {
  it("resolves an exact match, diacritics aside", () => {
    const res = resolveEntityLabel("vitalii ivanov", WORKERS);
    expect(res).toEqual({
      kind: "resolved",
      id: "w-3",
      name: "Vitalii Ivanov",
      match: "exact",
    });
  });

  it("resolves a single unambiguous partial match", () => {
    const res = resolveEntityLabel("Peleniskes", OBJECTS);
    expect(res).toMatchObject({ kind: "resolved", id: "o-1", match: "unambiguous" });
  });

  it("finds the object by the code that lives inside its name", () => {
    expect(resolveEntityLabel("Object 05", OBJECTS)).toMatchObject({
      kind: "resolved",
      id: "o-2",
    });
  });

  it("NEVER auto-picks between two Jonases — the human chooses", () => {
    const res = resolveEntityLabel("Jonas", WORKERS);
    expect(res.kind).toBe("ambiguous");
    if (res.kind !== "ambiguous") return;
    expect(res.candidates.map((c) => c.id).sort()).toEqual(["w-1", "w-2"]);
  });

  it("stays ambiguous even when duplicate names match exactly", () => {
    const twins = [
      { id: "a", name: "Jonas Kazlauskas" },
      { id: "b", name: "Jonas Kazlauskas" },
    ];
    expect(resolveEntityLabel("Jonas Kazlauskas", twins).kind).toBe("ambiguous");
  });

  it("returns unresolved for a label nothing matches, never an invention", () => {
    expect(resolveEntityLabel("Kazimieras", WORKERS)).toEqual({ kind: "unresolved" });
    expect(resolveEntityLabel("", WORKERS)).toEqual({ kind: "unresolved" });
  });

  it("does not let a short numeric token match by prefix (01 is not 010)", () => {
    const objects = [
      { id: "x", name: "Object 010" },
      { id: "y", name: "Object 01" },
    ];
    expect(resolveEntityLabel("Object 01", objects)).toMatchObject({
      kind: "resolved",
      id: "y",
      match: "exact",
    });
  });
});
