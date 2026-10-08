import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PLAYER_CARD_MODES } from "@/lib/player-card/card-modes";
import { isCanonicallyRedirected } from "@/lib/guards/canonical-redirects";

/**
 * REJECTED 3D PLAYER-CARD / MANNEQUIN EXPERIENCE MUST NOT BE LIVE
 * (owner decision 2026-10-08, production containment).
 *
 * The owner rejected the live 3D "world" player-card (WebGL scene with the
 * person as a 3D figure, `three` + `@react-three/fiber`) and the public
 * illustrative "Rasa J." sample card. Both were removed from every production
 * path. Experimental code stays in git history; it may NOT come back through a
 * route without a new owner decision.
 *
 * What is deliberately NOT forbidden: the plain, real-data `WorkerPlayerCard`
 * on signed-in surfaces (journal, workspace result, profile) — it is the only
 * presentation of that person's own data and carries the work-card editor.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const exists = (rel: string) => existsSync(join(APP, rel));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const walk = (rel: string, out: string[] = []): string[] => {
  if (!exists(rel)) return out;
  for (const entry of readdirSync(join(APP, rel), { withFileTypes: true }) as Dirent[]) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(child, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(child);
    }
  }
  return out;
};

const PRODUCT_SOURCE = [...walk("app"), ...walk("components"), ...walk("lib")];

describe("the 3D world scene is gone and cannot return through a route", () => {
  it("the world scene / objects / model files do not exist", () => {
    for (const rel of [
      "components/app/player-card/player-card-world-scene.tsx",
      "components/app/player-card/player-card-world-objects.tsx",
      "lib/player-card/card-world.ts",
    ]) {
      expect(exists(rel), rel).toBe(false);
    }
  });

  it("no product source imports three, @react-three/*, or a world scene", () => {
    const offenders = PRODUCT_SOURCE.filter((rel) => {
      const code = stripComments(read(rel));
      return (
        /from\s+["'](three|three\/[^"']*|@react-three\/[^"']+)["']/.test(code) ||
        /import\(\s*["'](three|@react-three\/[^"']+)["']\s*\)/.test(code) ||
        /player-card-world|card-world["']|PlayerCardWorld/.test(code)
      );
    });
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("no dynamic/WebGL world is mounted under components/app/player-card or any route", () => {
    const offenders = [...walk("components/app/player-card"), ...walk("app")].filter((rel) => {
      const code = stripComments(read(rel));
      return /getContext\(\s*["']webgl2?["']\s*\)|data-testid="player-card-world"|<Canvas\b/.test(code);
    });
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("the card has no 'world' mode and WorkerPlayerCard takes no world prop", () => {
    expect([...PLAYER_CARD_MODES]).not.toContain("world");
    const card = stripComments(read("components/app/worker-player-card.tsx"));
    expect(card).not.toMatch(/\bworld\??:|world=\{|buildCardWorld/);
    const modes = stripComments(read("components/app/player-card/player-card-modes.tsx"));
    expect(modes).not.toMatch(/\bworld\b|next\/dynamic/);
  });
});

describe("no illustrative persona is mounted as a card on a production route", () => {
  const PUBLIC_SOURCE = [
    ...walk("app/[locale]/(marketing)"),
    ...walk("app/[locale]/focus-landing"),
    ...walk("components/marketing"),
  ];

  it("the sample showcase component is deleted", () => {
    expect(exists("components/marketing/player-card-showcase.tsx")).toBe(false);
  });

  it("no public route or marketing component mounts WorkerPlayerCard or the sample card builder", () => {
    const offenders = PUBLIC_SOURCE.filter((rel) => {
      const code = stripComments(read(rel));
      return /<WorkerPlayerCard\b|PlayerCardShowcase|buildSampleWorkerPlayerCard/.test(code);
    });
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("no route file passes the `sample` flag to WorkerPlayerCard", () => {
    const offenders = walk("app").filter((rel) => {
      const code = stripComments(read(rel));
      return /<WorkerPlayerCard[^>]*\bsample\b/.test(code);
    });
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("no public route or marketing component carries the illustrative card copy as a card", () => {
    const offenders = PUBLIC_SOURCE.filter((rel) => {
      const code = stripComments(read(rel));
      return /\bRasa J\.|ILLUSTRATIVE DATA|AN EXAMPLE CARD|playercards-canonical-card/i.test(code);
    });
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});

describe("navigation and chat expose no 3D / world / mannequin surface", () => {
  it("navigation, feature availability and the intent/result registries name none", () => {
    for (const rel of [
      "lib/config/navigation.ts",
      "lib/config/feature-availability.ts",
      "lib/conversation/intent-registry.ts",
      "lib/conversation/intent-catalogue.ts",
      "lib/conversation/result-registry.ts",
      "components/app/account-menu.tsx",
    ]) {
      const code = stripComments(read(rel));
      expect(code, rel).not.toMatch(/mannequin|player-card-world|card=world|["']world["']\s*[:,)]/i);
    }
  });

  it("the retired dedicated player-card route still redirects (never a page of its own)", () => {
    expect(exists("app/[locale]/dashboard/player-card/page.tsx")).toBe(false);
    expect(isCanonicallyRedirected("/dashboard/player-card")).toBe(true);
  });
});

describe("no named illustrative persona or fixture is rendered by public components (containment 2026-10-08)", () => {
  // The photoreal home hero (living-worker-hero, labelled SAMPLE) is an owner
  // decision of its own and is deliberately NOT scanned here.
  const SCANNED = [
    ...walk("app/[locale]/(marketing)"),
    ...walk("app/[locale]/focus-landing"),
    ...walk("components/marketing"),
  ].filter((rel) => !/living-worker-hero/.test(rel));

  it("none names Rasa J., Restaurant Ąžuolas or an EXAMPLE persona banner", () => {
    const offenders = SCANNED.filter((rel) =>
      /Rasa J\.|Ąžuolas|NOT A REAL PERSON|playercards["']|sample\.name|sample\.organization/.test(stripComments(read(rel))),
    );
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("the persona-driven landing story and lifecycle subject are gone", () => {
    expect(exists("components/marketing/landing-journey.tsx")).toBe(false);
    expect(exists("lib/marketing/sample-journey.ts")).toBe(false);
    const lifecycle = stripComments(read("components/marketing/work-lifecycle-section.tsx"));
    expect(lifecycle).not.toMatch(/\.fact\b|subject=|playercards/);
    const twoSides = stripComments(read("components/marketing/two-sides-section.tsx"));
    expect(twoSides).not.toMatch(/sampleName|playercards/);
  });

  it("the /for-* pages mount no fabricated preview fixture", () => {
    for (const rel of [
      "app/[locale]/(marketing)/for-companies/page.tsx",
      "app/[locale]/(marketing)/for-agencies/page.tsx",
      "app/[locale]/(marketing)/for-workers/page.tsx",
    ]) {
      expect(stripComments(read(rel)), rel).not.toMatch(/ExamplePreviewFrame|DemandPreviewCard|AgencyPoolPreview/);
    }
  });
});
