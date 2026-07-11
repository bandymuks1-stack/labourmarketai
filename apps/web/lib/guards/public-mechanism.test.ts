import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Viešų paviršių mechanizmų guard'as (owner sprendimas 2026-06-11, iki
 * patentinio patikėtinio konsultacijos): viešai matoma TIK forma/rezultatas
 * („patvirtinti darbo įrodymai", „atitiktis konkrečiam darbui", „dokumentų
 * parengtis") — NIEKADA būdas (formulės, grandinės technika, piramidės
 * logika, pipeline vidus, realaus laiko variklio teiginiai).
 *
 * Scanned: ONLY the i18n namespaces used by routes reachable WITHOUT login
 * (marketing/landing/pricing/vision/legal/auth). The authenticated product
 * is NOT a public surface and is deliberately not scanned here.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];

/** Namespaces rendered on no-login routes (inventory 2026-06-11;
 *  "about" added 2026-07-05 with the CR WAGON 2 project-explanation page;
 *  "conciergeOffer" added 2026-07-11 with the public pricing concierge
 *  section, launch repair Scope C/D). */
const PUBLIC_NAMESPACES = [
  "hero", "heroCards", "market", "marketPulse", "journey", "live", "pages",
  "pricing", "vision", "legal", "waitlist", "footer", "trusted", "stats",
  "secondary", "features", "playercards", "services", "about",
  "conciergeOffer",
];

/** Mechanism vocabulary banned from PUBLIC copy (the HOW). */
const BANNED: ReadonlyArray<{ name: string; rx: RegExp }> = [
  { name: "hash / chain tech", rx: /\bhash\b|blockchain|hash[- ]?chain/i },
  { name: "LT grandinė (tech)", rx: /grandin\w*/i },
  { name: "formula language", rx: /formul\w*|∩|\boverlap\b/i },
  { name: "pyramid logic", rx: /piramid\w*|pyramid/i },
  { name: "storage/RLS internals", rx: /append-only|\bRLS\b|security definer/i },
  { name: "real-time matching claim", rx: /real-?time matching|atitikimas realiu laiku|matching engine/i },
  { name: "algorithm/determinism", rx: /algoritm\w*|algorithm\w*|deterministi\w*/i },
  { name: "pipeline internals", rx: /pipeline|typeahead|ESCO import/i },
];

describe("public copy carries results, never mechanisms", () => {
  for (const locale of LOCALES) {
    it(`${locale}: no mechanism vocabulary in public namespaces`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const publicBlob = JSON.stringify(
        Object.fromEntries(
          PUBLIC_NAMESPACES.filter((ns) => ns in json).map((ns) => [
            ns,
            json[ns],
          ]),
        ),
      );
      for (const { name, rx } of BANNED) {
        const m = publicBlob.match(rx);
        expect(
          m,
          `${locale}: banned mechanism term (${name}) found in public copy: "…${publicBlob.slice(Math.max(0, (m?.index ?? 0) - 60), (m?.index ?? 0) + 60)}…"`,
        ).toBeNull();
      }
    });
  }

  it("the cleaned keys carry the sanctioned result language (EN/LT)", () => {
    const en = JSON.parse(read("messages/en.json"));
    const lt = JSON.parse(read("messages/lt.json"));
    expect(en.hero.subcopy).not.toMatch(/real-?time matching/i);
    expect(lt.hero.subcopy).not.toMatch(/realiu laiku/i);
    expect(en.pages.companies.benefits[1].title).toBe("Fit to the specific job");
    expect(lt.pages.companies.benefits[1].title).toBe("Atitiktis konkrečiam darbui");
    expect(en.vision.workflowSteps.s2).not.toMatch(/system structures/i);
    expect(lt.vision.workflowSteps.s2).not.toMatch(/[Ss]istema struktūruoja/);
  });
});
