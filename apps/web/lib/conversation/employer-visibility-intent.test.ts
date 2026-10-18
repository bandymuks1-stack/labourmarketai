import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INTENT_HINTS } from "./intent-catalogue";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";

/**
 * "KAS MATO MANO PROFILĮ?" — employer visibility by sentence (capability
 * matrix P0, 2026-09-23). 57 of 59 production workers were invisible to all
 * supply matching; the consent that decides it was reachable only behind the
 * profile page's closed "More", and every sentence below scored 0.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("employer visibility, by sentence, in every active locale", () => {
  it.each([
    // lt
    "Kas mato mano profilį?",
    "kas mato mano profili",
    "Matomumas darbdaviams",
    "Matomas darbdaviams",
    "Ar darbdaviai mato mano profilį?",
    "Padaryk mane matomą darbdaviams",
    "Noriu, kad darbdaviai matytų mano profilį",
    "Paslėpk mano profilį nuo darbdavių",
    "Išjunk matomumą",
    // en
    "Make me visible to employers",
    "Who can see my profile?",
    "Can employers see my profile?",
    "Hide my profile from employers",
    "Profile visibility",
    // ru
    "Кто видит мой профиль?",
    "Сделай меня видимым для работодателей",
    "Видимость профиля",
    "Скрой мой профиль",
    // nl
    "Wie ziet mijn profiel?",
    "Maak mij zichtbaar voor werkgevers",
    "Verberg mijn profiel",
    // de
    "Wer sieht mein Profil?",
    "Mach mich für Arbeitgeber sichtbar",
    "Profil verbergen",
    // pl
    "Kto widzi mój profil?",
    "Widoczność dla pracodawców",
    "Chcę być widoczny dla pracodawców",
    "Ukryj mój profil",
  ])("%s → employer-visibility", (text) => {
    expect(classifyIntent(text).intent).toBe("employer-visibility");
  });
});

describe("negative controls — the profile noun alone stays `profile`", () => {
  it.each([
    "mano profilis",
    "Parodyk mano profilį",
    // `\bmatyt` is bounded: "pa-MATYTI" must never read as a visibility word.
    "Noriu pamatyti savo profilį",
    "Show my profile",
    "Покажи мой профиль",
    "Toon mijn profiel",
    "Zeig mein Profil",
    "Pokaż mój profil",
  ])("%s → profile", (text) => {
    expect(classifyIntent(text).intent).toBe("profile");
  });

  it("nearby sentences keep their intents", () => {
    expect(classifyIntent("Parodyk mano komandą").intent).toBe("my-team");
    expect(classifyIntent("kas susidomėjo mano poreikiu?").intent).toBe("interest-inbox");
    expect(classifyIntent("parodyk rinkos žemėlapį").intent).toBe("market-map");
    // "matome" (we see) is not a visibility word.
    expect(classifyIntent("Kokias įmones matome žemėlapyje?").intent).not.toBe(
      "employer-visibility",
    );
  });

  it("one person asking to be seen is not an agency offering capacity", () => {
    // Before the `\bим\b` boundary, "видИМым" + "РАБОТодателей" fired the
    // supply rule's WORK-FOR-THEM pattern (weight 10).
    expect(classifyIntent("Сделай меня видимым для работодателей").intent).not.toBe(
      "offer-capacity",
    );
    // …while the supply sentences that pronoun exists for still route there.
    expect(classifyIntent("У нас 20 сварщиков, ищем им работу").intent).toBe("offer-capacity");
    expect(classifyIntent("Мы имеем 20 сварщиков и ищем для них работу").intent).toBe(
      "offer-capacity",
    );
    expect(classifyIntent("Turime 20 suvirintojų ir ieškome jiems darbo").intent).toBe(
      "offer-capacity",
    );
  });
});

describe("the door, not a second consent path", () => {
  it("is a write-class profile intent with its own typing cue — the sentence itself writes nothing", () => {
    expect(INTENT_REGISTRY["employer-visibility"]).toEqual({
      domain: "profile",
      access: "write",
      handler: "employerVisibility",
      ownTyping: true,
    });
    expect(INTENT_HINTS["employer-visibility"]).toMatch(/employers can see/);
    expect(INTENT_HINTS["employer-visibility"].length).toBeLessThanOrEqual(200);
  });

  it("the chat says the state first, then embeds the EXISTING consent with its provenance", () => {
    const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(CHAT).toContain("employerVisibility: () => startEmployerVisibility()");
    const fn = CHAT.slice(
      CHAT.indexOf("const startEmployerVisibility = useCallback"),
      CHAT.indexOf("const startMessages = useCallback"),
    );
    expect(fn).toContain("loadEmployerVisibilityForChat()");
    // State line BEFORE the embed.
    expect(fn.indexOf("assistant(res.line")).toBeGreaterThan(0);
    expect(fn.indexOf("assistant(res.line")).toBeLessThan(fn.indexOf("pushEmbed("));
    expect(fn).toMatch(/<DiscoverabilityConsent[^>]*source="conversation"/);
    // Only when the loader handed over a consent (never for unknown).
    expect(fn).toContain('res.kind === "state" && res.consent');
    expect(fn).toContain("link:${EMPLOYER_VISIBILITY_HREF}");
    // A failed call says so — it never falls through to a "not visible" line.
    expect(fn).toContain('t("visibilityUnavailable")');
  });

  it("the loader composes the existing reads and writes nothing", () => {
    const LOADER = read("lib/conversation/employer-visibility-chat.ts");
    expect(LOADER.startsWith('"use server";')).toBe(true);
    expect(LOADER).toContain("getMyDiscoverabilityState()");
    expect(LOADER).toContain("buildOwnDiscoverabilityPreview()");
    expect(LOADER).toContain("discoverabilityConsentLabels(tc)");
    expect(LOADER).toContain("PROFILE_DISCOVERABILITY_V1.texts[toConsentLocale(locale)]");
    expect(LOADER).not.toMatch(/\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(LOADER).not.toMatch(/grantProfileDiscoverability|withdrawProfileDiscoverability/);
    // Unknown embeds nothing; a failed worker read is not "no worker".
    expect(LOADER).toMatch(/if \(visibility === "unknown"\) return unknown;/);
    expect(LOADER).toContain("worker.ok && worker.value === null");
  });
});
