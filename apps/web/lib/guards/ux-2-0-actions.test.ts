import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * UX 2.0 — actions, composer and icon scale (stage 5).
 *
 * The audit found the CTA hierarchy flat: in every card the primary and the
 * secondary differed only by a border tint, so the screen expressed no
 * recommendation and pushed the decision back onto the user. It also found a
 * composer that could not show what you had typed, and five icon sizes at one
 * stroke weight.
 *
 * Negative controls (audit list items 4, 8 and the stage-5 additions):
 *   • primary and secondary CTAs collapsing to equal weight
 *   • a touch target dropping below 44px
 *   • the textarea not growing / exceeding its cap / not resetting after send
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");
const rel = (p: string): string => relative(APP_ROOT, p).replaceAll("\\", "/");

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

const action = read("components/app/conversation/chat/chat-action.tsx");
const composer = read("components/app/conversation/chat/composer.tsx");
const messages = read("components/app/conversation/chat/messages.tsx");
const iconScale = read("components/app/conversation/chat/icon-scale.ts");

/** Every `<ChatActionRow>…</ChatActionRow>` block in the conversation. */
function actionRows(): { file: string; body: string }[] {
  const out: { file: string; body: string }[] = [];
  for (const p of conversationFiles()) {
    const src = read(rel(p));
    const re = /<ChatActionRow>([\s\S]*?)<\/ChatActionRow>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.push({ file: rel(p), body: m[1] });
  }
  return out;
}

describe("CTA hierarchy is stated once and obeyed", () => {
  it("there is exactly one action primitive, and only it defines the weights", () => {
    expect(action).toMatch(/const TONE: Record<ChatActionTone, string>/);
    for (const tone of ["primary", "secondary", "danger"]) {
      expect(action, `${tone} tone`).toMatch(new RegExp(`${tone}:`));
    }
  });

  it("only `primary` carries a solid fill", () => {
    const tone = (name: string): string => {
      const m = new RegExp(`\\n  ${name}:[\\s\\S]*?",`).exec(action);
      return m ? m[0] : "";
    };
    expect(tone("primary")).toMatch(/bg-brand-blue/);
    // A bordered or filled secondary is exactly how the hierarchy went flat.
    expect(tone("secondary")).not.toMatch(/\bborder\b/);
    expect(tone("secondary")).not.toMatch(/bg-brand/);
    expect(tone("danger")).not.toMatch(/bg-state-danger(?!\/)/);
  });

  it("every action row has AT MOST ONE primary", () => {
    const rows = actionRows();
    expect(rows.length, "the primitive must actually be in use").toBeGreaterThan(0);
    for (const r of rows) {
      const primaries = (r.body.match(/tone="primary"/g) ?? []).length;
      expect(primaries, `${r.file}: one recommended action per row`).toBeLessThanOrEqual(1);
    }
  });

  it("a cancel never competes with a confirm", () => {
    for (const r of actionRows()) {
      // If a row has a primary it must also have a non-primary sibling, and no
      // row may pair two equally-weighted bordered buttons.
      expect(r.body, `${r.file}: raw <button> bypasses the hierarchy`).not.toMatch(/<button/);
    }
  });

  it("the destructive branch uses the semantic danger tone", () => {
    const booking = read("components/app/conversation/worker-booking-action.tsx");
    expect(booking).toMatch(/tone="danger"[\s\S]{0,200}conversation-booking-decline/);
  });

  it("loading and disabled are distinguishable without colour", () => {
    // A spinner + aria-busy for loading; aria-disabled + not-allowed for
    // disabled. Opacity alone would be a colour-only signal.
    expect(action).toMatch(/aria-busy=\{loading/);
    expect(action).toMatch(/aria-disabled=\{disabled/);
    expect(action).toMatch(/animate-spin/);
    expect(action).toMatch(/cursor-not-allowed/);
    // …and the spinner stays visible (static) under reduced motion.
    expect(action).toMatch(/motion-reduce:animate-none/);
  });

  it("focus-visible is never suppressed", () => {
    for (const p of conversationFiles()) {
      expect(read(rel(p)), `${rel(p)}: outline-none kills the focus ring`).not.toMatch(
        /focus:outline-none|focus-visible:outline-none/,
      );
    }
  });
});

describe("a recommendation is server-derived or absent", () => {
  it("the chip renderer can mark exactly one choice", () => {
    expect(messages).toMatch(/c\.recommended/);
    expect(messages).toMatch(/data-recommended/);
    // The recommended chip is the solid one.
    expect(messages).toMatch(/c\.recommended[\s\S]{0,160}bg-brand-blue/);
  });

  it("the recommendation comes from the server's own missing-step ordering", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/res\.missingKeys/);
    expect(chat).toMatch(/CHIP_FOR_STEP/);
    // No client-side re-ranking or invented priority.
    expect(chat).not.toMatch(/\.sort\(/);
  });

  it("the pillar→chip map is partial, so no match means no recommendation", () => {
    // The map moved to its own PURE module (shared by the chat surface and
    // the W2 opening brief) — one definition, both consumers. W5: keyed by
    // the Player Card readiness pillars (the ONE completeness source).
    const chat = read("lib/conversation/worker-activity-chips.ts");
    expect(chat).toMatch(/Partial<Record<ReadinessPillarKey, string>>/);
    // Pillars not closable by these chips must be absent from the map.
    const map = /CHIP_FOR_STEP[^=]*=\s*\{([\s\S]*?)\};/.exec(chat)?.[1] ?? "";
    expect(map).not.toMatch(/\bprofession\b/);
    expect(map).not.toMatch(/\bskills\b/);
    expect(map).not.toMatch(/\bjournal\b/);
    expect(map).not.toMatch(/\bevidence\b/);
  });

  it("starter chips carry no recommendation at all", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    const starter = /const starterChips[\s\S]*?\);/.exec(chat)?.[0] ?? "";
    expect(starter, "no invented priority on the opening row").not.toMatch(/recommended/);
  });
});

