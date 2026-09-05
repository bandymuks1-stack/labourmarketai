import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

// The deterministic router compiles its whole multilingual pattern table on
// first use; under a loaded parallel run that first classification can pass
// vitest's 5 s default. The budget below is generous only for that reason.
vi.setConfig({ testTimeout: 30_000 });

import { getSafeReturnPath } from "@/lib/auth/redirect";
import { INTENT_REGISTRY, type RoutedIntent } from "@/lib/conversation/intent-registry";
import { FIRST_RUN_INTENTS } from "@/lib/onboarding/first-run-intent";

import {
  PUBLIC_ENTRY_MAX_CHARS,
  PUBLIC_ENTRY_SAY_PARAM,
  entryDoorHref,
  entryReturnPath,
  familyOfIntent,
  normaliseEntrySentence,
  readPublicEntry,
} from "./public-entry";

const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
const MESSAGES = join(__dirname, "..", "..", "messages");

function entryExamples(locale: string): Record<string, string> {
  const json = JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8")) as {
    landing: { entry: { examples: Record<string, string> } };
  };
  return json.landing.entry.examples;
}

describe("public entry — one sentence, the one router (P1 acceptance)", () => {
  it("three different sentences give three different recognitions", () => {
    const a = readPublicEntry("Reikia 12 pastolininkų Roterdame");
    const b = readPublicEntry("ieškau darbo Norvegijoje");
    const c = readPublicEntry("kur galiu atlikti praktiką?");
    expect(a).toMatchObject({ kind: "recognised", intent: "need-workers", family: "hire" });
    expect(b).toMatchObject({ kind: "recognised", intent: "find-work", family: "work" });
    expect(c).toMatchObject({ kind: "recognised", intent: "opportunities", family: "work" });
    const intents = new Set([a, b, c].map((r) => (r.kind === "recognised" ? r.intent : r.kind)));
    expect(intents.size).toBe(3);
  });

  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}: the three example sentences on the page each route to a different intent`, () => {
      const examples = Object.values(entryExamples(locale));
      expect(examples).toHaveLength(3);
      const readings = examples.map(readPublicEntry);
      for (const r of readings) expect(r.kind).toBe("recognised");
      const ids = new Set(readings.map((r) => (r.kind === "recognised" ? r.intent : "")));
      expect(ids.size).toBe(3);
    });
  }

  it("a sentence the router cannot read is UNRECOGNISED — never a guessed intent", () => {
    expect(readPublicEntry("zzzz qqqq vvvv")).toEqual({
      kind: "unrecognised",
      sentence: "zzzz qqqq vvvv",
    });
    expect(readPublicEntry("labas")).toMatchObject({ kind: "unrecognised" });
  });

  it("nothing typed is EMPTY, not unrecognised", () => {
    expect(readPublicEntry("")).toEqual({ kind: "empty" });
    expect(readPublicEntry("   \n ")).toEqual({ kind: "empty" });
    expect(readPublicEntry(null)).toEqual({ kind: "empty" });
  });

  it("normalises whitespace and caps the sentence", () => {
    expect(normaliseEntrySentence("  reikia   \n suvirintojų ")).toBe("reikia suvirintojų");
    expect(normaliseEntrySentence("x".repeat(PUBLIC_ENTRY_MAX_CHARS + 50))).toHaveLength(
      PUBLIC_ENTRY_MAX_CHARS,
    );
  });
});

describe("family — a projection of the intent registry, not a second list", () => {
  it("every routed intent maps onto exactly one first-run family", () => {
    for (const intent of Object.keys(INTENT_REGISTRY) as RoutedIntent[]) {
      expect(FIRST_RUN_INTENTS).toContain(familyOfIntent(intent));
    }
  });

  it("pins the families the public examples rely on", () => {
    expect(familyOfIntent("need-workers")).toBe("hire");
    expect(familyOfIntent("create-project")).toBe("hire");
    expect(familyOfIntent("find-workers")).toBe("hire");
    expect(familyOfIntent("find-work")).toBe("work");
    expect(familyOfIntent("cv")).toBe("work");
    expect(familyOfIntent("log-work")).toBe("work");
    expect(familyOfIntent("invite-client")).toBe("agency");
    expect(familyOfIntent("propose-candidate")).toBe("agency");
    expect(familyOfIntent("invite-student")).toBe("education");
    expect(familyOfIntent("programmes")).toBe("education");
    expect(familyOfIntent("learning-compass")).toBe("student");
  });
});

describe("the sentence is carried through the EXISTING return-path mechanism", () => {
  it("builds /dashboard?say=<sentence> and nothing else", () => {
    const next = entryReturnPath("Reikia 12 pastolininkų Roterdame");
    expect(next).not.toBeNull();
    const [path, query] = (next as string).split("?");
    expect(path).toBe("/dashboard");
    const params = new URLSearchParams(query);
    expect([...params.keys()]).toEqual([PUBLIC_ENTRY_SAY_PARAM]);
    expect(params.get(PUBLIC_ENTRY_SAY_PARAM)).toBe("Reikia 12 pastolininkų Roterdame");
  });

  it("survives the auth sanitiser round trip with the sentence intact", () => {
    const sentence = "ieškau darbo Norvegijoje";
    const href = entryDoorHref("lt", "signup", sentence);
    expect(href.startsWith("/lt/auth/signup?next=")).toBe(true);
    const nextParam = decodeURIComponent(href.split("?next=")[1]);
    const landed = getSafeReturnPath(nextParam, "lt");
    expect(landed.startsWith("/lt/dashboard?")).toBe(true);
    const params = new URLSearchParams(landed.split("?")[1]);
    expect(params.get(PUBLIC_ENTRY_SAY_PARAM)).toBe(sentence);
  });

  it("an empty sentence opens the plain door", () => {
    expect(entryDoorHref("en", "login", "")).toBe("/en/auth/login");
    expect(entryReturnPath("  ")).toBeNull();
  });

  it("never lets a sentence smuggle a second redirect or a credential key", () => {
    // The sentence is a VALUE under `say`; whatever it contains stays a value.
    const next = entryReturnPath("next=//evil.com&token=abc");
    const params = new URLSearchParams((next as string).split("?")[1]);
    expect([...params.keys()]).toEqual([PUBLIC_ENTRY_SAY_PARAM]);
    expect(params.get(PUBLIC_ENTRY_SAY_PARAM)).toBe("next=//evil.com&token=abc");
  });
});
