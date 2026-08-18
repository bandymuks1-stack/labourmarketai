import { describe, expect, it } from "vitest";

import {
  buildEmployerCandidates,
  chooseCanonicalName,
  employerNameKey,
  normalizeEmployerName,
  type EmployerSourceRow,
} from "./employer-identity";

/**
 * The name spellings below are REAL, taken from production `public_vacancies`
 * on 2026-08-18. They are all public bodies or registered companies carrying a
 * legal form (`AB`), so nothing here is personal data.
 *
 * The registry ids are SYNTHETIC on purpose. A Swedish sole trader's
 * organisationsnummer is their personnummer, so real ids from this dataset must
 * not be committed to the repository. The ids only need to be distinct and
 * stable for these tests, and the module never parses them.
 */
const AF = "arbetsformedlingen";

function row(
  employerName: string | null,
  employerExternalOrgId: string | null,
  providerKey = AF,
): EmployerSourceRow {
  return { providerKey, employerName, employerExternalOrgId };
}

describe("normalizeEmployerName", () => {
  it("collapses whitespace and trims, and preserves the source's own casing", () => {
    expect(normalizeEmployerName("  FÄRGELANDA   KOMMUN ")).toBe("FÄRGELANDA KOMMUN");
    expect(normalizeEmployerName("Färgelanda kommun")).toBe("Färgelanda kommun");
  });

  it("treats a decomposed Å as the composed one, so it is not a second company", () => {
    const composed = normalizeEmployerName("Tranås kommun");
    const decomposed = normalizeEmployerName("Tranås kommun".normalize("NFD"));
    expect(decomposed).toBe(composed);
  });

  it("strips trailing punctuation but never a legal form", () => {
    expect(normalizeEmployerName("123ink AB.")).toBe("123ink AB");
    expect(normalizeEmployerName("+46 Sverige AB")).toBe("+46 Sverige AB");
  });

  it("handles null and undefined without throwing", () => {
    expect(normalizeEmployerName(null)).toBe("");
    expect(normalizeEmployerName(undefined)).toBe("");
  });
});

describe("employerNameKey", () => {
  it("folds case", () => {
    expect(employerNameKey("FÄRGELANDA KOMMUN")).toBe(employerNameKey("Färgelanda kommun"));
  });

  it("does NOT strip accents — this layer cannot declare Malmö and Malmo the same", () => {
    expect(employerNameKey("Malmö")).not.toBe(employerNameKey("Malmo"));
  });
});

describe("chooseCanonicalName", () => {
  it("prefers the most frequent spelling", () => {
    expect(
      chooseCanonicalName(new Map([["Skara kommun", 9], ["SKARA KOMMUN", 2]])),
    ).toBe("Skara kommun");
  });

  it("prefers the non-uppercase spelling when counts tie", () => {
    expect(
      chooseCanonicalName(new Map([["HYLTE KOMMUN", 3], ["Hylte kommun", 3]])),
    ).toBe("Hylte kommun");
  });

  it("prefers the parent over a branch when counts tie — shortest wins", () => {
    // Real shape: one registry id carrying the agency and one of its offices.
    expect(
      chooseCanonicalName(
        new Map([["Arbetsförmedlingen Norrköping", 4], ["Arbetsförmedlingen", 4]]),
      ),
    ).toBe("Arbetsförmedlingen");
  });

  /**
   * REGRESSION — real counts from production 2026-08-18. A first draft applied
   * the casing preference across all names, not just spellings of the winning
   * name, and these three cases are what caught it.
   */
  describe("real production groups", () => {
    it("does not let a mixed-case branch office beat the ALL-CAPS company", () => {
      expect(
        chooseCanonicalName(
          new Map([["K-BEMANNING AB", 15], ["K-bemanning Värnamokontoret", 1]]),
        ),
      ).toBe("K-BEMANNING AB");
    });

    it("folds case variants together, then un-shouts the winner", () => {
      // FÖRSVARSMAKTEN 367 + Försvarsmakten 7 = one name, 374 rows.
      expect(
        chooseCanonicalName(new Map([["FÖRSVARSMAKTEN", 367], ["Försvarsmakten", 7]])),
      ).toBe("Försvarsmakten");
    });

    it("beats the branch labels on folded count, then un-shouts", () => {
      expect(
        chooseCanonicalName(
          new Map([
            ["ARBETSFÖRMEDLINGEN", 43],
            ["Arbetsförmedlingen", 1],
            ["Arbetsförmedlingen Norrköping", 1],
            ["SÖDRA GÖTEBORG", 1],
          ]),
        ),
      ).toBe("Arbetsförmedlingen");
    });

    it("keeps a genuinely upper-case dominant spelling", () => {
      // SAAB is an acronym; both observed spellings are upper-case.
      expect(
        chooseCanonicalName(new Map([["SAAB AKTIEBOLAG", 122], ["SAAB AB", 1]])),
      ).toBe("SAAB AKTIEBOLAG");
    });

    it("does not let a one-row placeholder label win", () => {
      // A real row carried "Hänvisning till Arbetsförmedlingen" (referral to the
      // employment agency) under a real company's registry id.
      expect(
        chooseCanonicalName(
          new Map([["AniCura Sweden AB", 19], ["Hänvisning till Arbetsförmedlingen", 1]]),
        ),
      ).toBe("AniCura Sweden AB");
    });

    it("treats a legal-form abbreviation as a different name, resolved by frequency", () => {
      // Aktiebolag <-> AB is extremely common in this source. The registry id
      // already guarantees one entity, so the only question is the label.
      expect(
        chooseCanonicalName(
          new Map([
            ["Tekniska Verken i Kiruna AB", 2],
            ["Tekniska Verken i Kiruna Aktiebolag", 1],
          ]),
        ),
      ).toBe("Tekniska Verken i Kiruna AB");
    });
  });

  it("is independent of insertion order", () => {
    const a = chooseCanonicalName(new Map([["B kommun", 1], ["A kommun", 1]]));
    const b = chooseCanonicalName(new Map([["A kommun", 1], ["B kommun", 1]]));
    expect(a).toBe(b);
    expect(a).toBe("A kommun");
  });
});

