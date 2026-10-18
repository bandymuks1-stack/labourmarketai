import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Modal focus contract (2026-09-20). A `role="dialog"` + `aria-modal="true"`
 * surface tells assistive tech that the page underneath is inert; the
 * browser does nothing to make that true. Each modal must therefore own
 * focus itself: move it in, trap Tab, close on Escape, restore the opener.
 *
 * `MobileSheet` had the correct block; the batch-confirm dialog, the edit
 * drawer and the feedback widget did not (a keyboard user Tabbed straight
 * through the dialog into the page it covered). The block now lives ONCE in
 * `lib/hooks/use-dialog-focus.ts`; this guard requires every modal under
 * `components/` to use it — or to carry the same handling inline
 * (`activeElement` + a "Tab" branch), which `header-search.tsx` does.
 */
const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

const HOOK_IMPORT = /from "@\/lib\/hooks\/use-dialog-focus"/;
const INLINE = (src: string) => src.includes("document.activeElement") && /"Tab"/.test(src);

describe("dialog focus contract", () => {
  it("the hook itself carries all four behaviours", () => {
    const src = read("lib/hooks/use-dialog-focus.ts");
    expect(src).toMatch(/e\.key === "Escape"/);
    expect(src).toMatch(/e\.key !== "Tab"/);
    expect(src).toMatch(/document\.activeElement === head/);
    expect(src).toMatch(/document\.activeElement === tail/);
    expect(src).toMatch(/opener\?\.focus\?\.\(\)/);
    expect(src).toMatch(/first\?\.focus\(\)/);
  });

  it("every aria-modal dialog under components/ uses the hook (or the same handling inline)", () => {
    const root = join(web, "components");
    const offenders = walk(root)
      .filter((p) => {
        const src = readFileSync(p, "utf8");
        if (!/role="dialog"/.test(src) || !/aria-modal="true"/.test(src)) return false;
        return !(HOOK_IMPORT.test(src) && /useDialogFocus\(/.test(src)) && !INLINE(src);
      })
      .map((p) => relative(web, p).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });

  it("the known modals are wired to the hook (not an allowlist — a presence check)", () => {
    for (const f of [
      "components/ui/MobileSheet.tsx",
      "components/app/quick-confirm-batch.tsx",
      "components/app/journal-entry-edit-launcher.tsx",
      "components/app/language-feedback-widget.tsx",
      "components/marketing/waitlist-modal.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toMatch(HOOK_IMPORT);
      expect(src, f).toMatch(/useDialogFocus\(/);
      // The hook must be handed the panel it traps focus in.
      expect(src, f).toMatch(/ref=\{(panelRef|dialogRef)\}/);
    }
  });
});
