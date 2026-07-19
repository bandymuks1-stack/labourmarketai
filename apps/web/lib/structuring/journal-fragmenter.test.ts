import { describe, expect, it } from "vitest";
import {
  fragmentJournalText,
  fnv1aHex,
  isVerbLikeToken,
} from "./journal-fragmenter";

/**
 * Universal Journal Recall — fragmenter contract.
 *
 * Pins every fragmentation rule from the spec: sentence/comma/semicolon
 * splits, verb-gated conjunction splits, the "su X ir Y" non-split,
 * time/quantity suffix stripping, meaningfulness, determinism, and the
 * production-incident text yielding EXACTLY 3 meaningful fragments.
 */

const meaningful = (text: string) =>
  fragmentJournalText(text).filter((f) => f.meaningful);

describe("fragmentJournalText — basic splitting", () => {
  it("empty / blank input → no fragments", () => {
    expect(fragmentJournalText("")).toEqual([]);
    expect(fragmentJournalText("   \n  ")).toEqual([]);
  });

  it("one activity → one meaningful fragment", () => {
    const out = meaningful("Klijavau plyteles vonioje");
    expect(out).toHaveLength(1);
    expect(out[0].normalized).toBe("klijavau plyteles vonioje");
  });

  it("sentence boundaries split (., !, ?, newline)", () => {
    const out = meaningful(
      "Dažiau sienas! Po to klojau laminatą?\nVakare tvarkiau dokumentus.",
    );
    expect(out.map((f) => f.normalized)).toEqual([
      "daziau sienas",
      "po to klojau laminata",
      "vakare tvarkiau dokumentus",
    ]);
  });

  it("commas and semicolons split", () => {
    const out = meaningful("vairavau autobusą; kroviau paletes, valiau langus");
    expect(out.map((f) => f.normalized)).toEqual([
      "vairavau autobusa",
      "kroviau paletes",
      "valiau langus",
    ]);
  });

  it("decimal separators never split ('1,5 val' stays one number)", () => {
    const out = fragmentJournalText("Dažiau sienas 1,5 val");
    expect(out).toHaveLength(1);
    expect(out[0].normalized).toBe("daziau sienas");
  });
});

describe("fragmentJournalText — conjunction rules", () => {
  it("LT 'ir' splits when the right side starts a new verb phrase", () => {
    const out = meaningful("Ploviau mašiną ir tvarkiau namus");
    expect(out.map((f) => f.normalized)).toEqual([
      "ploviau masina",
      "tvarkiau namus",
    ]);
  });

  it("LT 'bei' and 'taip pat' split verb clauses too", () => {
    expect(
      meaningful("Dažiau sienas bei glaisčiau lubas").map((f) => f.normalized),
    ).toEqual(["daziau sienas", "glaisciau lubas"]);
    expect(
      meaningful("Viriau sriubą taip pat kepiau duoną").map(
        (f) => f.normalized,
      ),
    ).toEqual(["viriau sriuba", "kepiau duona"]);
  });

  it("EN 'and' splits verb clauses; RU 'и' splits verb clauses", () => {
    expect(
      meaningful("I cleaned the house and painted the fence").map(
        (f) => f.normalized,
      ),
    ).toEqual(["i cleaned the house", "painted the fence"]);
    expect(
      meaningful("Мыл посуду и убирал дом").map((f) => f.normalized),
    ).toEqual(["мыл посуду", "убирал дом"]);
  });

  it("does NOT split 'su X ir Y' tool enumerations", () => {
    const out = meaningful("Kodavau programą su chat gpt ir claude code");
    expect(out).toHaveLength(1);
    expect(out[0].normalized).toBe(
      "kodavau programa su chat gpt ir claude code",
    );
  });

  it("does NOT split noun enumerations without a right-side verb", () => {
    const out = meaningful("Ploviau langus ir duris");
    expect(out).toHaveLength(1);
  });

  it("does NOT split when the left side has no verb", () => {
    const out = meaningful("statybos ir remontas");
    expect(out).toHaveLength(1);
  });
});

