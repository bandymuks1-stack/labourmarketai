import { describe, expect, it } from "vitest";

import { readFileIntent } from "./file-subject";
import { classifyIntent } from "./intent-router";

/**
 * Production 2026-10-01: "Ką čia galiu padaryti?" was answered with "Kieno šis
 * dokumentas?" because the deposit signal "čia" (as in "čia mano CV") matched
 * inside a question. A question word before "čia" is not a deposit.
 */
describe("a question containing 'čia' is not a file deposit", () => {
  it.each(["Ką čia galiu padaryti?", "Kas čia vyksta?", "Kur čia mano valandos?"])("%s", (s) => {
    expect(readFileIntent(s)).toBeNull();
  });

  it("the capabilities question still reaches the capabilities answer", () => {
    expect(classifyIntent("Ką čia galiu padaryti?").intent).toBe("capabilities");
  });

  it("a real deposit still is one", () => {
    expect(readFileIntent("Čia mano CV")).not.toBeNull();
    expect(readFileIntent("čia darbo nuotrauka")).not.toBeNull();
  });
});
