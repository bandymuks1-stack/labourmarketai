import { describe, expect, it } from "vitest";
import {
  extractProfileSkillClaims,
  normalizeClaimLabel,
} from "./skill-claim-extractor";

describe("extractProfileSkillClaims", () => {
  it("returns empty for empty / null / non-string input", () => {
    expect(extractProfileSkillClaims("")).toEqual([]);
    expect(extractProfileSkillClaims("   ")).toEqual([]);
    expect(extractProfileSkillClaims(null)).toEqual([]);
    expect(extractProfileSkillClaims(undefined)).toEqual([]);
  });

  // Anchor example from the slice goal — both Lithuanian skills must surface.
  it("extracts 'Programavimas' and 'Namų statyba' from the goal example", () => {
    const result = extractProfileSkillClaims(
      "Moku gerai programuoti ir statyti namus",
    );
    const labels = result.map((r) => r.label);
    expect(labels).toContain("Programavimas");
    expect(labels).toContain("Namų statyba");
  });

  it("maps 'programuoti' (LT verb) → 'Programavimas'", () => {
    const result = extractProfileSkillClaims("Aš moku programuoti C# kalba.");
    expect(result.map((r) => r.label)).toContain("Programavimas");
  });

  it("maps 'statyti namus' → 'Namų statyba'", () => {
    const result = extractProfileSkillClaims(
      "Per 10 metų pastatėme daug namų — moku statyti namus nuo nulio.",
    );
    expect(result.map((r) => r.label)).toContain("Namų statyba");
  });

  it("maps English 'coding' → 'Programavimas'", () => {
    const result = extractProfileSkillClaims("I've been coding for ten years.");
    expect(result.map((r) => r.label)).toContain("Programavimas");
  });

  it("maps English 'plumbing' → 'Santechnika'", () => {
    const result = extractProfileSkillClaims(
      "Mostly residential plumbing work.",
    );
    expect(result.map((r) => r.label)).toContain("Santechnika");
  });

  // Anchor: the owner's PR #46 follow-up production sentence. The first
  // three skills were already mapped by PR #46; the cooking phrase
  // ("gaminti lietuviškos virtuvės patiekalus") was the dictionary gap
  // the hotfix fills.
  it("extracts all four canonical claims from the extended owner sentence", () => {
    const result = extractProfileSkillClaims(
      "Moku gerai programuoti ir statyti namus, dengti stogus ir gaminti lietuviškos virtuvės patiekalus",
    );
    const labels = result.map((r) => r.label);
    expect(labels).toContain("Programavimas");
    expect(labels).toContain("Namų statyba");
    expect(labels).toContain("Stogų dengimas");
    expect(labels).toContain("Maisto gamyba");
  });

  it("maps 'dengti stogus' → 'Stogų dengimas' (new label)", () => {
    const result = extractProfileSkillClaims(
      "Per 5 metus dengėme stogus visoje Lietuvoje.",
    );
    expect(result.map((r) => r.label)).toContain("Stogų dengimas");
    // Old label gone — preventing accidental dual-label drift if a future
    // PR re-introduces "Stogo darbai" alongside.
    expect(result.map((r) => r.label)).not.toContain("Stogo darbai");
  });

  it("maps 'gaminti lietuviškos virtuvės patiekalus' → 'Maisto gamyba'", () => {
    const result = extractProfileSkillClaims(
      "Mėgstu gaminti lietuviškos virtuvės patiekalus.",
    );
    expect(result.map((r) => r.label)).toContain("Maisto gamyba");
  });

  it("maps English 'cooking' / 'chef' → 'Maisto gamyba'", () => {
    expect(
      extractProfileSkillClaims("Have a passion for cooking traditional dishes.").map(
        (r) => r.label,
      ),
    ).toContain("Maisto gamyba");
    expect(
      extractProfileSkillClaims("Worked as a chef in two restaurants.").map(
        (r) => r.label,
      ),
    ).toContain("Maisto gamyba");
  });

  it("does not duplicate when multiple needles for the same label hit", () => {
    const result = extractProfileSkillClaims(
      "Programuoju, programavimas yra mano stiprybė, frontend ir backend.",
    );
    const programmingCount = result.filter(
      (r) => r.label === "Programavimas",
    ).length;
    expect(programmingCount).toBe(1);
  });

  it("returns labels in stable dictionary order across runs", () => {
    const a = extractProfileSkillClaims(
      "Dažau, muriju ir programuoju.",
    ).map((r) => r.label);
    const b = extractProfileSkillClaims(
      "Programuoju, muriju, dažau.",
    ).map((r) => r.label);
    // Same set of labels regardless of input order — dictionary ordering wins.
    expect(new Set(a)).toEqual(new Set(b));
    expect(a).toEqual(b);
  });

  it("each suggestion carries a lowercased normalizedLabel", () => {
    const result = extractProfileSkillClaims("Dirbu statybose");
    for (const r of result) {
      expect(r.normalizedLabel).toBe(r.label.toLowerCase());
    }
  });

  it("returns empty for unrelated narrative (no false positives)", () => {
    const result = extractProfileSkillClaims(
      "Mėgstu skaityti knygas ir keliauti.",
    );
    expect(result).toEqual([]);
  });

  it("hard caps input length and still extracts cleanly", () => {
    const long = "x ".repeat(3000) + " programuoti";
    const result = extractProfileSkillClaims(long);
    // The "programuoti" sits past the MAX_INPUT_CHARS cap, so the extractor
    // should NOT find it — proves the cap is enforced.
    expect(result.map((r) => r.label)).not.toContain("Programavimas");
  });

  // ── Idea-based extraction anchors (feat/cc/profile-save-state-and-idea-extraction) ──
  // Goal upgrade: the dictionary now covers PHRASES + TOOLS + RESPONSIBILITIES,
  // not just exact-string skill needles. Each describe-block below is one
  // principle from the goal doc (activity / tool / responsibility / domain).

  describe("Activity phrase → Medienos apdirbimas", () => {
    it("drožti iš medžio (activity verb + material)", () => {
      const labels = extractProfileSkillClaims(
        "Mokam drožti iš medžio nuo vaikystės.",
      ).map((r) => r.label);
      expect(labels).toContain("Medienos apdirbimas");
    });
    it("medžio darbai (material + work)", () => {
      const labels = extractProfileSkillClaims(
        "Dirbu medžio darbus daugiau nei 10 metų.",
      ).map((r) => r.label);
      expect(labels).toContain("Medienos apdirbimas");
    });
    it("EN carpentry / woodwork", () => {
      expect(
        extractProfileSkillClaims("Hobby: carpentry on weekends.").map(
          (r) => r.label,
        ),
      ).toContain("Medienos apdirbimas");
      expect(
        extractProfileSkillClaims("20 years of woodwork experience.").map(
          (r) => r.label,
        ),
      ).toContain("Medienos apdirbimas");
    });
  });

  describe("Tool mention → Dokumentų tvarkymas", () => {
    it("dokumentai", () => {
      expect(
        extractProfileSkillClaims("Tvarkau dokumentus biure.").map(
          (r) => r.label,
        ),
      ).toContain("Dokumentų tvarkymas");
    });
    it("Word / Excel / PDF → tool-specific chips", () => {
      // feat/cc/profile-max-capability-capture: each office tool now
      // gets its own specialization chip so the user sees that the
      // system recognised the specific tool, not just generic
      // document work. Dokumentų tvarkymas still surfaces when the
      // text says "dokumentai" / "office" / etc.
      const labels = extractProfileSkillClaims(
        "Dirbu su Word, Excel ir PDF failais kasdien.",
      ).map((r) => r.label);
      expect(labels).toContain("Word dokumentai");
      expect(labels).toContain("Excel / Skaičiuoklės");
      expect(labels).toContain("PDF dokumentai");
    });
    it("dokumentai stem AND parent chip", () => {
      // Plain "dokumentai" / "dokumentus" still surfaces the parent.
      const labels = extractProfileSkillClaims(
        "Tvarkau dokumentus ir užsiimu administravimu.",
      ).map((r) => r.label);
      expect(labels).toContain("Dokumentų tvarkymas");
    });
  });

  describe("Business-tool mention → Apskaitos sistemos", () => {
    it("Rivilė ERP", () => {
      expect(
        extractProfileSkillClaims("Pildau dokumentus Rivilė aplinkoje.").map(
          (r) => r.label,
        ),
      ).toContain("Apskaitos sistemos");
    });
    it("generic apskaita stem", () => {
      expect(
        extractProfileSkillClaims("Dirbu su apskaitos programa.").map(
          (r) => r.label,
        ),
      ).toContain("Apskaitos sistemos");
    });
  });

  describe("Responsibility phrase → Komandos koordinavimas / Darbuotojų paieška", () => {
    it("koordinuoti komandą → Komandos koordinavimas", () => {
      const labels = extractProfileSkillClaims(
        "Galiu koordinuoti komandą nuo 5 iki 20 žmonių.",
      ).map((r) => r.label);
      expect(labels).toContain("Komandos koordinavimas");
    });
    it("ieškoti darbuotojų → Darbuotojų paieška", () => {
      const labels = extractProfileSkillClaims(
        "Per kelias savaites surandu ir atrenku naujus darbuotojus.",
      ).map((r) => r.label);
      expect(labels).toContain("Darbuotojų paieška");
    });
    it("EN recruit / hiring → Darbuotojų paieška", () => {
      expect(
        extractProfileSkillClaims("Have led recruit campaigns.").map(
          (r) => r.label,
        ),
      ).toContain("Darbuotojų paieška");
      expect(
        extractProfileSkillClaims("Hiring engineers for a startup.").map(
          (r) => r.label,
        ),
      ).toContain("Darbuotojų paieška");
    });
  });

  // ── Specialization + new-domain anchors (feat/cc/profile-max-capability-capture) ──

  describe("Specialization: Lietuviškos virtuvės gamyba alongside Maisto gamyba", () => {
    it("parent + specialization both fire for 'lietuviškos virtuvės patiekalus'", () => {
      const labels = extractProfileSkillClaims(
        "Gaminu lietuviškos virtuvės patiekalus kasdien.",
      ).map((r) => r.label);
      expect(labels).toContain("Maisto gamyba");
      expect(labels).toContain("Lietuviškos virtuvės gamyba");
    });
    it("specialization-only when text only has the LT-cuisine phrase", () => {
      const labels = extractProfileSkillClaims(
        "Specializuojuosi lietuviška virtuve.",
      ).map((r) => r.label);
      expect(labels).toContain("Lietuviškos virtuvės gamyba");
    });
  });

  describe("Specialization: Drožyba alongside Medienos apdirbimas", () => {
    it("parent + specialization both fire for 'drožti iš medžio'", () => {
      const labels = extractProfileSkillClaims(
        "Moku drožti iš medžio nuo mažumės.",
      ).map((r) => r.label);
      expect(labels).toContain("Medienos apdirbimas");
      expect(labels).toContain("Drožyba");
    });
  });

  describe("Specialization: tool-specific chips inside the Dokumentų cluster", () => {
    it("Word / Excel / PDF → tool chips + parent stays available via 'dokumentus'", () => {
      const labels = extractProfileSkillClaims(
        "Dirbu su Word, Excel ir PDF dokumentais.",
      ).map((r) => r.label);
      expect(labels).toContain("Word dokumentai");
      expect(labels).toContain("Excel / Skaičiuoklės");
      expect(labels).toContain("PDF dokumentai");
      expect(labels).toContain("Dokumentų tvarkymas");
    });
  });

  describe("Specialization: Rivilė alongside Apskaitos sistemos", () => {
    it("explicit product name surfaces both chips", () => {
      const labels = extractProfileSkillClaims(
        "Pildau dokumentus Rivilė aplinkoje.",
      ).map((r) => r.label);
      expect(labels).toContain("Rivilė");
      expect(labels).toContain("Apskaitos sistemos");
    });
  });

  describe("Specialization: Santechnikos montavimas alongside Santechnika", () => {
    it("'santechnikos montavimu' → both general + specialization", () => {
      const labels = extractProfileSkillClaims(
        "Užsiimu santechnikos montavimu.",
      ).map((r) => r.label);
      expect(labels).toContain("Santechnika");
      expect(labels).toContain("Santechnikos montavimas");
    });
  });

  describe("Specialization: Lengvojo automobilio vairavimas alongside Vairavimas", () => {
    it("'vairuoti lengvąjį automobilį' → both chips", () => {
      const labels = extractProfileSkillClaims(
        "Galiu vairuoti lengvąjį automobilį.",
      ).map((r) => r.label);
      expect(labels).toContain("Vairavimas");
      expect(labels).toContain("Lengvojo automobilio vairavimas");
    });
  });

  describe("Pardavimai (new domain)", () => {
    it("'pardavėju' → Pardavimai", () => {
      const labels = extractProfileSkillClaims(
        "Dirbu pardavėju penkis metus.",
      ).map((r) => r.label);
      expect(labels).toContain("Pardavimai");
    });
    it("EN 'sales' / 'selling' → Pardavimai", () => {
      expect(
        extractProfileSkillClaims("Have run B2B sales teams.").map(
          (r) => r.label,
        ),
      ).toContain("Pardavimai");
    });
  });

  describe("Sutarčių ruošimas (new domain)", () => {
    it("'sutartis ir teisinius dokumentus' → Sutarčių ruošimas", () => {
      const labels = extractProfileSkillClaims(
        "Ruošiu sutartis ir teisinius dokumentus.",
      ).map((r) => r.label);
      expect(labels).toContain("Sutarčių ruošimas");
    });
    it("EN 'contract preparation' → Sutarčių ruošimas", () => {
      expect(
        extractProfileSkillClaims("Years of contract preparation work.").map(
          (r) => r.label,
        ),
      ).toContain("Sutarčių ruošimas");
    });
  });

  // ── Cross-sector proof inputs (feat/cc/cross-sector-skills, mandate §8.7) ──
  // The recognizer must fire across sectors, not just construction. Each line
  // is a real worker proof sentence from the mandate; recognition must produce
  // at least one honest self-declared claim chip (free-label fallback still
  // saves anything unmatched, but these must be RECOGNISED, not dropped).
  describe("Cross-sector recognition of the mandate proof inputs", () => {
    const CASES: ReadonlyArray<readonly [string, string]> = [
      ["Gaminau maistą virtuvėje 8 valandas", "Maisto gamyba"],
      ["Dirbau sandėlyje su užsakymų surinkimu", "Sandėlio / logistikos darbai"],
      ["Vairavau mikroautobusą į objektą", "Vairavimas"],
      ["Valiau patalpas po remonto", "Valymo darbai"],
      ["Prižiūrėjau sodą ir pjoviau žolę", "Sodininkystė / aplinkos tvarkymas"],
      ["Padėjau senyvo amžiaus žmogui", "Asmens priežiūra / globa"],
      ["Tvarkiau klientų užklausas", "Klientų aptarnavimas"],
      ["Dirbau su Excel / kompiuteriu", "Excel / Skaičiuoklės"],
      ["Kalbu lietuviškai, angliškai ir rusiškai", "Kalbų mokėjimas"],
      ["Dirbau su krautuvu / įranga", "Sunkiosios technikos operavimas"],
    ];
    for (const [text, expected] of CASES) {
      it(`recognises "${text}" → ${expected}`, () => {
        const labels = extractProfileSkillClaims(text).map((r) => r.label);
        expect(labels).toContain(expected);
      });
    }
  });

  describe("Broad owner narrative — at least 15 capabilities from one paragraph", () => {
    // Anchor: the PR #49 follow-up production smoke text — narrower
    // than the goal's full sample, kept short enough to reason about
    // line-by-line. The dictionary upgrade must produce at least the
    // listed broad set so the test fails if a future PR narrows or
    // breaks phrase-stem / specialization matching.
    it("extended owner sentence with construction + IT + cooking + woodwork + office + ERP + team + recruitment + plumbing + sales + driving + legal docs → ≥15 chips", () => {
      const text =
        "Moku gerai programuoti ir statyti namus, dengti stogus ir gaminti " +
        "lietuviškos virtuvės patiekalus. taip pat moku drožti iš medžio, " +
        "bei dirbti su word, excel ir pdf dokumentais rivilė aplinkoje ir " +
        "galiu koordinuoti komanda bei ieškoti naujų žmonių ir darbuotojų. " +
        "Turiu teisinės patirties, ruošiu sutartis ir teisinius dokumentus. " +
        "Galiu vairuoti lengvąjį automobilį, taip pat užsiimu santechnikos " +
        "montavimu ir dirbu pardavėju.";
      const labels = extractProfileSkillClaims(text).map((r) => r.label);

      for (const expected of [
        // baseline + specializations
        "Programavimas",
        "Namų statyba",
        "Stogų dengimas",
        "Maisto gamyba",
        "Lietuviškos virtuvės gamyba",
        "Medienos apdirbimas",
        "Drožyba",
        "Word dokumentai",
        "Excel / Skaičiuoklės",
        "PDF dokumentai",
        "Dokumentų tvarkymas",
        "Rivilė",
        "Apskaitos sistemos",
        "Komandos koordinavimas",
        "Darbuotojų paieška",
        // new domains
        "Sutarčių ruošimas",
        "Vairavimas",
        "Lengvojo automobilio vairavimas",
        "Santechnika",
        "Santechnikos montavimas",
        "Pardavimai",
      ]) {
        expect(
          labels,
          `missing ${expected} for full owner narrative`,
        ).toContain(expected);
      }
      // Hard floor — guard against an accidental regression that
      // narrows the dictionary or breaks parent+specialization
      // double-matching.
      expect(labels.length).toBeGreaterThanOrEqual(15);
    });

    // Keep the prior PR #49 anchor too — it covers the shorter sentence
    // and prevents regressing the "doubled the 4-chip baseline" claim.
    it("PR #49 baseline anchor (shorter sentence) still passes", () => {
      const text =
        "Moku gerai programuoti ir statyti namus, dengti stogus ir gaminti " +
        "lietuviškos virtuvės patiekalus. taip pat moku drožti iš medžio, " +
        "bei dirbti su word, excel ir pdf dokumentais rivilė aplinkoje ir " +
        "galiu koordinuoti komanda bei ieškoti naujų žmonių ir darbuotojų";
      const labels = extractProfileSkillClaims(text).map((r) => r.label);

      // Baseline chips from prior PRs — must continue to appear.
      expect(labels).toContain("Programavimas");
      expect(labels).toContain("Namų statyba");
      expect(labels).toContain("Stogų dengimas");
      expect(labels).toContain("Maisto gamyba");

      // New idea-based chips — the actual upgrade this slice ships.
      expect(labels).toContain("Medienos apdirbimas");
      expect(labels).toContain("Dokumentų tvarkymas");
      expect(labels).toContain("Apskaitos sistemos");
      expect(labels).toContain("Komandos koordinavimas");
      expect(labels).toContain("Darbuotojų paieška");

      // Catches a regression that narrows the new dictionary by
      // accident — the prior 4-chip baseline should be at least
      // doubled.
      expect(labels.length).toBeGreaterThanOrEqual(8);
    });
  });
});

describe("normalizeClaimLabel", () => {
  it("trims, lowercases, collapses whitespace", () => {
    expect(normalizeClaimLabel("  Programavimas  ")).toBe("programavimas");
    expect(normalizeClaimLabel("Namų   statyba")).toBe("namų statyba");
    expect(normalizeClaimLabel("ELEKTROS\tDARBAI")).toBe("elektros darbai");
  });
});
