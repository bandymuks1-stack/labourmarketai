import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

import { resolveChatLabels } from "@/components/app/conversation/chat/labels";

/**
 * MY SPACE — wiring guard (owner contract 2026-09-04 §4C). The pinned row is
 * the person's own desktop above the conversation: references only, the
 * same handlers the chips run, the ask after repeated use, never a
 * pre-filled desktop, honest when the store is unavailable.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const PAGE = read("app/[locale]/dashboard/page.tsx");
const ROW = read("components/app/conversation/chat/my-space-row.tsx");

describe("the pinned row is a reference row over the ONE chip handler", () => {
  it("is never pre-filled, and every pin runs handleChip with its ref", () => {
    // Pin to home (owner P0 No. 1, 2026-11-12): with nothing pinned the row
    // holds only the way to add a shortcut — it is absent altogether when the
    // store cannot be read (`editor === null`). Nothing is pinned for anyone.
    expect(ROW).toMatch(/if \(pins\.length === 0 && recent\.length === 0 && !editor\) return null;/);
    expect(CHAT).toMatch(/onPin=\{\(ref\) => handleChip\(\{ id: ref, label: pinLabelFor\(ref\) \}\)\}/);
    expect(CHAT).toMatch(/editor=\{\s*pinsAvailable\s*\?/);
  });

  it("editing is the row's own — add, remove, move — through the same three pin actions", () => {
    expect(ROW).toMatch(/pinAction\(\{ ref: place\.ref, label: place\.label, expectedWorkspaceId: editor\?\.expectedWorkspaceId \}\)/);
    expect(ROW).toMatch(/unpinAction\(\{ ref, expectedWorkspaceId: editor\?\.expectedWorkspaceId \}\)/);
    expect(ROW).toMatch(/reorderPinsAction\(\{ refs: next\.map\(\(p\) => p\.ref\), expectedWorkspaceId: editor\?\.expectedWorkspaceId \}\)/);
    // It never writes into the thread: an edit must not replace the home.
    const rowCode = ROW.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rowCode).not.toMatch(/handleChip|assistant\(/);
    // Keyboard and assistive tech: named buttons, a disclosed panel, a polite status.
    expect(ROW).toMatch(/aria-expanded=\{editing\}/);
    // MANAGE (V2): the chip itself is the handle — arrow keys or a drag (pointer
    // events, so a finger works too) — with a small remove control; no list of
    // arrow buttons. A keyboard move keeps the focus on the moved chip.
    expect(ROW).toMatch(/aria-label=\{labels\.moveHandle\.replace\("\{label\}", p\.label\)\}/);
    expect(ROW).toMatch(/aria-keyshortcuts="ArrowLeft ArrowRight"/);
    expect(ROW).toMatch(/e\.key === "ArrowLeft" \|\| e\.key === "ArrowUp" \? -1/);
    expect(ROW).toMatch(/onPointerDown=\{\(e\) => onHandleDown\(e, p\.ref\)\}/);
    // Followed on the window, so a re-order that moves the chip in the DOM,
    // or a release outside the row, still ends the drag.
    expect(ROW).toMatch(/window\.addEventListener\("pointerup", end\)/);
    expect(ROW).toMatch(/window\.addEventListener\("pointercancel", end\)/);
    expect(ROW).toMatch(/window\.removeEventListener\("pointermove", onMove\)/);
    expect(rowCode).not.toMatch(/setPointerCapture/);
    expect(ROW).toMatch(/useEffect\(\(\) => \(\) => drag\.current\?\.\(\), \[\]\);/);
    expect(ROW).toMatch(/touch-none/);
    expect(ROW).toMatch(/refocus\.current = pins\[index\]\.ref;/);
    expect(ROW).toMatch(/handleEls\.current\.get\(refocus\.current\)\?\.focus\(\)/);
    // One stored write per gesture: the drag previews locally and saves on release.
    expect(ROW).toMatch(/if \(ev\.type === "pointerup" && moved\) saveOrder\(order\);/);
    expect(rowCode).not.toMatch(/my-space-move-earlier|my-space-move-later|draggable/);
    // The remove control is small to look at and a full 44px to press.
    expect(ROW).toMatch(/flex size-11 flex-none[^"]*"\s*data-testid="my-space-remove"/);
    expect(ROW).toMatch(/\{labels\.manageHint\}/);
    expect(ROW).toMatch(/aria-label=\{labels\.remove\.replace\("\{label\}", p\.label\)\}/);
    expect(ROW).toMatch(/role="status" aria-live="polite"/);
    expect(ROW).toMatch(/e\.key !== "Escape"/);
    // Only what the server offered can be added, and only what is not pinned yet.
    expect(ROW).toMatch(/const addable = \(places \?\? \[\]\)\.filter\(\(p\) => !pinnedRefs\.has\(p\.ref\)\);/);
  });

  it("pins are read on the server for THIS workspace and `null` means no row and no ask", () => {
    // RE-ANCHORED (owner program 2026-09-23): the READ scope is the active
    // organization workspace — the SAME id `pins-actions` writes to (its
    // `getActiveOrganizationContext` is a projection of the one resolution).
    // The old read used the employer-resolved org (null for an unbound or
    // non-governed organization), so a pin written in one scope was read back
    // from another.
    expect(PAGE).toMatch(/listMyPins\(activeOrgWorkspace\?\.id \?\? null\)/);
    expect(PAGE).not.toMatch(/listMyPins\(identity === "company" \? workspace\.organizationId/);
    expect(PAGE).toMatch(/pins = pinsRead\.kind === "ok" \? pinsRead\.pins : null/);
    expect(CHAT).toMatch(/const pinsAvailable = pins !== null;/);
    expect(CHAT).toMatch(/if \(!pinsAvailable \|\| !isPinnableRef\(ref\)\) return;/);
  });

  it("the ask happens once per reference after repeated use, never silently pins", () => {
    expect(CHAT).toMatch(/shouldAskToPin\(next, ref, now, new Set\(pinned\.map\(\(p\) => p\.ref\)\), usageRef\.current\.asked\)/);
    expect(CHAT).toMatch(/assistant\(labels\.pinAsk, \[/);
    expect(CHAT).toMatch(/id: `pin:\$\{ref\}`, label: labels\.chipPinYes/);
    expect(CHAT).toMatch(/id: `pin-no:\$\{ref\}`, label: labels\.chipPinNo/);
    // No automatic pinAction: the chat calls it only for the explicit "Add"
    // chip, the row only for a pressed control: its own "add" button, and the
    // pin toggle a person presses on a function card (the card asks the row
    // through `lib/workspace/pin-sync.ts`; the card itself never writes).
    const pinCalls = CHAT.match(/\bpinAction\(\{/g) ?? [];
    expect(pinCalls.length).toBe(1);
    expect((ROW.match(/\bpinAction\(\{/g) ?? []).length).toBe(2);
    expect(ROW).toMatch(/onClick=\{\(\) => void add\(place\)\}/);
    expect(ROW).toMatch(/const onCardToggle: PinToggleHandler = async \(\{ ref, label \}\) => \{/);
    expect(ROW).toMatch(/setPinToggleHandler\(\(request\) => toggleFromCard\.current\(request\)\)/);
    // The only caller of the row's handler is a pressed toggle on a card.
    const CARD = readFileSync(join(process.cwd(), "components/app/home/home-goal-navigator.tsx"), "utf8");
    expect((CARD.match(/requestPinToggle\(/g) ?? []).length).toBe(1);
    expect(CARD).toMatch(/onToggle: \(\) => toggle\(pinning\.ref, card\.label\)/);
  });

  it("pin chips are handled before usage counting; unpin lives in the manage list", () => {
    expect(CHAT).toMatch(/if \(runPinChip\(chip\.id\)\) return;\s*noteUsage\(chip\.id, chip\.label\);/);
    expect(CHAT).toMatch(/id: `unpin:\$\{p\.ref\}`/);
    expect(CHAT).toMatch(/labels\.pinCap\.replace\("\{max\}", String\(PIN_CAP\)\)/);
  });

  it("REORDER is an ordinary-human gesture — \"put this first\" — through the canonical reorder action", () => {
    expect(CHAT).toContain('if (id.startsWith("pin-first:"))');
    // The whole new order, bound to the workspace the chat displayed (#1849
    // residue, 2026-09-24): a reorder from a stale screen is refused, never
    // written into the workspace that was switched in another window.
    expect(CHAT).toContain(
      "reorderPinsAction({ refs: next.map((p) => p.ref), expectedWorkspaceId })",
    );
    // The first pin gets no "move first" chip; every other pin does.
    expect(CHAT).toContain("...(i > 0 ? [{ id: `pin-first:${p.ref}`");
    for (const locale of ["lt", "en", "ru", "nl", "de", "pl"]) {
      expect((JSON.parse(read(`messages/${locale}.json`)).conversation.chat as Record<string, string>).reorderDone).toContain("{label}");
    }
  });

  it("copy exists in all 11 catalogs", () => {
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const chat = JSON.parse(read(`messages/${locale}.json`)).conversation.chat as Record<string, string>;
      for (const key of ["mySpaceTitle", "chipManagePins", "pinAsk", "chipPinYes", "chipPinNo", "pinDone", "pinCap", "pinUnavailable", "pinsManageIntro", "pinsNone", "unpinPrefix", "unpinDone", "pinFirstPrefix", "reorderDone", "pinAdd", "pinEditDone", "pinAddHeading", "pinAddNone", "pinRecent", "pinMoveHandle", "pinManageHint", "pinRemove", "pinAdded", "pinMoved", "pinHiddenHeading"]) {
        expect(chat[key], `${locale}.${key}`).toBeTypeOf("string");
        expect(chat[key]).not.toMatch(/^\[EN\]/);
      }
      expect(chat.pinCap).toContain("{max}");
      for (const key of ["pinMoveHandle", "pinRemove"]) expect(chat[key], `${locale}.${key}`).toContain("{label}");
      for (const key of ["pinAdd", "pinEditDone", "pinAdded", "pinMoved"]) expect(chat[key]).not.toMatch(/\bdemo\b/i);
    }
  });
});

describe("the row's templated labels reach the client as templates, in every build", () => {
  // Codex P2 on #3264. `t(key)` on a message with a placeholder and no value
  // is a formatting error: a production build returns the template, a
  // DEVELOPMENT build returns the message key — the row's buttons were then
  // named "conversation.chat.pinRemove". Vitest runs the development build,
  // so this drives the real resolver over the real catalogs.
  for (const locale of ["en", "lt", "ru", "nl", "de", "pl", "sv"]) {
    it(`${locale}: placeholders survive and no label is a message key`, () => {
      const messages = JSON.parse(read(`messages/${locale}.json`));
      const errors: string[] = [];
      const translator = (namespace: string) =>
        createTranslator({
          locale,
          messages,
          namespace: namespace as never,
          // The other templated chat labels keep their historical path and
          // report here in a development build; only the pin row's are pinned.
          onError: (e) => errors.push(e.message),
        });
      const labels = resolveChatLabels(
        translator("conversation.chat") as never,
        translator("projects.assign.reservation") as never,
      ) as unknown as Record<string, string>;
      expect(labels.pinCap).toContain("{max}");
      for (const key of ["reorderDone", "pinMoveHandle", "pinRemove"]) {
        expect(labels[key], `${locale}.${key}`).toContain("{label}");
      }
      for (const key of ["pinCap", "reorderDone", "pinMoveHandle", "pinManageHint", "pinRemove", "pinAdd", "pinHiddenHeading"]) {
        expect(labels[key], `${locale}.${key}`).not.toMatch(/^conversation\.chat\./);
        expect(errors.filter((m) => m.includes(`conversation.chat.${key}`)), `${locale}.${key}`).toEqual([]);
      }
    });
  }
});

describe("a pin that is not drawn can still be removed — and only removed", () => {
  it("the page hands the withheld pins to the row separately from the drawn ones", () => {
    expect(PAGE).toMatch(/const withheld = pins \? withheldPins\(pins, goalAdmission\) : \[\];/);
    expect(PAGE).toMatch(/withheldPins=\{withheld\}/);
  });

  it("the row lists them as text with one control: remove", () => {
    const start = ROW.indexOf("editor.withheld.length > 0");
    const block = ROW.slice(start, ROW.indexOf("(places?.length ?? 0) > 0", start));
    expect(start).toBeGreaterThan(-1);
    expect(block).toMatch(/data-testid="my-space-withheld-remove"/);
    expect(block).toMatch(/onClick=\{\(\) => void removeWithheld\(p\.ref\)\}/);
    // Never launchable: no onPin, no link, exactly one button.
    expect(block).not.toMatch(/onPin|<Link|href=/);
    expect((block.match(/<button/g) ?? []).length).toBe(1);
    expect(ROW).toMatch(/await unpinAction\(\{ ref, expectedWorkspaceId: editor\.expectedWorkspaceId \}\)/);
  });
});