describe("the composer grows with its content", () => {
  it("measures scrollHeight and applies it", () => {
    expect(composer).toMatch(/scrollHeight/);
    expect(composer).toMatch(/style\.height/);
  });

  it("resets to auto first, so it can shrink as well as grow", () => {
    // Reading scrollHeight on an already-tall box returns the OLD height, which
    // makes the field one-way. This is the whole bug.
    expect(composer).toMatch(/style\.height = "auto"/);
  });

  it("enforces the 44px floor in JS, so the first read is not inflated", () => {
    // A CSS min-height inflates the FIRST scrollHeight read (scrollHeight >=
    // clientHeight, and clientHeight obeys min-height), which made the box
    // shrink 2px the moment the user sent their first message.
    const floor = /const MIN_HEIGHT = (\d+)/.exec(composer);
    expect(floor, "an explicit JS floor must exist").not.toBeNull();
    expect(Number(floor![1])).toBeGreaterThanOrEqual(44);
    expect(composer, "no competing CSS floor on the textarea").not.toMatch(/min-h-\[44px\]/);
    expect(composer).toMatch(/Math\.max\(content, MIN_HEIGHT\)/);
    // border-box: an inline height includes the border, scrollHeight does not.
    // Without adding it back the box shrank by the border on every cycle.
    expect(composer, "border must be added back").toMatch(/borderTopWidth/);
  });

  it("caps the height and hands over to an internal scrollbar", () => {
    const cap = /const MAX_HEIGHT = (\d+)/.exec(composer);
    expect(cap, "an explicit cap must exist").not.toBeNull();
    const px = Number(cap![1]);
    expect(px).toBeGreaterThanOrEqual(180);
    expect(px).toBeLessThanOrEqual(220);
    expect(composer).toMatch(/Math\.min\(/);
    expect(composer).toMatch(/overflowY/);
  });

  it("measures before paint, so the field never visibly jumps", () => {
    expect(composer).toMatch(/useLayoutEffect/);
  });

  it("resets after a send", () => {
    expect(composer).toMatch(/setValue\(""\)/);
    // The reset flows through the same value-driven layout effect.
    expect(composer).toMatch(/useLayoutEffect\(resize, \[value, resize\]\)/);
  });

  it("keeps the Enter / Shift+Enter contract and the attach + send wiring", () => {
    expect(composer).toMatch(/e\.key === "Enter" && !e\.shiftKey/);
    expect(composer).toMatch(/composer-attach/);
    expect(composer).toMatch(/composer-send/);
    expect(composer).toMatch(/onAttach\(\)/);
  });
});

describe("icons use at most three optical categories", () => {
  it("the scale declares size AND stroke together", () => {
    expect(iconScale).toMatch(/export function iconInline/);
    expect(iconScale).toMatch(/export function iconControl/);
    expect(iconScale).toMatch(/strokeWidth/);
    // Stroke must LIGHTEN as the icon grows, or optical weight drifts.
    const inline = Number(/inline: ([\d.]+)/.exec(iconScale)![1]);
    const control = Number(/control: ([\d.]+)/.exec(iconScale)![1]);
    expect(inline).toBeGreaterThan(control);
  });

  it("no lucide icon on the chat surface hard-codes its own size", () => {
    const chatDir = join(APP_ROOT, "components", "app", "conversation", "chat");
    const offenders: string[] = [];
    for (const f of readdirSync(chatDir).filter((n) => n.endsWith(".tsx"))) {
      const src = read(rel(join(chatDir, f)));
      // `<Icon className="… size-N …">` — the spread helpers avoid this.
      const re = /<[A-Z][A-Za-z]*\s+className="[^"]*\bsize-[\d.]+/g;
      for (const m of src.match(re) ?? []) {
        if (m.includes("Loader2")) continue; // state spinner, sized by the primitive
        offenders.push(`${f}: ${m.slice(0, 48)}`);
      }
    }
    expect(offenders, "use iconInline()/iconControl()").toEqual([]);
  });
});

