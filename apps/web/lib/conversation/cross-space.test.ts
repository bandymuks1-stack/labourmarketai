/**
 * A REQUEST THAT BELONGS TO THE OTHER SPACE (decision 0034 rule 3, owner P0
 * 2026-11-24). Production: acting for an organization, "mano cv" was answered
 * with the organization's generic menu ("Galiu padėti su klientais … Ką
 * norėtumėte daryti?" + Pakviesti klientą / Kandidatai / Projektai).
 *
 * Each case runs the REAL router first, then the space reader, so a phrase
 * that stops routing to the intent fails here too.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyIntent } from "./intent-router";
import { crossSpaceRequest, ORGANIZATION_HISTORY_PATH, PERSONAL_TARGET_PATH } from "./cross-space";

const WEB = join(__dirname, "..", "..");
const decide = (text: string, identity: "person" | "company", hasOrganization = true) =>
  crossSpaceRequest({ intent: classifyIntent(text).intent, text, identity, hasOrganization });

describe("acting for an organization, the person's own thing is said as theirs (LT/EN/PL)", () => {
  it.each([
    ["mano cv", "cv"],
    ["Mano CV", "cv"],
    ["my CV", "cv"],
    ["show my CV", "cv"],
    ["moje CV", "cv"],
    ["atsisiųsk mano CV", "cv"],
    ["mano žurnalas", "journal"],
    ["my journal", "journal"],
    ["mój dziennik", "journal"],
    ["mano kalendorius", "calendar"],
    ["my calendar", "calendar"],
    ["mój kalendarz", "calendar"],
    ["mano profilis", "profile"],
    ["my profile", "profile"],
    ["mój profil", "profile"],
  ])("%s → switch to the personal space and open %s", (text, target) => {
    expect(decide(text, "company")).toEqual({ kind: "to-personal", target });
  });

  it("the production sentence never reaches a handler (so never the generic menu)", () => {
    expect(classifyIntent("mano cv").intent).toBe("cv-choose");
    expect(decide("mano cv", "company")).toEqual({ kind: "to-personal", target: "cv" });
  });
});

describe("an unclear request asks ONE question with the real options", () => {
  it.each(["CV", "cv", "Parodyk Jono CV"])("%s in an organization → whose CV?", (text) => {
    expect(decide(text, "company")).toEqual({ kind: "ask-whose-cv" });
  });

  it("the organization's own record goes to its history, in the same space", () => {
    expect(decide("mūsų įmonės CV", "company")).toEqual({ kind: "organization-history" });
    expect(decide("our company CV", "company")).toEqual({ kind: "organization-history" });
  });
});

describe("an in-space request is unchanged", () => {
  it.each(["žurnalas", "komandos žurnalas", "team journal", "our calendar", "kalendorius", "kandidatai", "Surask kandidatus", "kandidato CV"])(
    "%s in an organization keeps its route",
    (text) => {
      expect(decide(text, "company")).toBeNull();
    },
  );

  it.each(["mano cv", "my journal", "mano kalendorius", "mój profil"])("%s in the personal space keeps its route", (text) => {
    expect(decide(text, "person")).toBeNull();
  });
});

describe("the reverse: an organization request in the personal space", () => {
  it.each(["Surask kandidatus", "invite a client", "pakviesk klientą"])("%s → the organization's space", (text) => {
    expect(decide(text, "person")).toEqual({ kind: "to-organization" });
  });

  it("without any organization the existing handler keeps its own answer", () => {
    expect(decide("Surask kandidatus", "person", false)).toBeNull();
  });
});

describe("the doors are real routes", () => {
  it.each(Object.entries(PERSONAL_TARGET_PATH))("%s → %s exists", (_target, path) => {
    const dir = path === "/cv" ? ["app", "[locale]", "cv"] : ["app", "[locale]", ...path.split("/").filter(Boolean)];
    expect(existsSync(join(WEB, ...dir, "page.tsx")), path).toBe(true);
  });

  it("the organization history exists", () => {
    expect(existsSync(join(WEB, "app", "[locale]", ...ORGANIZATION_HISTORY_PATH.split("/").filter(Boolean), "page.tsx"))).toBe(true);
  });
});

describe("the chat wires it at the one dispatch, through the existing switch", () => {
  const src = readFileSync(join(WEB, "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");

  it("every routed request passes the space check before a handler", () => {
    expect(src).toContain("const cross = crossSpaceRequest({ intent: routed, text, identity, hasOrganization });");
    // The deterministic route and the model's proposal both check first.
    expect(src).toMatch(/if \(crossSpaceAnswered\(intent\)\) return;\s*lastRoutedRef\.current = \{ intent, text \};\s*routedTextRef\.current = text;\s*dispatchIntent\(intent, handlers, withTyping, fallback\);/);
    expect(src).toMatch(/if \(crossSpaceAnswered\(res\.intent\)\) return;\s*dispatchIntent\(res\.intent, handlers, withTyping, fallback\);/);
    expect(src).toMatch(/trackResolution\(res\.steps\[0\]\.intent, "llm"\);\s*if \(crossSpaceAnswered\(res\.steps\[0\]\.intent\)\) return;/);
  });

  it("the answer is one line and one switch, never the generic menu", () => {
    const body = src.slice(src.indexOf("const presentCrossSpace = useCallback("), src.indexOf("THE GOAL RIDES ACROSS A WORKSPACE SWITCH"));
    expect(body).not.toContain("fallbackText");
    expect(body).not.toContain("starterChips");
    expect(body).toContain("assistant(t(`crossSpace.personal.${decision.target}`), [openChip(decision.target)]);");
  });

  it("the switch-and-open chip carries only a target name; the path is the fixed map; it opens only after the server accepted", () => {
    const chip = src.slice(src.indexOf('chip.id.startsWith("xs:")'), src.indexOf('chip.id.startsWith("xso:")'));
    expect(chip).toContain("PERSONAL_TARGET_PATH[target]");
    expect(chip).toContain("performContextSwitch(personal, undefined, path);");
    expect(src).toContain("if (accepted && thenOpen) router.push(thenOpen);");
  });
});

describe("the words exist in every catalogue", () => {
  const LOCALES = ["en", "lt", "pl", "de", "nl", "ru", "sv", "da", "et", "lv", "no"];
  const keys = (o: Record<string, unknown>, p = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
  const read = (l: string) =>
    JSON.parse(readFileSync(join(WEB, "messages", `${l}.json`), "utf8")).conversation.chat.crossSpace as Record<string, unknown>;
  const en = keys(read("en")).sort();

  it.each(LOCALES)("%s has the same keys, with {name} where it is used", (l) => {
    const c = read(l);
    expect(keys(c).sort()).toEqual(en);
    expect(c.organization).toContain("{name}");
    expect(c.switchTo).toContain("{name}");
  });
});
