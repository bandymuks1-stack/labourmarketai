import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

const page = read("app", "[locale]", "dashboard", "people", "[workerId]", "page.tsx");
const photos = read("lib", "journal", "personal-gallery.ts");
const services = read("lib", "services", "service-offerings.ts");

/** Executable source only — prose that documents a rule must never satisfy or
 *  break an assertion about the code that enforces it. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const photosFn = () =>
  codeOnly(photos).slice(codeOnly(photos).indexOf("export async function readWorkPhotosFor"));
const servicesFn = () =>
  codeOnly(services).slice(
    codeOnly(services).indexOf("export async function listActiveOfferingsByProvider"),
  );

/**
 * REAL WORK AND WHAT THIS PERSON CAN ACTUALLY DO.
 *
 * Both already existed and were rendered everywhere except on a person's own
 * page: the work photos on the author's own gallery, the service offerings on
 * the provider's own list and on the ORGANIZATION public page. A person's page
 * could show claims and no proof, and could name a profession but not the work
 * the person offers to do.
 *
 * Neither slice adds a store, a portfolio model or a second upload path.
 */

describe("the photos come from the existing journal evidence store", () => {
  it("reads journal_entry_photos and the journal-entry-photos bucket", () => {
    expect(photosFn()).toContain('from("journal_entry_photos")');
    expect(photosFn()).toContain('from("journal-entry-photos")');
    expect(page).toContain("readWorkPhotosFor");
  });

  it("selects NO journal narrative", () => {
    // This page's standing rule: no private narrative is selected here. The
    // personal gallery shows each photo beside the entry's own words because
    // it is the author reading their own diary; a visitor gets the work, not
    // the sentence about the day.
    const select = photosFn().slice(
      photosFn().indexOf('from("journal_entry_photos")'),
      photosFn().indexOf(".eq(\"profile_id\""),
    );
    expect(select).not.toContain("original_text");
    expect(page).not.toContain("entrySnippet");
  });

  it("is bounded — a profile is proof of work, not a photo archive", () => {
    expect(photos).toContain("PROFILE_WORK_PHOTO_LIMIT");
    expect(photosFn()).toContain(".limit(limit)");
  });
});

describe("the services are the person's own ACTIVE offerings", () => {
  it("filters to active, matching the table's own discovery policy", () => {
    // `service_offerings` carries a `status = 'active'` discovery policy
    // beside the owner policy. Filtering to active MATCHES the permission
    // rather than widening past it — a draft cannot leak even if the filter
    // were removed, and this keeps the surface honest about which is which.
    expect(servicesFn()).toContain('.eq("status", "active")');
    expect(servicesFn()).toContain('.eq("provider_id", providerId)');
    expect(page).toContain("listActiveOfferingsByProvider");
  });

  it("shows the provider's OWN words for the rate, never a computed figure", () => {
    // `rate_text` is free text the provider wrote. Nothing here derives,
    // converts or estimates a price.
    expect(page).toContain("rateText");
    expect(page).not.toMatch(/salary_(min|max)_eur/);
  });
});

describe("UNKNOWN is not ZERO, in both new sections", () => {
  it("each reader classifies failure as unavailable rather than empty", () => {
    expect(photosFn()).toContain('status: "unavailable"');
    expect(servicesFn()).toContain('kind: "unavailable"');
  });

  it("the page renders the failure branch BEFORE the empty branch", () => {
    // Otherwise a broken read falls through to "nothing offered" / "no
    // photos", which are claims a failed query has not earned.
    expect(page.indexOf('workPhotos.status === "unavailable"')).toBeLessThan(
      page.indexOf("workPhotos.photos.length === 0"),
    );
    expect(page.indexOf('offerings.kind === "unavailable"')).toBeLessThan(
      page.indexOf("offerings.rows.length === 0"),
    );
  });

  it("a missing preview is stated, never drawn as a broken image", () => {
    expect(page).toContain("photosPreviewsUnavailable");
    expect(photosFn()).toContain("previewsUnavailable");
  });
});

describe("PERMISSION STAYS THE DATABASE'S", () => {
  it("neither reader reaches for a service role", () => {
    // journal_entry_photos and storage.objects BOTH carry an org-manager
    // policy for this bucket, so a manager of the organization the work was
    // done for can read the row and mint a signed URL — and nobody else can
    // do either. A service-role client would bypass exactly that and publish
    // one person's photographs to anyone who can open the page.
    for (const fn of [photosFn(), servicesFn()]) {
      expect(fn).toContain("createClient()");
      expect(fn).not.toMatch(/service[_-]?role/i);
      expect(fn).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });

  it("no policy, grant or membership truth is invented in either module", () => {
    for (const src of [codeOnly(photos), codeOnly(services)]) {
      expect(src).not.toMatch(/\bgrant\b/i);
      expect(src).not.toMatch(/create\s+policy/i);
      expect(src).not.toContain("company_memberships");
    }
  });

  it("the page still selects no contact detail", () => {
    const select = page.slice(page.indexOf('.from("workers")'), page.indexOf('.eq("id", workerId)'));
    for (const forbidden of ["email", "phone", "address"]) {
      expect(select.toLowerCase()).not.toContain(forbidden);
    }
  });
});
