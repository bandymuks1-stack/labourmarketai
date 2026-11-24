import { describe, it, expect } from "vitest";
import { mergeSkillSignal } from "./connected-skill-signal";

describe("connected skill signal — honest union", () => {
  it("adds accepted claims as self-declared (never promoted)", () => {
    const r = mergeSkillSignal({ confirmed: 1, suggested: 2, self_declared: 3 }, 4);
    expect(r.confirmed).toBe(1);
    expect(r.supported).toBe(2);
    expect(r.claims).toBe(4);
    expect(r.selfDeclared).toBe(7);
    expect(r.total).toBe(10);
  });
  it("zero claims = capabilities unchanged", () => {
    const r = mergeSkillSignal({ confirmed: 0, suggested: 0, self_declared: 0 }, 0);
    expect(r.total).toBe(0);
    expect(r.claims).toBe(0);
  });
  it("never lets claims inflate confirmed/supported", () => {
    const r = mergeSkillSignal({ confirmed: 0, suggested: 0, self_declared: 0 }, 5);
    expect(r.confirmed).toBe(0);
    expect(r.supported).toBe(0);
    expect(r.selfDeclared).toBe(5);
  });
  it("guards against negative / non-integer claim counts", () => {
    expect(mergeSkillSignal({ confirmed: 0, suggested: 0, self_declared: 1 }, -3).claims).toBe(0);
    expect(mergeSkillSignal({ confirmed: 0, suggested: 0, self_declared: 1 }, 2.9).claims).toBe(2);
  });
});