import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseCompanyNeedPrefill } from "@/lib/staffing/company-need-prefill";

/**
 * A PUBLIC JOB LEADS AN EMPLOYER TO THE NEED FORM (completion phase
 * 2026-11-16, employer acquisition). Public job pages are the largest organic
 * surface; before, nothing on them led someone hiring for that work anywhere.
 */

const page = readFileSync(resolve(__dirname, "..", "..", "app/[locale]/(marketing)/jobs/[id]/page.tsx"), "utf8");

describe("the employer's door on a public job", () => {
  it("is shown to signed-out visitors only, tracked, and labelled with the need form's own title", () => {
    expect(page).toMatch(/\{!member && \(\s*<p className="mt-8">\s*<TrackedCta\s+ctaId="public_job_employer_need"\s+audience="companies"/);
    expect(page).toMatch(/\{tNeed\("title"\)\} →/);
    expect(page).toMatch(/getTranslations\(\{ locale: active, namespace: "companyNeed" \}\)/);
  });

  it("opens the ONE need form with the job's profession, through the form's own bounded prefill", () => {
    expect(page).toMatch(/const employerNeedHref = `\/company-need\?\$\{new URLSearchParams\(\{/);
    expect(page).toMatch(/profession: preview\.professionSlug/);
    expect(page).toMatch(/from: "public_job"/);
    // What the form reads back: a known work type is kept, an unknown slug is dropped.
    const known = parseCompanyNeedPrefill(new URLSearchParams({ profession: "other_general", from: "public_job" }));
    expect(known).toMatchObject({ profession: "other_general", entry: "public_job" });
    const unknown = parseCompanyNeedPrefill(new URLSearchParams({ profession: "not-a-real-slug", from: "public_job" }));
    expect(unknown.profession).toBeUndefined();
    expect(unknown.entry).toBe("public_job");
  });

  it("adds no structured data and reveals nothing the page keeps for members", () => {
    const door = page.slice(page.indexOf("THE EMPLOYER'S DOOR"), page.indexOf("{attribution && ("));
    expect(door.length).toBeGreaterThan(0);
    expect(door).not.toMatch(/member\?\.|titleRaw|JobPosting|ld\+json/);
  });
});
