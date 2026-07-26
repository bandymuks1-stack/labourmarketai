import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * UX 2.0 — profile growth (stage 7).
 *
 * This is the one DESIGN_SOUL test the audit found outright FAILING: §2.5 asks
 * that "profilis atrodo kaip auganti gyvybė, ne kaip forma", and the summary was
 * a flat list where confirming something changed a single icon's colour.
 *
 * The danger in fixing it is gamification dishonesty, so this guard is mostly a
 * set of things the component must NOT do.
 *
 * Negative controls (audit list items 13, 14 + stage-7 additions):
 *   • the UI showing 5/5 while the server says 4/5
 *   • the client recomputing state differently from the server
 *   • the growth animation firing under reduced motion
 *   • a missing checkpoint rendered as completed
 *   • colour being the only thing separating the two states
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");
const messages = read("components/app/conversation/chat/messages.tsx");
const contract = read("lib/conversation/profile-summary-contract.ts");
const adapter = read("lib/conversation/profile-summary.ts");
const css = read("app/globals.css");

/** The `ProfileGrowth` component body. */
const growth = (() => {
  const start = messages.indexOf("function ProfileGrowth(");
  expect(start, "ProfileGrowth must exist").toBeGreaterThan(-1);
  return messages.slice(start, messages.indexOf("\nexport function ChatMessageView", start));
})();

describe("the numbers are the server's", () => {
  it("the contract carries explicit counts", () => {
    expect(contract).toMatch(/stepsDone: number/);
    expect(contract).toMatch(/stepsTotal: number/);
  });

  it("the adapter passes the read model's counts through without recomputing", () => {
    expect(adapter).toMatch(/stepsDone: activity\.stepsDone/);
    expect(adapter).toMatch(/stepsTotal: activity\.stepsTotal/);
    // No second derivation of "how complete is this profile".
    expect(adapter).not.toMatch(/done\.length \/|Math\.round\([^)]*100/);
  });

  it("the bar renders the counts and never counts the arrays itself", () => {
    expect(growth).toMatch(/done: number/);
    expect(growth).toMatch(/total: number/);
    // `done.length` here would be a second source of truth that can drift.
    expect(growth).not.toMatch(/\.length/);
    // And the card feeds it the server fields, not array lengths.
    expect(messages).toMatch(/done=\{m\.stepsDone\}/);
    expect(messages).toMatch(/total=\{m\.stepsTotal\}/);
    expect(messages).not.toMatch(/done=\{m\.done\.length\}/);
  });

  it("shows no percentage anywhere", () => {
    // The player-card contract forbids a completion percentage outright.
    expect(growth).not.toMatch(/%/);
    expect(growth).not.toMatch(/pct|percent/i);
  });
});

describe("a missing checkpoint can never render as completed", () => {
  it("fill is driven purely by index < done", () => {
    expect(growth).toMatch(/i < done/);
    expect(growth).toMatch(/data-filled=\{i < done \? "true" : "false"\}/);
  });

  it("the two states differ by SHAPE as well as colour", () => {
    // Colour-only would fail for a colour-blind or low-vision user.
    expect(growth).toMatch(/border-dashed/);
    expect(growth).toMatch(/bg-transparent/);
    expect(growth).toMatch(/bg-trust-accent/);
  });

  it("the named lists carry a TEXT heading for each state", () => {
    expect(messages).toMatch(/m\.doneWord/);
    expect(messages).toMatch(/m\.missingWord/);
  });
});

describe("accessibility", () => {
  it("is a real progressbar with a text value, not a decorative graphic", () => {
    expect(growth).toMatch(/role="progressbar"/);
    expect(growth).toMatch(/aria-valuemin=\{0\}/);
    expect(growth).toMatch(/aria-valuemax=\{total\}/);
    expect(growth).toMatch(/aria-valuenow=\{done\}/);
    // `aria-valuetext` is what makes a screen reader say "4 of 5".
    expect(growth).toMatch(/aria-valuetext=\{ariaLabel\}/);
  });

  it("the decorative segments are hidden from assistive tech", () => {
    expect(growth).toMatch(/aria-hidden/);
  });

  it("nothing inside the bar is focusable — it is a readout, not a control", () => {
    expect(growth).not.toMatch(/<button|<a |tabIndex/);
  });

  it("the label and its a11y name are localized server-side", () => {
    expect(messages).toMatch(/label=\{m\.progressLabel\}/);
    expect(messages).toMatch(/ariaLabel=\{m\.progressAriaLabel\}/);
    for (const f of readdirSync(join(APP_ROOT, "messages")).filter((n) => n.endsWith(".json"))) {
      const doc = JSON.parse(read(`messages/${f}`)) as {
        conversation: { summary: Record<string, string> };
      };
      for (const key of ["progress", "progressAria", "doneWord", "missingWord"]) {
        expect(doc.conversation.summary[key], `${f}: ${key}`).toBeTruthy();
      }
      expect(doc.conversation.summary.progress, `${f}: interpolates`).toContain("{done}");
      expect(doc.conversation.summary.progressAria).toContain("{total}");
    }
  });
});

describe("no gamification, and no celebration without a real change", () => {
  it("carries no streak, points, level, badge, confetti or sound", () => {
    for (const banned of [
      "streak",
      "xp",
      "points",
      "level",
      "badge",
      "confetti",
      "trophy",
      "Audio",
      "vibrate",
    ]) {
      expect(growth.toLowerCase(), `growth must not mention ${banned}`).not.toContain(
        banned.toLowerCase(),
      );
    }
  });

  it("the bar itself is NOT animated — it is rebuilt on every turn", () => {
    // Animating here would celebrate on every render instead of on a real
    // status change, which is the dishonest version of this feature.
    expect(growth).not.toMatch(/ua-confirmed|ua-msg-in|animate-/);
  });

  it("the one-shot spring lives where a change really happens", () => {
    const form = read("components/app/conversation/inline-action-form.tsx");
    expect(form).toMatch(/ua-confirmed[\s\S]{0,200}inline-action-done/);
  });

  it("and it is still covered by reduced motion", () => {
    const idx = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(idx).toBeGreaterThan(-1);
    expect(css.slice(idx)).toContain(".ua-confirmed");
  });
});