describe("buildEmployerCandidates — the case-only variant, 113 of 158 real groups", () => {
  const resolution = buildEmployerCandidates([
    row("Färgelanda kommun", "5560000001"),
    row("FÄRGELANDA KOMMUN", "5560000001"),
    row("Färgelanda kommun", "5560000001"),
  ]);

  it("collapses the spellings into one registry candidate", () => {
    expect(resolution.candidates).toHaveLength(1);
    expect(resolution.candidates[0]!.rowCount).toBe(3);
    expect(resolution.candidates[0]!.confidence).toBe("registry");
  });

  it("keeps the source's own casing as the canonical name", () => {
    expect(resolution.candidates[0]!.canonicalName).toBe("Färgelanda kommun");
  });

  it("records both spellings as evidence and asks the human nothing", () => {
    expect(resolution.candidates[0]!.observedNames).toEqual([
      "FÄRGELANDA KOMMUN",
      "Färgelanda kommun",
    ]);
    expect(resolution.candidates[0]!.unresolved).toEqual([]);
    expect(resolution.stats.registryCandidatesCaseOnlyVariants).toBe(1);
  });
});

describe("buildEmployerCandidates — genuinely different names, 45 of 158 real groups", () => {
  const resolution = buildEmployerCandidates([
    row("Arbetsförmedlingen", "5560000002"),
    row("ARBETSFÖRMEDLINGEN", "5560000002"),
    row("Arbetsförmedlingen Norrköping", "5560000002"),
    row("SÖDRA GÖTEBORG", "5560000002"),
  ]);

  it("still yields ONE candidate — the registry id is the identity", () => {
    expect(resolution.candidates).toHaveLength(1);
    expect(resolution.stats.registryCandidatesMultiName).toBe(1);
  });

  it("leaves the branch names unresolved rather than guessing they are aliases", () => {
    const [candidate] = resolution.candidates;
    expect(candidate!.canonicalName).toBe("Arbetsförmedlingen");
    expect(candidate!.unresolved).toHaveLength(1);
    expect(candidate!.unresolved[0]).toContain("SÖDRA GÖTEBORG");
    expect(candidate!.unresolved[0]).toContain("may be units");
  });
});

describe("INVARIANT 1 — two registry ids never merge", () => {
  it("keeps byte-identical names apart when the registry ids differ", () => {
    const resolution = buildEmployerCandidates([
      row("Nordic Bygg AB", "5560000010"),
      row("Nordic Bygg AB", "5560000011"),
    ]);
    expect(resolution.candidates).toHaveLength(2);
    expect(new Set(resolution.candidates.map((c) => c.registryId))).toEqual(
      new Set(["5560000010", "5560000011"]),
    );
  });

  it("keeps entities apart across providers even with the same id string", () => {
    const resolution = buildEmployerCandidates([
      row("Nordic Bygg AB", "5560000010", "arbetsformedlingen"),
      row("Nordic Bygg AB", "5560000010", "some-other-provider"),
    ]);
    expect(resolution.candidates).toHaveLength(2);
  });
});

describe("INVARIANT 2 — a name-only group never merges into a registry candidate", () => {
  const resolution = buildEmployerCandidates([
    row("Göteborgs Universitet", "5560000020"),
    row("Göteborgs universitet", null),
  ]);

  it("produces two candidates, not one", () => {
    expect(resolution.candidates).toHaveLength(2);
  });

  it("flags the coincidence for a human instead of resolving it", () => {
    const nameOnly = resolution.candidates.find((c) => c.confidence === "name-only");
    expect(nameOnly).toBeDefined();
    expect(nameOnly!.registryId).toBeNull();
    expect(nameOnly!.unresolved.join(" ")).toContain(
      "a shared trade name is not proof of legal identity",
    );
    expect(resolution.stats.nameOnlyCollidingWithRegistry).toBe(1);
  });
});

