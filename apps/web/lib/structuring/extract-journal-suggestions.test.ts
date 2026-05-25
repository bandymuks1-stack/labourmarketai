import { describe, expect, it } from "vitest";
import { extractJournalSuggestions } from "./extract-journal-suggestions";

describe("extractJournalSuggestions (rule-based, LT)", () => {
  it("returns an empty result for blank input", () => {
    const s = extractJournalSuggestions("");
    expect(s.hasAny).toBe(false);
  });

  it("parses hours, m², skills, and a site mention from a typical entry", () => {
    const text =
      "Dirbau 8 valandas. Montavau gipso lubas, padariau apie 35 m², dėjau profilius ir tvarkiau angokraščius. Objektas: Vilnius, Konstitucijos pr. 14.";
    const s = extractJournalSuggestions(text);
    expect(s.time).toEqual({ value: 8, unitSlug: "hours" });
    expect(s.quantity).toEqual({ value: 35, unitSlug: "square_meters" });
    expect(s.skillSlugs).toContain("drywall");
    expect(s.skillSlugs).toContain("ceiling-systems");
    expect(s.siteName).toContain("Vilnius");
    expect(s.hasAny).toBe(true);
  });

  it("recognises days as a time unit when no hours are mentioned", () => {
    const s = extractJournalSuggestions("Dirbau 2 dienas objektuose.");
    expect(s.time).toEqual({ value: 2, unitSlug: "days" });
  });

  it("recognises minutes", () => {
    const s = extractJournalSuggestions("Tvarkiau 45 minutes santechniką.");
    expect(s.time?.unitSlug).toBe("minutes");
    expect(s.time?.value).toBe(45);
  });

  it("returns hasAny=false when no rules match", () => {
    const s = extractJournalSuggestions("aaa bbb ccc");
    expect(s.hasAny).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-fragment LT parser — the journal-evidence-loop P0 supersprint contract.
// The owner sentence MUST produce three time + three activity suggestions or
// the worker has no honest way to log a mixed day.
// ─────────────────────────────────────────────────────────────────────────────

describe("extractJournalSuggestions — multi-fragment LT (owner sentence)", () => {
  const ownerSentence =
    "Valandą dirbau pavežėju. 3 valandas parduotuvėje kasininku, ir 5 valandas padėjau dengti stogą.";

  it("detects all three time fragments (1h, 3h, 5h)", () => {
    const s = extractJournalSuggestions(ownerSentence);
    const timeValues = s.fragments
      .filter((f) => f.time !== null)
      .map((f) => `${f.time!.value}${f.time!.unitSlug}`);
    expect(timeValues).toEqual(["1hours", "3hours", "5hours"]);
  });

  it("detects all three work-direction fragments (driver, cashier, roofing)", () => {
    const s = extractJournalSuggestions(ownerSentence);
    const labels = s.fragments.map((f) => f.activityLabel);
    // Exact labels live in keywords.ts; we just need the three concepts present.
    expect(labels.join("|")).toMatch(/pavežėjimas/i);
    expect(labels.join("|")).toMatch(/kasininko|parduotuvės/i);
    expect(labels.join("|")).toMatch(/stogo/i);
  });

  it("returns exactly three fragments for the owner sentence", () => {
    const s = extractJournalSuggestions(ownerSentence);
    expect(s.fragments).toHaveLength(3);
  });

  it("preserves the raw phrase per fragment so the UI can show evidence", () => {
    const s = extractJournalSuggestions(ownerSentence);
    expect(s.fragments[0].rawPhrase.toLowerCase()).toContain("valandą");
    expect(s.fragments[1].rawPhrase).toContain("3 valandas");
    expect(s.fragments[2].rawPhrase).toContain("5 valandas");
  });

  it("does not mark fragments as a verified slug for cashier/driver (no fake taxonomy)", () => {
    const s = extractJournalSuggestions(ownerSentence);
    const cashier = s.fragments.find((f) =>
      f.rawPhrase.toLowerCase().includes("kasinink"),
    );
    const driver = s.fragments.find((f) =>
      f.rawPhrase.toLowerCase().includes("pavežėj"),
    );
    expect(cashier?.activitySlug).toBeNull();
    expect(driver?.activitySlug).toBeNull();
    // But the human label is set so the worker sees the work direction.
    expect(cashier?.activityLabel).not.toBeNull();
    expect(driver?.activityLabel).not.toBeNull();
  });
});

describe("extractJournalSuggestions — LT word-form numerics", () => {
  it("parses bare 'valandą' as 1 hour", () => {
    const s = extractJournalSuggestions("Valandą dirbau pavežėju.");
    expect(s.fragments[0]?.time).toEqual({ value: 1, unitSlug: "hours" });
  });

  it("parses 'vieną valandą' as 1 hour", () => {
    const s = extractJournalSuggestions("Vieną valandą dirbau pavežėju.");
    expect(s.time).toEqual({ value: 1, unitSlug: "hours" });
  });

  it("parses '1 valandą' as 1 hour", () => {
    const s = extractJournalSuggestions("1 valandą dirbau pavežėju.");
    expect(s.time).toEqual({ value: 1, unitSlug: "hours" });
  });

  it("parses 'pusvalandį' as half an hour", () => {
    const s = extractJournalSuggestions("Pusvalandį tvarkiau įrankius.");
    expect(s.fragments[0]?.time).toEqual({ value: 0.5, unitSlug: "hours" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v2 — LT number-words for hours / minutes / days, plus three new activity
// directions (door + window, roof framing, project preparation).
// ─────────────────────────────────────────────────────────────────────────────

describe("extractJournalSuggestions — v2 LT number-word numerics", () => {
  it("parses 'keturias valandas' as 4 hours", () => {
    const s = extractJournalSuggestions("Keturias valandas dirbau objektuose.");
    expect(s.fragments[0]?.time).toEqual({ value: 4, unitSlug: "hours" });
  });

  it("parses 'dvi valandas' as 2 hours", () => {
    const s = extractJournalSuggestions("Dvi valandas dirbau pavežėju.");
    expect(s.fragments[0]?.time).toEqual({ value: 2, unitSlug: "hours" });
  });

  it("parses 'penkiolika minučių' as 15 minutes", () => {
    const s = extractJournalSuggestions(
      "Penkiolika minučių valiau įrankius.",
    );
    expect(s.fragments[0]?.time).toEqual({ value: 15, unitSlug: "minutes" });
  });

  it("merges 'Dvi valandas ir penkiolika minučių rengiau projektą' into ONE fragment (135 min + projekto rengimas) — v4 pairing fix", () => {
    // Pre-v4 the parser split into two fragments here; the time-only
    // leading clause is now merged into the activity-bearing clause
    // because that's what a worker means by "Dvi valandas ir penkiolika
    // minučių rengiau projektą".
    const s = extractJournalSuggestions(
      "Dvi valandas ir penkiolika minučių rengiau projektą.",
    );
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].time).toEqual({ value: 135, unitSlug: "minutes" });
    expect(s.fragments[0].activityLabel).toMatch(/projekto rengim/i);
  });

  it("parses 'tris dienas' as 3 days", () => {
    const s = extractJournalSuggestions("Tris dienas dirbau aikštelėje.");
    expect(s.fragments[0]?.time).toEqual({ value: 3, unitSlug: "days" });
  });

  it("digit form still wins when both number-word and digit are present", () => {
    const s = extractJournalSuggestions("8 valandas dirbau.");
    expect(s.fragments[0]?.time).toEqual({ value: 8, unitSlug: "hours" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v3 — compound durations (1h20, 1.5h), institution + topic extractors,
// new activity verticals (app testing, programming, plastering, horse care,
// lectures), and unknown-phrase flagging.
// ─────────────────────────────────────────────────────────────────────────────

describe("extractJournalSuggestions — v3 compound LT durations", () => {
  it("'valandą dvidešimt minučių' yields 80 minutes (1h20)", () => {
    const s = extractJournalSuggestions(
      "Valandą dvidešimt minučių programavau pataisymus.",
    );
    expect(s.fragments[0]?.time).toEqual({ value: 80, unitSlug: "minutes" });
  });

  it("'valandą su puse' yields 1.5 hours", () => {
    const s = extractJournalSuggestions(
      "Valandą su puse dėsčiau paskaitą.",
    );
    expect(s.fragments[0]?.time).toEqual({ value: 1.5, unitSlug: "hours" });
  });

  it("'2 valandas 30 minučių' yields 150 minutes", () => {
    const s = extractJournalSuggestions("2 valandas 30 minučių dirbau.");
    expect(s.fragments[0]?.time).toEqual({ value: 150, unitSlug: "minutes" });
  });

  it("'15 minučių' alone yields 15 minutes (no hour contribution)", () => {
    const s = extractJournalSuggestions(
      "15 minučių atlikau programėlės patikrinimą.",
    );
    expect(s.fragments[0]?.time).toEqual({ value: 15, unitSlug: "minutes" });
  });
});

describe("extractJournalSuggestions — v3 institution + topic", () => {
  it("captures 'Vytauto Didžiojo universitete' as the institution", () => {
    const s = extractJournalSuggestions(
      "Valandą su puse dėsčiau paskaitą Vytauto Didžiojo universitete.",
    );
    expect(s.institutionName).toMatch(/Vytauto\s+Didžiojo\s+universitete/i);
  });

  it("captures a single-word institution 'Vilniaus kolegijoje'", () => {
    const s = extractJournalSuggestions(
      "Dvi valandas dėsčiau Vilniaus kolegijoje.",
    );
    expect(s.institutionName).toMatch(/Vilniaus\s+kolegijoje/i);
  });

  it("captures topic prefixed with 'tema:'", () => {
    const s = extractJournalSuggestions(
      "Dėsčiau paskaitą, tema: oratorystės meno taikymas dirbtinio intelekto rinkos pritaikymui verslo pasaulyje.",
    );
    expect(s.topic).toMatch(/oratorystės meno taikymas/i);
  });

  it("returns null for institution/topic when not present", () => {
    const s = extractJournalSuggestions("Dvi valandas dirbau.");
    expect(s.institutionName).toBeNull();
    expect(s.topic).toBeNull();
  });
});

describe("extractJournalSuggestions — v3 activity verticals", () => {
  it("'atlikau programėlės patikrinimą' → app testing", () => {
    const s = extractJournalSuggestions(
      "15 minučių atlikau programėlės patikrinimą.",
    );
    expect(s.fragments[0]?.activityLabel).toMatch(/programėlės/i);
    expect(s.fragments[0]?.activityLabel).toMatch(/testavim/i);
    expect(s.fragments[0]?.isUnknown).toBe(false);
  });

  it("'programavau pataisymus' → programming/fixes", () => {
    const s = extractJournalSuggestions(
      "Valandą dvidešimt minučių programavau pataisymus.",
    );
    expect(s.fragments[0]?.activityLabel).toMatch(/programavim/i);
  });

  it("'glaiščiau sienas' → wall plastering", () => {
    const s = extractJournalSuggestions("4 valandas glaiščiau sienas.");
    expect(s.fragments[0]?.activityLabel).toMatch(/sien/i);
    expect(s.fragments[0]?.activityLabel).toMatch(/glaistym|lygin/i);
  });

  it("'prižiūrėjau žirgus' → horse care", () => {
    const s = extractJournalSuggestions("Dvi valandas prižiūrėjau žirgus.");
    expect(s.fragments[0]?.activityLabel).toMatch(/žirg/i);
  });

  it("'dėsčiau paskaitą' → lecture/teaching", () => {
    const s = extractJournalSuggestions(
      "Valandą su puse dėsčiau paskaitą Vytauto Didžiojo universitete.",
    );
    expect(s.fragments[0]?.activityLabel).toMatch(/paskait/i);
  });
});

describe("extractJournalSuggestions — v4 fragment-to-time pairing (merge)", () => {
  it("merges 'Dvi valandas ir penkiolika minučių glaiščiau sienas' into ONE fragment (2h15min = 135 min, glaistymas)", () => {
    const s = extractJournalSuggestions(
      "Dvi valandas ir penkiolika minučių glaiščiau sienas.",
    );
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].time).toEqual({ value: 135, unitSlug: "minutes" });
    expect(s.fragments[0].activityLabel).toMatch(/glaistym|lygin/i);
  });

  it("merges 'Valandą su puse ir penkiolika minučių prižiūrėjau žirgus' into ONE (1.5h + 15min = 105 min, žirgų priežiūra)", () => {
    const s = extractJournalSuggestions(
      "Valandą su puse ir penkiolika minučių prižiūrėjau žirgus.",
    );
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].time).toEqual({ value: 105, unitSlug: "minutes" });
    expect(s.fragments[0].activityLabel).toMatch(/žirg/i);
  });

  it("does NOT merge when the leading fragment already has an activity", () => {
    const s = extractJournalSuggestions(
      "3 valandas dirbau objektuose ir 5 valandas prižiūrėjau žirgus.",
    );
    expect(s.fragments).toHaveLength(2);
    expect(s.fragments[1].activityLabel).toMatch(/žirg/i);
  });

  it("leaves a stand-alone time-only fragment as unknown when no next fragment to merge with", () => {
    const s = extractJournalSuggestions("Dvi valandas.");
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].isUnknown).toBe(true);
  });
});

describe("extractJournalSuggestions — v3 unknown-phrase flag", () => {
  it("fragment with time + unrecognised activity is marked isUnknown", () => {
    const s = extractJournalSuggestions(
      "Dvi valandas svorį kilnojau pajūryje.",
    );
    expect(s.fragments[0]?.isUnknown).toBe(true);
    expect(s.fragments[0]?.activitySlug).toBeNull();
    expect(s.fragments[0]?.activityLabel).toBeNull();
    expect(s.fragments[0]?.time).toEqual({ value: 2, unitSlug: "hours" });
  });

  it("fragment with recognised activity is NOT marked isUnknown", () => {
    const s = extractJournalSuggestions("Dvi valandas montavau duris.");
    expect(s.fragments[0]?.isUnknown).toBe(false);
  });
});

describe("extractJournalSuggestions — owner v3 long sentence", () => {
  const ownerV3 =
    "15 minučių atlikau programėlės patikrinimą, " +
    "valandą dvidešimt minučių programavau pataisymus. " +
    "4 valandas glaiščiau sienas ir " +
    "dvi valandas prižiūrėjau žirgus ir " +
    "valandą su puse dėsčiau paskaitą Vytauto Didžiojo universitete, " +
    "tema: oratorystės meno taikymas dirbtinio intelekto rinkos pritaikymui verslo pasaulyje";

  it("yields five work fragments", () => {
    const s = extractJournalSuggestions(ownerV3);
    expect(s.fragments).toHaveLength(5);
  });

  it("detects all five durations (15min, 80min, 4h, 2h, 1.5h)", () => {
    const s = extractJournalSuggestions(ownerV3);
    const times = s.fragments
      .filter((f) => f.time)
      .map((f) => `${f.time!.value}${f.time!.unitSlug}`);
    expect(times).toEqual([
      "15minutes",
      "80minutes",
      "4hours",
      "2hours",
      "1.5hours",
    ]);
  });

  it("detects all five activity directions", () => {
    const s = extractJournalSuggestions(ownerV3);
    const labels = s.fragments.map((f) => f.activityLabel).join("|");
    expect(labels).toMatch(/programėlės/i); // app testing
    expect(labels).toMatch(/programavim/i); // programming
    expect(labels).toMatch(/glaistym|lygin/i); // wall plastering
    expect(labels).toMatch(/žirg/i); // horse care
    expect(labels).toMatch(/paskait/i); // lecture
  });

  it("extracts institution = 'Vytauto Didžiojo universitete'", () => {
    const s = extractJournalSuggestions(ownerV3);
    expect(s.institutionName).toMatch(/Vytauto\s+Didžiojo\s+universitete/i);
  });

  it("extracts topic = the oratory/AI string", () => {
    const s = extractJournalSuggestions(ownerV3);
    expect(s.topic).toMatch(/oratorystės meno taikymas/i);
    expect(s.topic).toMatch(/dirbtinio intelekto/i);
  });

  it("flags zero unknown-phrase fragments for this sentence (all five are recognised)", () => {
    const s = extractJournalSuggestions(ownerV3);
    const unknown = s.fragments.filter((f) => f.isUnknown);
    expect(unknown).toHaveLength(0);
  });
});

describe("extractJournalSuggestions — v2 LT activity hints", () => {
  it("'Dvi valandas montavau duris' → door / window installation (carpenter)", () => {
    const s = extractJournalSuggestions("Dvi valandas montavau duris.");
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].activitySlug).toBe("carpenter");
    expect(s.fragments[0].activityLabel).toMatch(/durų ir langų/i);
  });

  it("'Tris valandas stačiau langus' → door / window installation", () => {
    const s = extractJournalSuggestions("Tris valandas stačiau langus.");
    expect(s.fragments[0].activityLabel).toMatch(/durų ir langų/i);
  });

  it("'Keturias valandas dariau stogo karkasą' → roof framing (carpenter), NOT roofing", () => {
    const s = extractJournalSuggestions(
      "Keturias valandas dariau stogo karkasą.",
    );
    expect(s.fragments[0].activitySlug).toBe("carpenter");
    expect(s.fragments[0].activityLabel).toMatch(/stogo karkas/i);
  });

  it("'Vieną valandą rengiau projektą' → project preparation (label-only, slug=null)", () => {
    const s = extractJournalSuggestions("Vieną valandą rengiau projektą.");
    expect(s.fragments[0].activitySlug).toBeNull();
    expect(s.fragments[0].activityLabel).toMatch(/projekto rengim/i);
  });

  it("mixed v2 sentence yields 3 fragments + 3 activity directions", () => {
    const text =
      "Vieną valandą rengiau projektą, dvi valandas montavau duris, " +
      "ir keturias valandas dariau stogo karkasą.";
    const s = extractJournalSuggestions(text);
    expect(s.fragments).toHaveLength(3);
    const labels = s.fragments.map((f) => f.activityLabel).join("|");
    expect(labels).toMatch(/projekto rengim/i);
    expect(labels).toMatch(/durų ir langų/i);
    expect(labels).toMatch(/stogo karkas/i);
    const times = s.fragments
      .filter((f) => f.time)
      .map((f) => `${f.time!.value}${f.time!.unitSlug}`);
    expect(times).toEqual(["1hours", "2hours", "4hours"]);
  });
});

describe("extractJournalSuggestions — single-fragment per-domain mappings", () => {
  it("'Valandą dirbau pavežėju' yields 1h + driver direction", () => {
    const s = extractJournalSuggestions("Valandą dirbau pavežėju.");
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].time?.value).toBe(1);
    expect(s.fragments[0].activityLabel).toMatch(/pavežėjimas|vairavimas/i);
  });

  it("'3 valandas parduotuvėje kasininku' yields 3h + cashier direction", () => {
    const s = extractJournalSuggestions("3 valandas parduotuvėje kasininku.");
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].time?.value).toBe(3);
    expect(s.fragments[0].activityLabel).toMatch(/kasininko|parduotuvės/i);
  });

  it("'5 valandas padėjau dengti stogą' yields 5h + roofing direction", () => {
    const s = extractJournalSuggestions("5 valandas padėjau dengti stogą.");
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].time?.value).toBe(5);
    expect(s.fragments[0].activityLabel).toMatch(/stogo/i);
    expect(s.fragments[0].activitySlug).toBe("roofer");
  });

  it("vague text does not invent work", () => {
    const s = extractJournalSuggestions("Šiandien buvo neblogai.");
    expect(s.fragments).toHaveLength(0);
    expect(s.hasAny).toBe(false);
  });
});
