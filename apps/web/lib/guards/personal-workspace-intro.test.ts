import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  INTRO_ACTION_IDS,
  INTRO_ACTION_LABEL_KEYS,
} from "@/lib/workspace/personal-workspace-intro";

/**
 * "Mano erdvė" first-screen guard (AI-native visual system S2).
 *
 * The block is deliberately SMALL: one intro on the existing conversation-first
 * home. Everything that would turn it into a second product — a route, a second
 * dashboard, a second readiness model, a second workspace switcher, a score —
 * is asserted structurally here, so the next slice cannot grow one by accident.
 *
 * Structural, not lexical: negative scans strip comments first, so a comment
 * that NAMES a banned pattern (as several deliberately do) never trips its own
 * guard, and no assertion greps documentation.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const MODEL = "lib/workspace/personal-workspace-intro.ts";
const SERVER = "lib/workspace/personal-workspace-intro-server.ts";
const VIEW = "components/app/workspace/personal-workspace-intro.tsx";
const CHAT = "components/app/conversation/chat/conversation-chat.tsx";
const THREAD = "components/app/conversation/chat/conversation-thread.tsx";
const HOME = "app/[locale]/dashboard/page.tsx";

const SCAN_EXT = /\.(ts|tsx)$/;
const walk = (rel: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(join(APP, rel), { withFileTypes: true })) {
    const childRel = `${rel}/${entry.name}`;
    if (entry.isDirectory()) walk(childRel, out);
    else if (SCAN_EXT.test(entry.name)) out.push(childRel);
  }
  return out;
};
const sourceFiles = (): string[] =>
  [...walk("app"), ...walk("components"), ...walk("lib")].filter(
    (f) => !/\.test\.tsx?$/.test(f),
  );

describe("Mano erdvė is a block, not a screen", () => {
  it("adds no route of its own", () => {
    const routes = walk("app").filter((f) => /\/page\.tsx$/.test(f));
    const offenders = routes.filter((f) =>
      /(personal-workspace|mano-erdve|my-space|myspace)/i.test(f),
    );
    expect(offenders).toEqual([]);
  });

  it("is mounted from exactly ONE place — the conversation window", () => {
    // `.tsx` only: a `Promise<PersonalWorkspaceIntro>` return type in the
    // server loader is a TYPE reference, not a mount.
    const mounts = sourceFiles().filter(
      (f) => f.endsWith(".tsx") && f !== VIEW && /<PersonalWorkspaceIntro\b/.test(read(f)),
    );
    expect(mounts).toEqual([CHAT]);
  });

  it("the conversation-first home is still the only dashboard root", () => {
    // The block renders INSIDE the chat; the home page must keep rendering the
    // conversation as its single child surface.
    const src = read(HOME);
    expect(src).toMatch(/<ConversationChat/);
    expect(stripComments(src)).not.toMatch(/DashboardGrid|ControlRoom|<main/);
  });

  it("the view is not a page and exports no route metadata", () => {
    const src = read(VIEW);
    expect(src).not.toMatch(/export\s+default/);
    expect(src).not.toMatch(/generateMetadata|generateStaticParams/);
  });

  it("renders only while the conversation is opening — it is not a permanent header", () => {
    const src = read(THREAD);
    expect(src).toMatch(/isOpening && intro/);
  });

  it("a taller opening stays scrollable from its first line on a short screen", () => {
    // Auto margins centre the composition when it fits and collapse when it
    // does not; `justify-content: center` alone would clip the overflowing top
    // of a scroll container, hiding the block this slice adds.
    expect(read(THREAD)).toMatch(/isOpening \? "my-auto"/);
  });

  it("stores no new dismissed/seen state anywhere", () => {
    for (const rel of [MODEL, SERVER, VIEW]) {
      const src = stripComments(read(rel));
      expect(src, `${rel} must not persist an intro state`).not.toMatch(
        /localStorage|sessionStorage|\.insert\(|\.update\(|\.upsert\(/,
      );
    }
  });
});

describe("no second system", () => {
  it("there is exactly ONE readiness deriver in the tree", () => {
    const definers = sourceFiles().filter((f) =>
      /export function deriveWorkerReadiness\b/.test(read(f)),
    );
    expect(definers).toEqual(["lib/player-card/readiness.ts"]);
  });

  it("the model computes no readiness of its own — it only consumes it", () => {
    const src = stripComments(read(MODEL));
    // No counting, no fractions, no thresholds: the canonical deriver owns all
    // of that. This module may only READ `readiness.pillars`.
    expect(src).not.toMatch(/fraction|\/\s*total|Math\.round|\bpct\b|percent/i);
    expect(src).toMatch(/readiness\.pillars/);
  });

  it("no second workspace switcher and no membership writes", () => {
    const src = stripComments(read(VIEW));
    expect(src).not.toMatch(/WorkspaceChip|switchWorkspace|switchOrganization/);
    expect(stripComments(read(MODEL))).not.toMatch(/switchWorkspace|organization-actions/);
  });

  it("no new profile hub component appears", () => {
    const offenders = sourceFiles().filter(
      (f) =>
        /(profile-hub|personal-dashboard|profile-dashboard)[^/]*\.tsx$/i.test(f) &&
        f !== "components/app/profile-hub-overview.tsx",
    );
    expect(offenders).toEqual([]);
  });

  it("the block ships no new message namespace to the client bundle", () => {
    // The conversation shell ships an allowlisted SUBSET of the catalog
    // (lib/i18n/client-messages.ts). Copy arrives as a server-resolved label
    // bag — the same pattern `labels` / `workLogLabels` already use — so this
    // block adds nothing to the client payload.
    expect(read(VIEW)).not.toMatch(/useTranslations|next-intl/);
    expect(read(HOME)).toMatch(/resolvePersonalWorkspaceLabels/);
  });

  it("the block owns no data fetching of its own", () => {
    // Every fact arrives as a prop; the ONE server read reuses existing
    // request-cached readers and creates no new query path.
    expect(stripComments(read(VIEW))).not.toMatch(/createClient|fetch\(|use[A-Z]\w*Query/);
    const server = stripComments(read(SERVER));
    expect(server).not.toMatch(/\bfrom\("\w+"\)|createClient/);
  });
});

describe("every CTA is real", () => {
  const chat = read(CHAT);
  const workerForms = read("lib/conversation/worker-forms.ts");

  it.each(INTRO_ACTION_IDS)("action %s resolves to a real action or route", (id) => {
    if (id.startsWith("link:")) {
      const route = id.slice("link:".length).replace(/^\//, "");
      expect(
        existsSync(join(APP, "app", "[locale]", route, "page.tsx")),
        `${id} must point at an existing screen`,
      ).toBe(true);
      return;
    }
    if (id.startsWith("f:")) {
      expect(
        workerForms.includes(`"${id.slice(2)}"`),
        `${id} must be a real inline form spec`,
      ).toBe(true);
      return;
    }
    // A bare id must be a case the conversation's own dispatcher handles.
    expect(chat.includes(`case "${id}":`), `${id} must be a real chip`).toBe(true);
  });

  it("the block dispatches through the conversation's ONE chip handler", () => {
    expect(read(CHAT)).toMatch(/onAction=\{handlePanelChip\}/);
    expect(stripComments(read(VIEW))).not.toMatch(/useRouter|router\.push|<Link/);
  });
});

describe("honest surface — no score, no rating, no fake verification", () => {
  const FAKE =
    /trust[- ]?score|reputation|\brating\b|AI[- ]?verified|guaranteed[- ]?match|\bOVR\b|score/i;

  it.each([MODEL, SERVER, VIEW])("%s carries no score/rating semantics", (rel) => {
    expect(stripComments(read(rel))).not.toMatch(FAKE);
  });

  it("the view renders no percentage and no progress meter", () => {
    const src = stripComments(read(VIEW));
    expect(src).not.toMatch(/%|<progress|role="progressbar"|\bprogress\w*|\bRing\b/i);
  });

  it("the view uses the S1 canonical primitives", () => {
    const src = read(VIEW);
    expect(src).toMatch(/from "@\/components\/ui\/Card"/);
    expect(src).toMatch(/from "@\/components\/ui\/Button"/);
    expect(src).toMatch(/<Card\b/);
    expect(src).toMatch(/<Button\b/);
    // No hand-rolled card or pill grammar next to the primitives.
    expect(src).not.toMatch(/card-border|rounded-full border border-ink-500/);
  });

  it("no manual locale ternary — the i18n system is the only translator", () => {
    for (const rel of [MODEL, SERVER, VIEW]) {
      expect(stripComments(read(rel)), rel).not.toMatch(
        /locale\s*===\s*["'`]/,
      );
    }
  });
});

describe("copy is human, present in all 11 catalogs, and free of technical state", () => {
  const LOCALES = [
    "en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru",
  ] as const;
  const catalog = (loc: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(APP, "messages", `${loc}.json`), "utf8"))
      .personalWorkspace as Record<string, unknown>;

  const leaves = (o: unknown, p = "", out: string[] = []): string[] => {
    if (typeof o === "string") {
      out.push(p);
    } else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        leaves(v, p ? `${p}.${k}` : k, out);
      }
    }
    return out;
  };

  it("the namespace exists in every locale with the SAME keys", () => {
    const base = leaves(catalog("lt")).sort();
    expect(base.length).toBeGreaterThan(0);
    for (const loc of LOCALES) {
      expect(leaves(catalog(loc)).sort(), `${loc}.json`).toEqual(base);
    }
  });

  it("every action label key the model can emit has copy AND is resolved", () => {
    const lt = catalog("lt").action as Record<string, string>;
    const resolver = read("lib/workspace/personal-workspace-labels.ts");
    for (const key of INTRO_ACTION_LABEL_KEYS) {
      expect(typeof lt[key], `personalWorkspace.action.${key}`).toBe("string");
      // A label the model can emit but the server never resolves would render
      // as `undefined` — the label bag must cover the model exactly.
      expect(resolver.includes(`"${key}"`), `resolver must carry ${key}`).toBe(true);
    }
  });

  it("no value is empty and none carries an untranslated marker", () => {
    for (const loc of LOCALES) {
      const flat = JSON.stringify(catalog(loc));
      expect(flat, `${loc}.json`).not.toContain("[EN]");
      expect(flat, `${loc}.json`).not.toMatch(/:\s*""/);
    }
  });

  it("user copy names no technical state", () => {
    const TECHNICAL =
      /needs_migration|SQLSTATE|migration|database|supabase|null|undefined|error code|dashboard|admin\b|debug|internal\b/i;
    for (const loc of LOCALES) {
      expect(JSON.stringify(catalog(loc)), `${loc}.json`).not.toMatch(TECHNICAL);
    }
  });

  it("the required Lithuanian product terms are the ones actually shipped", () => {
    const lt = catalog("lt") as {
      title: string;
      workProfile: string;
      readiness: { label: string };
      dimension: Record<string, string>;
    };
    expect(lt.title).toBe("Mano erdvė");
    expect(lt.workProfile).toBe("Mano darbo profilis");
    expect(lt.readiness.label).toBe("Darbo pasiruošimas");
    expect(Object.values(lt.dimension)).toEqual([
      "Ką moku",
      "Ko ieškau",
      "Kada galiu dirbti",
      "Kur galiu dirbti",
      "Kokio atlygio tikiuosi",
      "Kuo galiu pagrįsti patirtį",
    ]);
  });
});
