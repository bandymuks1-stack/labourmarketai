import { describe, expect, it } from "vitest";

import { projectNamedInSentence } from "@/lib/conversation/project-mention";

const P = [
  { value: "a", label: "[QA-SYNTHETIC] Testinis projektas - NEREAGUOTI" },
  { value: "b", label: "Namas Kaune" },
];

describe("the project a sentence names", () => {
  it("matches the core words, through case endings", () => {
    expect(projectNamedInSentence("Pridėk užduotį projektui Testinis projektas: sumontuoti", P)?.value).toBe("a");
    expect(projectNamedInSentence("Užduotis testiniam projektui", P)?.value).toBe("a");
    expect(projectNamedInSentence("Pridėk užduotį namui Kaune", P)?.value).toBe("b");
  });

  it("NEGATIVE: nothing named, or ambiguous, preselects nothing", () => {
    expect(projectNamedInSentence("Pridėk užduotį: sumontuoti pastolius", P)).toBeNull();
    expect(projectNamedInSentence("namas kaune", [...P, { value: "c", label: "Namas" }])).toBeNull();
  });
});
