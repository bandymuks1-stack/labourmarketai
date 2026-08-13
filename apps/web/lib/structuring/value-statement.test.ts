import { describe, expect, it } from "vitest";

import { structureValueStatement } from "./value-statement";

/**
 * The V9 acceptance fixtures — the "grandmother's cucumbers" architecture
 * test. Three real sentences, three different value statements, one reader.
 * Pinned EXACTLY as specified; a rule refactor that bends any of them fails
 * here, not in production.
 */

const TODAY = "2026-08-13"; // Thursday, UTC

describe("fixture A — goods offer (grandmother's cucumbers)", () => {
  const v = structureValueStatement(
    "Turiu 30 kg savo darže užaugintų agurkų ir noriu parduoti",
    TODAY,
  );

  it("axis=offer, subject=goods", () => {
    expect(v.axis).toBe("offer");
    expect(v.subject).toBe("goods");
  });

  it("quantity 30 kg", () => {
    expect(v.quantity).toMatchObject({ value: 30, unit: "kg" });
  });

  it("subjectLabel echoes the person's own noun phrase (contains agurk, ≤60 chars, no taxonomy)", () => {
    expect(v.subjectLabel).toBeTruthy();
    expect(v.subjectLabel!.toLowerCase()).toContain("agurk");
    expect(v.subjectLabel!.length).toBeLessThanOrEqual(60);
  });

  it("states what is missing instead of guessing", () => {
    expect(v.missing).toContain("location");
    expect(v.missing).toContain("window");
    expect(v.confidence).toBe("high");
  });
});

describe("fixture B — work-capacity offer (electrician, two free days)", () => {
  const v = structureValueStatement(
    "Esu elektrikas ir kitą savaitę turiu dvi laisvas dienas",
    TODAY,
  );

  it("axis=offer, subject=work_capacity, workType=electrician", () => {
    expect(v.axis).toBe("offer");
    expect(v.subject).toBe("work_capacity");
    expect(v.workType).toBe("electrician");
  });

  it("window = next week with days=2 (word-number)", () => {
    expect(v.window).toMatchObject({
      kind: "next_week",
      startIso: "2026-08-17",
      endIso: "2026-08-23",
      days: 2,
    });
  });

  it("two free DAYS is a window, never a headcount", () => {
    expect(v.headcount).toBeNull();
  });
});

describe("fixture C — workforce shortage (four welders next month)", () => {
  const v = structureValueStatement(
    "Mūsų įmonei kitą mėnesį trūks keturių suvirintojų",
    TODAY,
  );

  it("axis=seek, subject=workforce, workType=welder", () => {
    expect(v.axis).toBe("seek");
    expect(v.subject).toBe("workforce");
    expect(v.workType).toBe("welder");
  });

  it("headcount=4 via the inflected word-number", () => {
    expect(v.headcount).toBe(4);
  });

  it("window = next calendar month", () => {
    expect(v.window).toMatchObject({
      kind: "next_month",
      startIso: "2026-09-01",
      endIso: "2026-09-30",
    });
  });
});

describe("negatives — the reader never invents a value statement", () => {
  it("a job search is NOT goods (and stays the router's find-work territory)", () => {
    const v = structureValueStatement("Ieškau darbo Vokietijoje", TODAY);
    expect(v.subject).not.toBe("goods");
    expect(v.axis).toBe("seek");
    expect(v.subject).toBeNull(); // no occupation, no headcount → not workforce
    expect(v.country).toBe("DE");
  });

  it("gardening WORK is not produce — no offer/seek verb, no subject", () => {
    const v = structureValueStatement("Šiandien ravėjau daržą ir sodinau gėles", TODAY);
    expect(v.axis).toBeNull();
    expect(v.subject).toBeNull();
    expect(v.missing).toContain("axis");
  });

  it("'esu suvirintojas' alone is not a statement of either axis", () => {
    const v = structureValueStatement("Esu suvirintojas", TODAY);
    expect(v.axis).toBeNull();
    expect(v.workType).toBe("welder"); // the fact is read; the intent is not guessed
  });

  it("offer + seek wording without a sell verb stays honestly ambiguous", () => {
    const v = structureValueStatement("Turiu pasiūlymą, bet reikia pagalbos", TODAY);
    expect(v.axis).toBeNull();
    expect(v.missing).toContain("axis");
  });

  it("a service offer is service, not goods", () => {
    const v = structureValueStatement("Siūlau elektriko paslaugas Lietuvoje", TODAY);
    expect(v.axis).toBe("offer");
    expect(v.subject).toBe("service");
    expect(v.workType).toBe("electrician");
    expect(v.country).toBe("LT");
  });

  it("a workforce seek without a count states headcount as missing", () => {
    const v = structureValueStatement("Reikia suvirintojų Norvegijoje", TODAY);
    expect(v.subject).toBe("workforce");
    expect(v.headcount).toBeNull();
    expect(v.missing).toContain("headcount");
    expect(v.country).toBe("NO");
  });
});
