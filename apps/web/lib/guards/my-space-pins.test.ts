import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    expect(ROW).toMatch(/aria-label=\{labels\.moveEarlier\.replace\("\{label\}", p\.label\)\}/);
    expect(ROW).toMatch(/aria-label=\{labels\.moveLater\.replace\("\{label\}", p\.label\)\}/);
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
    // chip, the row only for a pressed "add" button.
    const pinCalls = CHAT.match(/\bpinAction\(\{/g) ?? [];
    expect(pinCalls.length).toBe(1);
    expect((ROW.match(/\bpinAction\(\{/g) ?? []).length).toBe(1);
    expect(ROW).toMatch(/onClick=\{\(\) => void add\(place\)\}/);
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
      for (const key of ["mySpaceTitle", "chipManagePins", "pinAsk", "chipPinYes", "chipPinNo", "pinDone", "pinCap", "pinUnavailable", "pinsManageIntro", "pinsNone", "unpinPrefix", "unpinDone", "pinFirstPrefix", "reorderDone", "pinAdd", "pinEditDone", "pinEditYours", "pinAddHeading", "pinAddNone", "pinRecent", "pinMoveEarlier", "pinMoveLater", "pinRemove", "pinAdded", "pinMoved"]) {
        expect(chat[key], `${locale}.${key}`).toBeTypeOf("string");
        expect(chat[key]).not.toMatch(/^\[EN\]/);
      }
      expect(chat.pinCap).toContain("{max}");
      for (const key of ["pinMoveEarlier", "pinMoveLater", "pinRemove"]) expect(chat[key], `${locale}.${key}`).toContain("{label}");
      for (const key of ["pinAdd", "pinEditDone", "pinAdded", "pinMoved"]) expect(chat[key]).not.toMatch(/\bdemo\b/i);
    }
  });
});
