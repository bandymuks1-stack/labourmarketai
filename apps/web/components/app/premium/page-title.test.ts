import { describe, expect, it } from "vitest";

import { accentLastWord } from "./page-title";

describe("accentLastWord", () => {
  it("accents exactly the last word of a multi-word title", () => {
    expect(accentLastWord("My projects")).toBe("My *projects*");
    expect(accentLastWord("Your opportunities")).toBe("Your *opportunities*");
  });
  it("leaves a one-word title plain", () => {
    expect(accentLastWord("Marketplace")).toBe("Marketplace");
  });
  it("never lets copy inject an extra accent", () => {
    expect(accentLastWord("A *b* c")).toBe("A b *c*");
  });
});
