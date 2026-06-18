import { describe, it, expect } from "vitest";
import { recognizeUniversal } from "./universal-recognition";

/**
 * Universal Skill Recognition Core v1 — covers the six required domains, returns
 * reviewable suggestions (never confirmed), and emits unmapped phrases instead
 * of inventing unrelated skills.
 */
const labels = (r: ReturnType<typeof recognizeUniversal>) => r.suggestions.map((s) => s.label);
const domains = (r: ReturnType<typeof recognizeUniversal>) => r.signals.domains;

describe("example 1 — construction mixed entry", () => {
  const r = recognizeUniversal(
    "Šiandien įmonės darbuotoja tinkavo 50 m2 sienos, keitė stogo sijas 3 valandas ir klojo čerpes 4 h",
  );
  it("suggests plastering + roof beams + tile laying", () => {
    expect(labels(r)).toEqual(
      expect.arrayContaining([
        "Sienų tinkavimas",
        "Stogo sijų / konstrukcijų darbai",
        "Čerpių klojimas / stogo dangos darbai",
      ]),
    );
  });
  it("captures 50 m2 and BOTH durations (3h + 4h)", () => {
    expect(r.signals.quantities).toEqual([{ value: 50, unit: "m2", raw: "50 m2" }]);
    expect(r.signals.durations.map((d) => d.value)).toEqual([3, 4]);
    expect(r.signals.durations.every((d) => d.unit === "hours")).toBe(true);
  });
  it("captures verbs + objects", () => {
    expect(r.signals.verbs.join(" ").toLowerCase()).toMatch(/tinkav/);
    expect(r.signals.objects.length).toBeGreaterThan(0);
  });
});

describe("example 2 — web/design (no construction invention)", () => {
  const r = recognizeUniversal("Dirbsim su puslapio dizainu");
  it("suggests web/page design", () => {
    expect(labels(r)).toContain("Puslapio / svetainės dizainas");
  });
  it("does NOT invent construction skills", () => {
    expect(domains(r)).not.toContain("construction");
    expect(domains(r)).toEqual(["web_design"]);
  });
});

describe("example 3 — admin/warehouse", () => {
  const r = recognizeUniversal(
    "Tvarkiau sandėlio likučius, pildžiau Excel ataskaitą ir ruošiau sąskaitas",
  );
  it("suggests inventory, Excel reporting, invoices", () => {
    expect(labels(r)).toEqual(
      expect.arrayContaining([
        "Sandėlio / atsargų administravimas",
        "Excel ataskaitų pildymas",
        "Sąskaitų rengimas",
      ]),
    );
    expect(domains(r)).toEqual(["admin"]);
  });
});

describe("example 4 — cleaning (no carpentry false positive)", () => {
  const r = recognizeUniversal(
    "Valėme biuro patalpas 6 val., plovėme langus ir dezinfekavome paviršius",
  );
  it("suggests office cleaning, window cleaning, disinfection", () => {
    expect(labels(r)).toEqual(
      expect.arrayContaining(["Patalpų valymas", "Langų valymas", "Paviršių dezinfekavimas"]),
    );
  });
  it("captures 6h and NEVER carpentry/construction", () => {
    expect(r.signals.durations).toEqual([{ value: 6, unit: "hours", raw: "6 val" }]);
    expect(domains(r)).toEqual(["cleaning"]);
    expect(JSON.stringify(r).toLowerCase()).not.toMatch(/carpent|staliaus|construction/);
  });
});

describe("example 5 — electrical", () => {
  const r = recognizeUniversal("Montavome kabelius, jungėme elektros skydą ir tikrinome įtampą");
  it("suggests cable install, panel work, voltage testing", () => {
    expect(labels(r)).toEqual(
      expect.arrayContaining(["Kabelių montavimas", "Elektros skydo darbai", "Įtampos tikrinimas"]),
    );
    expect(domains(r)).toEqual(["electrical"]);
  });
});

describe("example 6 — vague entry", () => {
  const r = recognizeUniversal("Dirbom objekte");
  it("invents no skills and asks for more detail", () => {
    expect(r.suggestions).toEqual([]);
    expect(r.unmapped).toEqual([]);
    expect(r.needsMoreDetail).toBe(true);
  });
});

describe("unmapped phrase (unknown skill, not invented)", () => {
  const r = recognizeUniversal("Kalibravau spektrometrą ir derinau jutiklius");
  it("returns unmapped review phrases, not unrelated skills", () => {
    expect(r.suggestions).toEqual([]);
    expect(r.unmapped.length).toBeGreaterThan(0);
    expect(r.unmapped[0].phrase.toLowerCase()).toMatch(/kalibrav|derin/);
  });
});

describe("honesty — never auto-verified", () => {
  const inputs = [
    "Šiandien tinkavo 50 m2 sienos",
    "Montavome kabelius ir tikrinome įtampą",
    "Valėme biuro patalpas",
  ];
  it("every suggestion is suggested / not confirmed / needs review", () => {
    for (const text of inputs) {
      for (const s of recognizeUniversal(text).suggestions) {
        expect(s.status).toBe("suggested");
        expect(s.confirmed).toBe(false);
        expect(s.needsReview).toBe(true);
      }
    }
  });
  it("no suggestion carries confirmed=true anywhere", () => {
    const dump = JSON.stringify(
      inputs.map((t) => recognizeUniversal(t)),
    );
    expect(dump).not.toMatch(/"confirmed":true/);
  });
});