describe("touch targets stay at 44px", () => {
  it("chips, card actions and the header avatar are all >= 44px", () => {
    expect(messages, "chips").toMatch(/min-h-11 rounded-full/);
    expect(action, "every card action via the primitive").toMatch(/min-h-11/);
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    expect(header, "avatar").toMatch(/size-11/);
    expect(composer, "composer buttons").toMatch(/size-11/);
  });

it("form inputs reach 16px, so iOS never auto-zooms the page on focus", () => {
    // Safari on iOS zooms the viewport when a focused input's font-size is
    // below 16px. It is a mobile-usability defect, not a typography nicety.
    const form = read("components/app/conversation/inline-action-form.tsx");
    const inputCls = /const inputCls =[\s\S]*?"([^"]+)"/.exec(form)?.[1] ?? "";
    expect(inputCls, "inputCls must be found").toBeTruthy();
    expect(inputCls, "16px input text").toContain("text-body");
    expect(inputCls, "44px input height").toContain("min-h-11");
  });

  /**
   * The raw Tailwind size the ladder replaces. Shipped with a literal U+0008
   * where `\b` was intended (2026-07-26 → 2026-08-29), so the sweep below
   * found no offenders in ANY tree. `-` is not a word character, so `\b`
   * still sees `md:text-sm` and `text-sm/6`, and still passes `text-small`.
   */
  const TEXT_SM = /\btext-sm\b/;

  it("NEGATIVE CONTROL — the text-sm sweep can see an offender", () => {
    for (const hit of ['className="px-2 text-sm"', "md:text-sm", "text-sm/6 leading-5"]) {
      expect(TEXT_SM.test(hit), `must flag ${hit}`).toBe(true);
    }
    for (const miss of ["text-small", "text-support", "text-smx", "context-smart"]) {
      expect(TEXT_SM.test(miss), `must not flag ${miss}`).toBe(false);
    }
  });

  it("no text-sm survives on the conversation — every size is a ladder role", () => {
    const offenders = conversationFiles()
      .filter((p) => TEXT_SM.test(read(rel(p))))
      .map(rel);
    expect(offenders, "use text-body/support/basis/meta").toEqual([]);
  });

  it("text-only affordances still carry a 44px row", () => {
    // A bare text button ("Close", "Add another") has no intrinsic height, so
    // the `min-h-` sweep above cannot see it — these are named explicitly.
    for (const [file, marker] of [
      ["components/app/conversation/worker-cv-flow.tsx", "conversation.cv close"],
      ["components/app/conversation/inline-action-form.tsx", "addAnother"],
    ] as const) {
      const src = read(file);
      expect(src, `${file}: ${marker} needs a 44px row`).toMatch(
        /min-h-11[^"]*text-support|text-support[^"]*min-h-11/,
      );
    }
  });

  it("no interactive element on the surface drops to a sub-44px height", () => {
    const offenders: string[] = [];
    for (const p of conversationFiles()) {
      const src = read(rel(p));
      for (const m of src.match(/min-h-(\d+)/g) ?? []) {
        const n = Number(m.replace("min-h-", ""));
        // `min-h-0` is the flex-overflow idiom (`min-height: 0` on a flex child
        // so a scrolling area can actually shrink) — a LAYOUT declaration, not
        // a control height. It is exempt here and checked below instead: the
        // rule keeps its teeth because a CONTROL may still never carry it.
        if (m === "min-h-0") continue;
        // Tailwind spacing: 11 = 44px. Anything smaller on a control is a miss.
        if (n < 11) offenders.push(`${rel(p)}: ${m}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the flex-overflow idiom is never applied to a control", () => {
    // The compensating half of the `min-h-0` exemption above: a button, a link
    // or an input carrying it would be a genuine zero-height touch target.
    const offenders: string[] = [];
    for (const p of conversationFiles()) {
      const src = read(rel(p));
      const tags = src.match(/<(button|a|input|Link)\b[^>]*>/g) ?? [];
      for (const tag of tags) {
        if (/min-h-0/.test(tag)) offenders.push(`${rel(p)}: ${tag.slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
