import { describe, expect, it } from "vitest";
import { classifyIntent } from "./intent-router";

/**
 * Real-user fitness walk on production, 2026-09-06: "kas man trūksta?" — the
 * way people actually ask what they are missing — had no deterministic
 * pattern (only "ko / ką man trūksta"); three runs in a row were rescued by
 * the proposer, which is neither free nor guaranteed. The bare question is
 * skill-gap by contract (owner 2026-09-04 §16); a PROJECT's readiness keeps
 * its own intent.
 */
describe("'kas man trūksta?' is deterministic skill-gap", () => {
  it.each(["kas man trūksta?", "Kas man trūksta", "kas man truksta?", "ko man trūksta?", "ką man trūksta?"])(
    "%s → skill-gap",
    (s) => {
      expect(classifyIntent(s).intent).toBe("skill-gap");
    },
  );

  it("the project's readiness question keeps project-readiness", () => {
    expect(classifyIntent("kas trūksta projektui Vilnius?").intent).toBe("project-readiness");
  });
});

/**
 * THE PHOTO SHOWN BACK (issue #1689, defect G — production HUMAN_ACCEPTANCE
 * FAIL). A worker uploaded a work photo in the journal, then asked the chat
 * "Parodyk įkeltą nuotrauką ar tikrai išsisaugojo". The router had no photo /
 * file / gallery word at all, so the sentence scored 0, the proposer chose
 * `cv-view`, and the chat said the CV was empty — about a photo that WAS
 * stored. Every phrase below is deterministic now, in all five routed
 * locales, and none of them is read as handing a file over.
 */
describe("'parodyk įkeltą nuotrauką' is deterministic evidence-photos", () => {
  it.each([
    "Parodyk įkeltą nuotrauką ar tikrai išsisaugojo",
    "Parodyk įkeltą nuotrauką",
    "parodyk ikelta nuotrauka",
    "ar nuotrauka išsisaugojo",
    "Ar mano nuotrauka išsisaugojo?",
    "ta nuotrauka",
    "šita nuotrauka",
    "ką tik įkeltas failas",
    "parodyk ką išsaugojai",
    "show the photo I just uploaded",
    "did my photo save",
    "Show my uploaded photo",
    "покажи загруженное фото",
    "laat de foto zien",
    "Is de foto opgeslagen?",
    "zeig das Foto",
    "Wurde das Foto gespeichert?",
    "mano galerija",
  ])("%s → evidence-photos", (s) => {
    expect(classifyIntent(s).intent).toBe("evidence-photos");
    expect(classifyIntent(s).score).toBeGreaterThanOrEqual(8);
  });

  it("outranks the CV doors it used to fall into — and leaves them alone", () => {
    expect(classifyIntent("Parodyk įkeltą nuotrauką").intent).not.toBe("cv-view");
    expect(classifyIntent("Noriu pamatyti savo CV").intent).toBe("cv-view");
    expect(classifyIntent("Parodyk mano CV").intent).toBe("cv-view");
    expect(classifyIntent("įkelk šį CV").intent).toBe("cv");
    expect(classifyIntent("Mano CV").intent).toBe("cv-choose");
  });

  it("a saved-criteria readback and the document centre keep their own doors", () => {
    expect(classifyIntent("parodyk išsaugotus kriterijus").intent).toBe("criteria");
    expect(classifyIntent("parodyk mano dokumentus").intent).toBe("documents");
    expect(classifyIntent("Turiu naują A1 pažymą iki 2027-03-31").intent).toBe("add-document");
    expect(classifyIntent("įkelk tabelį").intent).toBe("hours-import");
  });
});
