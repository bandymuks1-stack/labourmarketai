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
  it("renders nothing when nothing is pinned, and every pin runs handleChip with its ref", () => {
    expect(ROW).toMatch(/if \(pins\.length === 0\) return null;/);
    expect(CHAT).toMatch(/onPin=\{\(ref\) => handleChip\(\{ id: ref, label: pinLabelFor\(ref\) \}\)\}/);
    expect(CHAT).toMatch(/onManage=\{\(\) => handleChip\(\{ id: "pins:manage"/);
  });

  it("pins are read on the server for THIS workspace and `null` means no row and no ask", () => {
    expect(PAGE).toMatch(/listMyPins\(identity === "company" \? workspace\.organizationId : null\)/);
    expect(PAGE).toMatch(/pins = pinsRead\.kind === "ok" \? pinsRead\.pins : null/);
    expect(CHAT).toMatch(/const pinsAvailable = pins !== null;/);
    expect(CHAT).toMatch(/if \(!pinsAvailable \|\| !isPinnableRef\(ref\)\) return;/);
  });

  it("the ask happens once per reference after repeated use, never silently pins", () => {
    expect(CHAT).toMatch(/shouldAskToPin\(next, ref, now, new Set\(pinned\.map\(\(p\) => p\.ref\)\), usageRef\.current\.asked\)/);
    expect(CHAT).toMatch(/assistant\(labels\.pinAsk, \[/);
    expect(CHAT).toMatch(/id: `pin:\$\{ref\}`, label: labels\.chipPinYes/);
    expect(CHAT).toMatch(/id: `pin-no:\$\{ref\}`, label: labels\.chipPinNo/);
    // No automatic pinAction outside the explicit "Add" chip.
    const pinCalls = CHAT.match(/\bpinAction\(\{/g) ?? [];
    expect(pinCalls.length).toBe(1);
  });

  it("pin chips are handled before usage counting; unpin lives in the manage list", () => {
    expect(CHAT).toMatch(/if \(runPinChip\(chip\.id\)\) return;\s*noteUsage\(chip\.id, chip\.label\);/);
    expect(CHAT).toMatch(/id: `unpin:\$\{p\.ref\}`/);
    expect(CHAT).toMatch(/labels\.pinCap\.replace\("\{max\}", String\(PIN_CAP\)\)/);
  });

  it("copy exists in all 11 catalogs", () => {
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const chat = JSON.parse(read(`messages/${locale}.json`)).conversation.chat as Record<string, string>;
      for (const key of ["mySpaceTitle", "chipManagePins", "pinAsk", "chipPinYes", "chipPinNo", "pinDone", "pinCap", "pinUnavailable", "pinsManageIntro", "pinsNone", "unpinPrefix", "unpinDone"]) {
        expect(chat[key], `${locale}.${key}`).toBeTypeOf("string");
        expect(chat[key]).not.toMatch(/^\[EN\]/);
      }
      expect(chat.pinCap).toContain("{max}");
    }
  });
});
