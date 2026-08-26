import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

import { activeLocales } from "@/lib/i18n/config";

/**
 * THE ADMIN QUEUE NAMES ITS DOCUMENT TYPES.
 *
 * It printed the stored slug — "posting_notification" — where every other
 * surface says "Posting notification". The catalogue that names them already
 * existed and the worker-facing document centre already reads it.
 *
 * The fallback is the interesting half. Production holds 19 document types and
 * the catalogue names 12, so a bare `t()` would have rendered the echoed key
 * path (`types.a1_certificate`) for the other seven — trading one internal
 * word for a worse one. An unnamed type therefore renders as an explicitly
 * marked IDENTIFIER, which is honest: it does not pretend to be a name.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
const PAGE = read(
  "app",
  "[locale]",
  "dashboard",
  "admin",
  "readiness",
  "page.tsx",
);

describe("the queue reads the document-type catalogue", () => {
  it("resolves a name instead of printing the slug", () => {
    expect(PAGE).toMatch(/getTranslations\("documents"\)/);
    expect(PAGE).toMatch(/typeLabel\(d\.documentTypeSlug\)/);
  });

  it("the label opens on the resolved name, not the slug", () => {
    // The slug legitimately survives inside the marked-identifier fallback and
    // as the lookup argument, so ABSENCE is the wrong assertion. Position is
    // the real invariant: the label span must open on `typeLabel(...)`.
    const span = PAGE.indexOf('<span className="text-sm text-text-primary">');
    expect(span).toBeGreaterThan(0);
    const head = PAGE.slice(span, span + 120);
    expect(head).toMatch(/\{typeLabel\(d\.documentTypeSlug\)/);
  });

  it("an unnamed type degrades to a marked identifier, not a key path", () => {
    expect(PAGE).toMatch(/tDocs\.has\(/);
    expect(PAGE).toMatch(/<code/);
  });
});

describe("the names it reads actually resolve", () => {
  it.each([...activeLocales])("%s", (loc) => {
    const messages = JSON.parse(read("messages", `${loc}.json`));
    const t = createTranslator({ locale: loc, messages });
    // A type the catalogue DOES name must resolve — otherwise the guarded
    // lookup silently falls to the identifier for everything, and the fix
    // would be invisible while looking correct.
    const key = "documents.types.posting_notification";
    const out = t(key as never);
    expect(out, `${loc} ${key}`).not.toContain(key);
    expect(out.trim().length, `${loc} empty`).toBeGreaterThan(0);
  });
});
