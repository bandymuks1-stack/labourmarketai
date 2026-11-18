/**
 * GUARD — every element a Maestro journey taps or waits for exists in the app.
 *
 * The emulator and simulator journeys (`apps/mobile/.maestro/*.yaml`) navigate
 * by testID only. A renamed or removed testID is otherwise found an hour later,
 * by a red emulator run. This reads each flow's `id:` selectors and requires
 * each to appear as a testID in the native app's source: an exact id as a
 * literal, an id ending in `.*` (a database uuid at run time) by its stable
 * prefix, the way the screens build it (`need-close-${needId}`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MOBILE = resolve(__dirname, "../../../mobile");
const FLOWS = join(MOBILE, ".maestro");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(readFileSync(p, "utf8"));
  }
  return out;
}

const APP = [...sources(join(MOBILE, "app")), ...sources(join(MOBILE, "src"))].join("\n");

/** Every quoted `id:` selector in a flow (testIDs; never text selectors). */
function selectors(flow: string): string[] {
  return [...flow.matchAll(/^\s*id:\s*"([^"]+)"/gm)].map((m) => m[1]!);
}

/** Every literal string in the app, and every template literal as a pattern
 *  (`need-${op}-${needId}` → /^need-.+-.+$/). A template made only of
 *  interpolations (a date, `${a}-${b}`) would match anything, so only one with
 *  a word-like literal part (`need-`, `-confirm-`, `-label`) counts. */
const LITERALS = new Set([...APP.matchAll(/"([A-Za-z0-9_.:-]+)"|'([A-Za-z0-9_.:-]+)'/g)].map((m) => m[1] ?? m[2]!));
const TEMPLATES = [...APP.matchAll(/`([^`]*\$\{[^`]*)`/g)]
  .map((m) => m[1]!.split(/\$\{[^}]*\}/))
  .filter((parts) => parts.some((part) => part.length >= 4 && /[A-Za-z]/.test(part)))
  .map(
    (parts) =>
      new RegExp("^" + parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+") + "$"),
  );
/** A flow id ending in `.*` stands for a database uuid at run time. */
const SAMPLE_UUID = "00000000-0000-4000-8000-000000000000";

function present(id: string): boolean {
  // Alternation ("a|b") in a wait: every alternative must exist.
  if (id.includes("|")) return id.split("|").every(present);
  const concrete = id.endsWith(".*") ? id.slice(0, -2) + SAMPLE_UUID : id;
  return LITERALS.has(concrete) || TEMPLATES.some((t) => t.test(concrete));
}

describe("Maestro journeys only use testIDs the app has", () => {
  const flows = readdirSync(FLOWS).filter((f) => f.endsWith(".yaml"));

  it("finds the journeys", () => {
    expect(flows).toContain("employer-screens-journey.yaml");
  });

  it("refuses an id the app does not have", () => {
    expect(present("no-such-test-id-anywhere")).toBe(false);
    expect(present("candidates-nowhere-.*")).toBe(false);
    expect(present("need-close-.*")).toBe(true);
  });

  for (const file of flows) {
    it(file, () => {
      const missing = selectors(readFileSync(join(FLOWS, file), "utf8")).filter((id) => !present(id));
      expect(missing, `${file}: ids with no matching testID in apps/mobile`).toEqual([]);
    });
  }
});
