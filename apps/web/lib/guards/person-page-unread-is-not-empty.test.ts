import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { locales } from "@/lib/i18n/config";

/**
 * An employer who opens a person found through the visibility consent gets no
 * profile id for them, so the page reads none of their services, work photos
 * or recorded work. It used to print "Nothing offered yet", "No work photos to
 * show" and "No recorded work yet" all the same: three claims about a record
 * that was never read (SEP-7 UNKNOWN is not ZERO, SEP-8 DATA EXISTS is not
 * VISIBLE). The sections are now withheld and one sentence says when they
 * appear.
 */
const root = join(__dirname, "..", "..");
const page = readFileSync(
  join(root, "app/[locale]/dashboard/people/[workerId]/page.tsx"),
  "utf8",
);

describe("person page: an unread record is not an empty record", () => {
  it("decides readability from the profile id the database returned", () => {
    expect(page).toMatch(/const recordReadable = Boolean\(worker\.profile_id\);/);
  });

  it.each(["person-services", "person-photos", "person-work"])(
    "renders %s only when the record was read",
    (testId) => {
      const at = page.indexOf(`data-testid="${testId}"`);
      expect(at).toBeGreaterThan(-1);
      const before = page.slice(0, at).trimEnd().split("\n");
      // The line that opens the section sits directly under the condition.
      expect(before[before.length - 1]).toMatch(/^\s*<section/);
      expect(before[before.length - 2].trim()).toBe("{recordReadable ? (");
    },
  );

  it("says when the withheld sections appear, in every catalog", () => {
    expect(page).toContain('t("sharedAfterWork")');
    for (const locale of locales) {
      const messages = JSON.parse(
        readFileSync(join(root, "messages", `${locale}.json`), "utf8"),
      ) as { people?: Record<string, string> };
      expect(messages.people?.sharedAfterWork, locale).toBeTruthy();
    }
  });
});
