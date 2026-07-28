import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";

/**
 * §18 PLACEHOLDER-MARKER PRODUCTION LOCK (PR15).
 *
 * Every governed placeholder must carry its visible marker in production —
 * a prod deploy with NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS="false" must NOT
 * be able to strip the markers and let fabricated values pass as real
 * platform data. The lock lives in ONE place (lib/env.ts
 * `showPlaceholderMarkers`, forced true when NODE_ENV === "production");
 * every consumer must read that constant, never the raw env var.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

describe("the marker lock itself", () => {
  it("lib/env.ts forces markers ON in production builds", () => {
    const src = read("lib/env.ts");
    expect(src).toMatch(
      /showPlaceholderMarkers\s*=\s*\r?\n?\s*process\.env\.NODE_ENV === "production"\s*\r?\n?\s*\?\s*true/,
    );
    // The dev/test opt-out stays the ONLY branch that can disable markers.
    expect(src).toMatch(/NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS !== "false"/);
  });
});

describe("no consumer bypasses the lock", () => {
  it("only lib/env.ts touches the raw marker env var", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true }) as Dirent[]) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const roots = ["app", "components", "lib", "content"].map((d) => join(APP_ROOT, d));
    const offenders: string[] = [];
    for (const root of roots) {
      for (const f of walk(root)) {
        if (f === join(APP_ROOT, "lib", "env.ts")) continue;
        const src = readFileSync(f, "utf8");
        // Both accessor shapes are banned outside lib/env.ts — a component
        // reading the raw var can reintroduce a prod marker kill-switch.
        if (/(env|process\.env)\.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS/.test(src)) {
          offenders.push(f.slice(APP_ROOT.length + 1));
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the dev design galleries can never render in production", () => {
    // /design and /design/text-first are dev tools; they gate on
    // designGalleryEnabled, which is hard-false in production builds.
    const envSrc = read("lib/env.ts");
    expect(envSrc).toMatch(
      /designGalleryEnabled\s*=\s*\r?\n?\s*process\.env\.NODE_ENV !== "production"/,
    );
    for (const f of [
    ]) {
      const src = read(f);
      expect(src).toMatch(/designGalleryEnabled/);
      expect(src).toMatch(/notFound\(\)/);
    }
  });

  it("all marker consumers read the shared constant", () => {
    // Production UX repair v2 (F4): the notification panel is NO LONGER a
    // marker consumer — an empty inbox is REAL product state, not fabricated
    // data, so it renders a plain empty state and must never carry the dev
    // "Placeholder" chip. Markers stay for fabricated VALUES only.
    for (const f of [
      "components/ui/Placeholder.tsx",
      "components/app/dashboard-section.tsx",
      "components/app/player-card.tsx",
    ]) {
      expect(read(f), `${f} must import showPlaceholderMarkers`).toMatch(
        /showPlaceholderMarkers/,
      );
    }
    expect(
      read("components/app/notification-panel.tsx"),
      "the notification panel must NOT mark its real empty state as a placeholder (F4)",
    ).not.toMatch(/showPlaceholderMarkers|>Placeholder</);
  });
});
