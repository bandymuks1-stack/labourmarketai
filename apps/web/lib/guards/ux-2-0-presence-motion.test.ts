import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * UX 2.0 — assistant presence and motion.
 *
 * The audit measured TWO motion declarations on the entire chat surface while
 * the `--motion-*` tokens sat unused, and found the assistant was an anonymous
 * `Sparkles` glyph. Messages teleported; nothing acknowledged a tap; advice
 * arrived from a nameless box.
 *
 * The budget is deliberately FOUR motions. This guard exists mostly to stop the
 * two ways this goes wrong later: motion creeping everywhere, and
 * `prefers-reduced-motion` quietly not covering a newly added animation.
 *
 * Negative control (audit list item 6): reduced-motion not honoured.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");
const css = read("app/globals.css");

/** Every animation class the conversation motion layer defines. */
const MOTION_CLASSES = ["ua-msg-in", "ua-dot", "ua-press", "ua-confirmed"] as const;

describe("the motion budget is four, and it uses the tokens", () => {
  it("defines exactly the four intended animation classes", () => {
    for (const c of MOTION_CLASSES) {
      expect(css, `.${c} must be defined`).toMatch(new RegExp(`\\.${c}\\s*\\{`));
    }
    // No fifth `ua-*` animation sneaking in without a decision.
    const declared = new Set((css.match(/\.ua-[a-z-]+(?=\s*[,{:])/g) ?? []).map((s) => s.slice(1)));
    for (const c of declared) {
      expect(MOTION_CLASSES as readonly string[]).toContain(c);
    }
  });

  it("every duration and easing comes from a motion token, never a literal", () => {
    const block = css.slice(css.indexOf("@keyframes ua-msg-in"));
    for (const cls of MOTION_CLASSES) {
      const start = block.indexOf(`.${cls} {`);
      if (start === -1) continue;
      const rule = block.slice(start, block.indexOf("}", start));
      if (/animation:|transition:/.test(rule)) {
        expect(rule, `.${cls} must use var(--motion-…)`).toMatch(/var\(--motion-/);
      }
    }
  });

  it("the spring easing is reserved for real confirmations only", () => {
    const springUsers = [...css.matchAll(/\.(ua-[a-z-]+)\s*\{[^}]*--motion-ease-spring/g)].map(
      (m) => m[1],
    );
    expect(springUsers).toEqual(["ua-confirmed"]);
  });

  it("an entering message animates transform/opacity only — never layout", () => {
    const kf = css.slice(css.indexOf("@keyframes ua-msg-in"), css.indexOf("@keyframes ua-dot-wave"));
    expect(kf).toMatch(/transform:/);
    expect(kf).toMatch(/opacity:/);
    // height / margin / top would push the turns above the new one.
    expect(kf).not.toMatch(/\b(height|margin|top|padding)\s*:/);
  });

  it("the typing indicator is a travelling wave, not a synchronised pulse", () => {
    expect(css).toMatch(/@keyframes ua-dot-wave/);
    const messages = read("components/app/conversation/chat/messages.tsx");
    // `animate-pulse` fades three dots in unison — the audit's misused primitive.
    expect(messages).not.toMatch(/animate-pulse/);
    expect(messages).toMatch(/ua-dot/);
    expect(messages, "each dot offset in time").toMatch(/animationDelay/);
  });
});

describe("reduced motion is honoured for ALL of them", () => {
  it("every motion class is disabled under prefers-reduced-motion", () => {
    const idx = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(idx, "a reduced-motion block must exist").toBeGreaterThan(-1);
    const block = css.slice(idx, css.indexOf("/* gradient on ONE accent word only */", idx));
    for (const c of MOTION_CLASSES) {
      expect(block, `.${c} must be covered by reduced-motion`).toContain(`.${c}`);
    }
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toMatch(/transform:\s*none/);
  });

  it("no conversation component animates without the shared classes", () => {
    // A component-local `animate-[…]` or inline transition would bypass the
    // reduced-motion block entirely — that is the regression this catches.
    const dir = join(APP_ROOT, "components", "app", "conversation");
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(join(d, e.name))
          : e.name.endsWith(".tsx")
            ? [join(d, e.name)]
            : [],
      );
    for (const f of walk(dir)) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f}: arbitrary animation utility`).not.toMatch(/animate-\[/);
      expect(src, `${f}: animate-pulse is retired`).not.toMatch(/animate-pulse/);
    }
  });
});

describe("the assistant has one consistent identity", () => {
  const mark = read("components/app/conversation/chat/assistant-identity.tsx");
  const messages = read("components/app/conversation/chat/messages.tsx");

  it("a single mark component is the identity", () => {
    expect(messages).toMatch(/from "\.\/assistant-identity"/);
    expect(messages).toMatch(/<AssistantMark/);
  });

  it("the anonymous Sparkles glyph is gone", () => {
    expect(messages).not.toMatch(/Sparkles/);
  });

  it("the greeting states WHO is speaking, from localized copy", () => {
    expect(messages).toMatch(/m\.assistantName/);
    for (const f of readdirSync(join(APP_ROOT, "messages")).filter((n) => n.endsWith(".json"))) {
      const doc = JSON.parse(read(`messages/${f}`)) as {
        conversation: { chat: { assistantName?: string } };
      };
      expect(doc.conversation.chat.assistantName, `${f}: assistantName`).toBeTruthy();
    }
  });

  it("it is a product mark, not a mascot or a person", () => {
    // Explicit product decision: no character, no illustration, no invented
    // human name. Checked against CODE only — the doc comment above the
    // component legitimately names what it must never become.
    const markCode = mark
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(markCode).not.toMatch(/emoji|mascot|avatarUrl|<img|<svg/i);
    expect(mark).toMatch(/aria-hidden/);
    // The mark is decorative; the NAME carries the meaning for assistive tech.
    expect(mark).toMatch(/font-display/);
  });
});
