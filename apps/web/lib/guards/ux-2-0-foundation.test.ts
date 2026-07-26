import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { radii, RADII_LADDER } from "@/tokens/radii";
import { typography } from "@/tokens/typography";

/**
 * UX 2.0 foundation guard — the measured defects the master audit found, pinned
 * so they cannot come back.
 *
 * The audit's headline was that the product does not have a taste problem, it
 * has a HIERARCHY problem, and it proved it with three numbers: the primary
 * screen's largest type was 14px, it carried six 10px strings, and the radius
 * ladder was non-monotonic (`rounded-2xl` = 16px < `rounded-lg` = 18px). Those
 * are exactly the kind of regressions a later "quick fix" reintroduces without
 * anyone noticing, because none of them looks wrong in a diff.
 *
 * Negative controls this file provides (audit list items 1, 2, 3):
 *   1. chat body type smaller than 16px
 *   2. 10px / 11px type anywhere on a conversation surface
 *   3. an inverted radius ladder
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");
const rel = (p: string): string => relative(APP_ROOT, p).replaceAll("\\", "/");

/** Every non-test source file of the conversation surface — the chat window
 *  plus the flow panels that render INSIDE its message stream. */
function conversationFiles(): string[] {
  const root = join(APP_ROOT, "components", "app", "conversation");
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
    }
  };
  walk(root);
  return out;
}

const px = (rem: string): number => Math.round(parseFloat(rem) * 16);

/** Comments may DESCRIBE markup (`… it is an <h1>: …`); only real code counts. */
const codeOf = (relPath: string): string =>
  read(relPath)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * The source of one top-level function declaration, sliced to the next one.
 *
 * A naive `function X\(([\s\S]*?)\n}` regex stops at the `}) {` that closes the
 * props type annotation, so it captured only the signature and every assertion
 * against the body silently passed on an empty string.
 */
function declarationOf(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return "";
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(?:export )?function /);
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
}

describe("radius ladder is monotonic", () => {
  it("every step is strictly larger than the one before", () => {
    const values = RADII_LADDER.map((k) => ({ k, v: parseFloat(radii[k]) }));
    for (let i = 1; i < values.length; i++) {
      expect(
        values[i].v,
        `rounded-${values[i].k} (${values[i].v}px) must exceed rounded-${values[i - 1].k} (${values[i - 1].v}px)`,
      ).toBeGreaterThan(values[i - 1].v);
    }
  });

  it("the ladder is complete — nothing falls through to a Tailwind default", () => {
    // This is the actual root cause: the map used to stop at `xl`, so `2xl`
    // and `3xl` silently resolved to Tailwind's 16px / 24px.
    for (const step of ["2xl", "3xl"] as const) {
      expect(radii[step], `rounded-${step} must be tokenised`).toBeTruthy();
    }
  });

  it("a bubble is softer than the card it can contain, and a control is tighter", () => {
    expect(parseFloat(radii.bubble)).toBeGreaterThan(parseFloat(radii.card));
    expect(parseFloat(radii.control)).toBeLessThan(parseFloat(radii.card));
  });
});

describe("the semantic type ladder is real and ordered", () => {
  const ORDER = [
    "meta",
    "basis",
    "support",
    "body",
    "card-title",
    "title",
    "title-lg",
  ] as const;

  it("ascends without a plateau", () => {
    for (let i = 1; i < ORDER.length; i++) {
      const prev = px(typography.fontSize[ORDER[i - 1]][0]);
      const cur = px(typography.fontSize[ORDER[i]][0]);
      expect(cur, `${ORDER[i]} must exceed ${ORDER[i - 1]}`).toBeGreaterThan(prev);
    }
  });

  it("message body is at least 16px — the reference size in ChatGPT and Claude", () => {
    expect(px(typography.fontSize.body[0])).toBeGreaterThanOrEqual(16);
  });

  it("the floor is 12px", () => {
    for (const [role, [size]] of Object.entries(typography.fontSize)) {
      expect(px(size), `${role} is below the 12px floor`).toBeGreaterThanOrEqual(12);
    }
  });

  it("the greeting reaches the audit's 22–30px window on both breakpoints", () => {
    expect(px(typography.fontSize.title[0])).toBeGreaterThanOrEqual(22);
    expect(px(typography.fontSize["title-lg"][0])).toBeGreaterThanOrEqual(26);
    expect(px(typography.fontSize["title-lg"][0])).toBeLessThanOrEqual(30);
  });
});