describe("INVARIANT 3 — registryId is copied, never derived", () => {
  it("does not read an id out of the name", () => {
    const resolution = buildEmployerCandidates([row("Bolag 5560000030 AB", null)]);
    expect(resolution.candidates[0]!.registryId).toBeNull();
    expect(resolution.candidates[0]!.confidence).toBe("name-only");
  });

  it("passes the id through verbatim, including leading zeros", () => {
    const resolution = buildEmployerCandidates([row("Zero Lead AB", "0160000040")]);
    expect(resolution.candidates[0]!.registryId).toBe("0160000040");
  });
});

describe("INVARIANT 4 — the canonical name is always one that was observed", () => {
  it("never synthesises a spelling", () => {
    const names = ["1:a Omtanken AB", "1:A OMTANKEN AB", "12 & 12 BEHANDLINGSHEM AB"];
    const resolution = buildEmployerCandidates([
      row(names[0]!, "5560000050"),
      row(names[1]!, "5560000050"),
      row(names[2]!, "5560000051"),
    ]);
    for (const candidate of resolution.candidates) {
      expect(candidate.observedNames).toContain(candidate.canonicalName);
    }
  });
});

describe("INVARIANT 5 — unusable rows are dropped and counted, never invented", () => {
  it("drops a row with no name and no registry id", () => {
    const resolution = buildEmployerCandidates([
      row(null, null),
      row("   ", null),
      row("Real Company AB", "5560000060"),
    ]);
    expect(resolution.candidates).toHaveLength(1);
    expect(resolution.stats.rowsUnusable).toBe(2);
    expect(resolution.stats.rowsSeen).toBe(3);
  });

  it("keeps a registry row that has no name at all, rather than dropping the entity", () => {
    const resolution = buildEmployerCandidates([row(null, "5560000061")]);
    expect(resolution.candidates).toHaveLength(1);
    expect(resolution.candidates[0]!.canonicalName).toBe("");
    expect(resolution.candidates[0]!.observedNames).toEqual([]);
  });

  it("drops a row with no provider key", () => {
    const resolution = buildEmployerCandidates([row("Orphan AB", "5560000062", "  ")]);
    expect(resolution.candidates).toHaveLength(0);
    expect(resolution.stats.rowsUnusable).toBe(1);
  });
});

describe("determinism", () => {
  const rows: EmployerSourceRow[] = [
    row("Skara kommun", "5560000070"),
    row("SKARA KOMMUN", "5560000070"),
    row("Herrljunga kommun", "5560000071"),
    row("Unregistered Agency", null),
    row("123ink AB", "5560000072"),
  ];

  it("produces identical output regardless of input order", () => {
    const forward = buildEmployerCandidates(rows);
    const reversed = buildEmployerCandidates([...rows].reverse());
    expect(JSON.stringify(reversed.candidates)).toBe(JSON.stringify(forward.candidates));
  });

  it("reports stats that add up", () => {
    const { stats } = buildEmployerCandidates(rows);
    expect(stats.rowsWithRegistryId + stats.rowsNameOnly + stats.rowsUnusable).toBe(
      stats.rowsSeen,
    );
    expect(stats.registryCandidates + stats.nameOnlyCandidates).toBe(
      buildEmployerCandidates(rows).candidates.length,
    );
  });
});

describe("production shape — the measured 2026-08-18 distribution in miniature", () => {
  /**
   * Mirrors the real ratios: almost everything registry-identified, a small
   * tail with no id, one name coinciding across the two populations, and no
   * name shared by two registry ids.
   */
  const rows: EmployerSourceRow[] = [
    ...Array.from({ length: 10 }, () => row("+46 Sverige AB", "5560000080")),
    row("040Wellness AB", "5560000081"),
    row("040WELLNESS AB", "5560000081"),
    row("Huddinge kommun", "5560000082"),
    row("HUDDINGE KOMMUN", "5560000082"),
    row("Sveriges Domstolar", "5560000083"),
    row("Unregistered Staffing", null),
    row("Unregistered Staffing", null),
    row("Sveriges domstolar", null),
  ];

  const { candidates, stats } = buildEmployerCandidates(rows);

  it("resolves 4 registry entities and 2 name-only labels", () => {
    expect(stats.registryCandidates).toBe(4);
    expect(stats.nameOnlyCandidates).toBe(2);
    expect(candidates).toHaveLength(6);
  });

  it("counts the case-only collapses separately from real multi-name groups", () => {
    expect(stats.registryCandidatesCaseOnlyVariants).toBe(2);
    expect(stats.registryCandidatesMultiName).toBe(0);
  });

  it("marks every name-only candidate unresolved, and only those", () => {
    for (const candidate of candidates) {
      if (candidate.confidence === "name-only") {
        expect(candidate.unresolved.length).toBeGreaterThan(0);
      } else {
        expect(candidate.unresolved).toEqual([]);
      }
    }
  });

  it("flags exactly the one name that coincides across both populations", () => {
    expect(stats.nameOnlyCollidingWithRegistry).toBe(1);
  });
});
