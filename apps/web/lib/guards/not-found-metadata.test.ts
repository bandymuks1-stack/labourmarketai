import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UX-9: a thrown `notFound()` takes its <title> and robots from the nearest
 * `not-found.tsx`, never from the page that threw. A not-found file under
 * `app/[locale]` without its own metadata falls back to the layout's title, so a
 * missing job showed the home page title (walk public-readiness 42489920368).
 * Every such file names the not-found title and stays out of the index.
 */
const webRoot = join(__dirname, "..", "..");
const localeDir = join(webRoot, "app", "[locale]");

function notFoundFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return notFoundFiles(path);
    return name === "not-found.tsx" ? [path] : [];
  });
}

describe("every localized not-found page carries its own metadata", () => {
  const files = notFoundFiles(localeDir);

  it("finds the localized not-found pages", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of files) {
    it(relative(webRoot, file), () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/export async function generateMetadata\(/);
      expect(src).toMatch(/getTranslations\("notFound"\)/);
      expect(src).toMatch(/title: t\("title"\)/);
      expect(src).toMatch(/robots: \{ index: false, follow: false \}/);
    });
  }
});