describe("the conversation surface uses the ladder, not raw sizes", () => {
  it("carries no 10px or 11px type", () => {
    const offenders = conversationFiles()
      .filter((p) => /text-\[1[01]px\]/.test(read(rel(p))))
      .map(rel);
    expect(offenders, "10–11px type is below every mobile legibility floor").toEqual([]);
  });

  it("hand-rolls no arbitrary font size", () => {
    const offenders = conversationFiles()
      .filter((p) => /text-\[[0-9.]+(px|rem)\]/.test(read(rel(p))))
      .map(rel);
    expect(offenders, "sizes belong in tokens/typography.ts").toEqual([]);
  });

  it("never renders message body below the body step", () => {
    // `text-xs` (12px) and `text-sm` (14px) were what made the primary screen
    // read as admin software. Speech must use `text-body`.
    const offenders: string[] = [];
    for (const p of conversationFiles()) {
      const src = read(rel(p));
      if (/text-xs\b/.test(src)) offenders.push(`${rel(p)} (text-xs)`);
    }
    expect(offenders, "use text-support/basis/meta by role, never text-xs").toEqual([]);
  });

  it("uses the ambiguous legacy radius names nowhere", () => {
    // `rounded-2xl` / `rounded-lg` still resolve, but on this surface the
    // semantic names state the bubble/card/control relationship explicitly.
    const offenders = conversationFiles()
      .filter((p) => /rounded-(2xl|3xl)\b/.test(read(rel(p))))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("the primary screen has a document outline", () => {
  it("the conversation renders exactly one h1 — the greeting", () => {
    const messages = codeOf("components/app/conversation/chat/messages.tsx");
    expect(messages.match(/<h1\b/g) ?? [], "one page title").toHaveLength(1);
    expect(messages).toMatch(/kind === "greeting"/);
  });

  it("the greeting is the display face at title scale", () => {
    const messages = codeOf("components/app/conversation/chat/messages.tsx");
    const h1 = /<h1[^>]*className="([^"]+)"/.exec(messages);
    expect(h1, "greeting h1 should carry classes").not.toBeNull();
    expect(h1![1]).toMatch(/font-display/);
    expect(h1![1]).toMatch(/text-title/);
    expect(h1![1]).toMatch(/sm:text-title-lg/);
  });

  it("structured card titles are headings, not paragraphs", () => {
    // Stage 8 centralised the card shell, so there is ONE h3 that every
    // structured card inherits rather than three copies to keep in step. That
    // is a stronger guarantee, so assert the shell instead of a repeat count.
    const messages = codeOf("components/app/conversation/chat/messages.tsx");
    const cardBody = declarationOf(messages, "CardBody");
    expect(cardBody, "the shared card renders a heading").toMatch(/<h3\b/);
    expect(cardBody, "in the display face at card-title scale").toMatch(
      /font-display[\s\S]{0,80}text-card-title/,
    );
    // …and no card title regressed to a paragraph.
    expect(messages).not.toMatch(/<p[^>]*text-card-title/);
  });

  it("the display face is actually used on the surface it was loaded for", () => {
    // It was loaded, shipped and never rendered once on the primary screen.
    const used = conversationFiles().filter((p) => /font-display/.test(read(rel(p))));
    expect(used.length, "font-display must appear on the conversation").toBeGreaterThan(0);
  });
});