describe("fragmentJournalText — time/quantity stripping", () => {
  it.each([
    ["Ploviau mašiną - 1 h", "ploviau masina"],
    ["Dažiau sienas – 2 val", "daziau sienas"],
    ["Kodavau programą 6h", "kodavau programa"],
    ["Surinkau lentynas 3 vnt", "surinkau lentynas"],
    ["Klojau laminatą 100 m2", "klojau laminata"],
    ["Убирал дом 2 часа", "убирал дом"],
    ["Cleaned the office 45 min", "cleaned the office"],
  ])("strips the trailing expression: %s", (input, expected) => {
    const out = fragmentJournalText(input);
    expect(out).toHaveLength(1);
    expect(out[0].normalized).toBe(expected);
  });

  it("keeps the RAW text intact (stripping is for `normalized` only)", () => {
    const out = fragmentJournalText("Ploviau mašiną - 1 h");
    expect(out[0].text).toBe("Ploviau mašiną - 1 h");
  });

  it("a pure time scrap is returned but NOT meaningful", () => {
    const out = fragmentJournalText("Dirbau sode. 2 val");
    expect(out.length).toBeGreaterThanOrEqual(1);
    const scraps = out.filter((f) => !f.meaningful);
    for (const s of scraps) expect(s.meaningful).toBe(false);
    expect(out.filter((f) => f.meaningful).map((f) => f.normalized)).toEqual([
      "dirbau sode",
    ]);
  });
});

describe("fragmentJournalText — meaningfulness + robustness", () => {
  it("very short scraps are not meaningful", () => {
    const out = fragmentJournalText("ok. ir su. 5");
    expect(out.filter((f) => f.meaningful)).toHaveLength(0);
  });

  it("misspellings pass through untouched (recognition handles them)", () => {
    const out = meaningful("dazem sienas be dazu");
    expect(out).toHaveLength(1);
    expect(out[0].normalized).toBe("dazem sienas be dazu");
  });

  it("mixed LT/EN text fragments normally", () => {
    const out = meaningful("Dariau code review ir tvarkiau backlog");
    expect(out.length).toBeGreaterThanOrEqual(1);
  });

  it("long narrative splits into many fragments, none lost", () => {
    const text =
      "Ryte atvažiavau į objektą. Klijavau plyteles vonioje 4 val, po pietų glaisčiau sienas ir dažiau lubas. " +
      "Vakare sutvarkiau įrankius; parašiau ataskaitą klientui. Kitą dieną vėl dirbsiu.";
    const out = meaningful(text);
    expect(out.length).toBeGreaterThanOrEqual(6);
    // determinism
    expect(fragmentJournalText(text)).toEqual(fragmentJournalText(text));
  });

  it("ids are deterministic 8-hex hashes of the normalized form", () => {
    const [f] = fragmentJournalText("Ploviau mašiną - 1 h");
    expect(f.id).toBe(fnv1aHex("ploviau masina"));
    expect(f.id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("exact duplicate fragments collapse to one", () => {
    const out = fragmentJournalText("valiau langus, valiau langus");
    expect(out).toHaveLength(1);
  });
});

describe("INCIDENT PIN — the production text yields exactly 3 meaningful fragments", () => {
  const INCIDENT_TEXT =
    "Ploviau mašiną - 1 h. Kodavau programą su chat gpt ir claude code - 6h, tvarkiau namus - 2h";

  it("fragments are exactly: car wash / coding-with-AI-tools / house upkeep", () => {
    const out = meaningful(INCIDENT_TEXT);
    expect(out.map((f) => f.normalized)).toEqual([
      "ploviau masina",
      "kodavau programa su chat gpt ir claude code",
      "tvarkiau namus",
    ]);
    // NOT a 4th fragment for the AI tools — that meaning comes from lane
    // processing of fragment 2 (a second OUTCOME, not a second fragment).
    expect(out).toHaveLength(3);
  });
});

describe("isVerbLikeToken heuristics", () => {
  it.each(["ploviau", "tvarkiau", "kodavau", "dirbau", "naudojau", "cleaned", "painting", "мыл", "убирал", "built"])
    ("verb-like: %s", (tok) => {
      expect(isVerbLikeToken(tok)).toBe(true);
    });
  it.each(["claude", "namas", "code", "gpt", "langus", "посуду"])(
    "not verb-like: %s",
    (tok) => {
      expect(isVerbLikeToken(tok)).toBe(false);
    },
  );
});
