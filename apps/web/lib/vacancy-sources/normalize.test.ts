import { describe, expect, it } from "vitest";

import {
  computeVacancyContentHash,
  normalizeNavEntry,
  planVacancyUpsert,
  sanitizeDescription,
  type ExternalVacancyV1,
} from "./normalize";
import { NAV_IMPORT_BOUNDS } from "./nav-feed-contract";
import {
  NAV_FIXTURE_ACTIVE_DETAIL,
  NAV_FIXTURE_INACTIVE_DETAIL,
  NAV_FIXTURE_MASKED_DETAIL,
} from "./nav-fixtures";

const IMPORTED_AT = "2026-07-17T12:00:00Z";

function activeVacancy(): ExternalVacancyV1 {
  const r = normalizeNavEntry(NAV_FIXTURE_ACTIVE_DETAIL, {
    importedAtIso: IMPORTED_AT,
  });
  if (r.kind !== "vacancy") throw new Error(`expected vacancy, got ${r.kind}`);
  return r.vacancy;
}

describe("normalizeNavEntry — determinism + canonical shape", () => {
  it("an ACTIVE entry normalizes deterministically (same input → identical output)", () => {
    const a = activeVacancy();
    const b = activeVacancy();
    expect(a).toEqual(b);
    expect(a.content_hash).toBe(b.content_hash);
    expect(a.source_key).toBe("nav_arbeidsplassen");
    expect(a.source_country).toBe("NO");
    expect(a.language).toBe("no");
    expect(a.status).toBe("active");
    expect(a.title).toBe("Tømrer / Carpenter (fixture)");
    expect(a.employer_display_name).toBe("Fixture Bygg AS");
    expect(a.canonical_source_url).toContain("arbeidsplassen.nav.no");
    expect(a.application_url).toBe("https://fixture-bygg.example/jobb/soknad");
    expect(a.source_attribution).toBe("arbeidsplassen.no (NAV)");
    expect(a.occupation_categories).toEqual(["Tømrer og snekker"]);
    expect(a.imported_at).toBe(IMPORTED_AT);
  });

  it("content_hash is stable across imported_at and changes when content changes", () => {
    const a = normalizeNavEntry(NAV_FIXTURE_ACTIVE_DETAIL, {
      importedAtIso: "2026-07-17T12:00:00Z",
    });
    const b = normalizeNavEntry(NAV_FIXTURE_ACTIVE_DETAIL, {
      importedAtIso: "2026-07-18T09:00:00Z",
    });
    if (a.kind !== "vacancy" || b.kind !== "vacancy") throw new Error("bad kind");
    // Re-import of unchanged content → identical hash (idempotency key).
    expect(a.vacancy.content_hash).toBe(b.vacancy.content_hash);

    const changed = normalizeNavEntry(
      {
        ...NAV_FIXTURE_ACTIVE_DETAIL,
        ad_content: {
          ...NAV_FIXTURE_ACTIVE_DETAIL.ad_content!,
          title: "Tømrer / Carpenter (fixture) — UPDATED",
        },
      },
      { importedAtIso: IMPORTED_AT },
    );
    if (changed.kind !== "vacancy") throw new Error("bad kind");
    expect(changed.vacancy.content_hash).not.toBe(a.vacancy.content_hash);
    // sha256 hex.
    expect(a.vacancy.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("INACTIVE entries (including masked stopped ads) emit deactivation records", () => {
    for (const d of [NAV_FIXTURE_INACTIVE_DETAIL, NAV_FIXTURE_MASKED_DETAIL]) {
      const r = normalizeNavEntry(d, { importedAtIso: IMPORTED_AT });
      expect(r.kind).toBe("deactivation");
      if (r.kind === "deactivation") {
        expect(r.source_vacancy_id).toBe(d.uuid);
        expect(r.observed_at).toBe(IMPORTED_AT);
      }
    }
  });

  it("malformed/underspecified ACTIVE entries are rejected, never partial", () => {
    const noAd = normalizeNavEntry(
      { uuid: "u1", status: "ACTIVE", ad_content: null },
      { importedAtIso: IMPORTED_AT },
    );
    expect(noAd).toEqual({ kind: "rejected", reason: "missing_ad_content" });

    const noTitle = normalizeNavEntry(
      {
        ...NAV_FIXTURE_ACTIVE_DETAIL,
        ad_content: {
          ...NAV_FIXTURE_ACTIVE_DETAIL.ad_content!,
          title: null,
          jobtitle: "  ",
        },
      },
      { importedAtIso: IMPORTED_AT },
    );
    expect(noTitle).toEqual({ kind: "rejected", reason: "missing_title" });

    const noUrl = normalizeNavEntry(
      {
        ...NAV_FIXTURE_ACTIVE_DETAIL,
        ad_content: {
          ...NAV_FIXTURE_ACTIVE_DETAIL.ad_content!,
          link: null,
          sourceurl: null,
        },
      },
      { importedAtIso: IMPORTED_AT },
    );
    expect(noUrl).toEqual({ kind: "rejected", reason: "missing_canonical_url" });
  });
});

describe("privacy minimization — contactList is NEVER carried forward", () => {
  it("the fixture's contact name/email/phone appear nowhere in the normalized output", () => {
    const v = activeVacancy();
    const json = JSON.stringify(v);
    expect(json).not.toContain("fixture.kontakt@fixture-bygg.example");
    expect(json).not.toContain("+47 99 99 99 99");
    expect(json).not.toContain("Fixture Kontakt");
    expect(json).not.toContain("contactList");
    expect(json).not.toContain("contact_list");
    // The record has NO contact-shaped keys at all.
    expect(Object.keys(v).some((k) => /contact/i.test(k))).toBe(false);
  });
});

describe("description sanitization — bounded plain text, never raw HTML", () => {
  it("strips script/style WITH content, strips tags, decodes entities, collapses whitespace", () => {
    const v = activeVacancy();
    expect(v.description_text).toContain("Om stillingen");
    expect(v.description_text).toContain("erfaren tømrer");
    expect(v.description_text).toContain("Arbeidsspråk: norsk & engelsk.");
    expect(v.description_text).not.toContain("<");
    expect(v.description_text).not.toContain("alert(");
    expect(v.description_text).not.toContain("color:red");
  });

  it("caps at the documented bound and null-safes empty input", () => {
    const long = `<p>${"x".repeat(20_000)}</p>`;
    const out = sanitizeDescription(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(NAV_IMPORT_BOUNDS.maxDescriptionChars);
    expect(sanitizeDescription(null)).toBeNull();
    expect(sanitizeDescription("")).toBeNull();
    expect(sanitizeDescription("<p>   </p>")).toBeNull();
  });
});

describe("planVacancyUpsert — idempotent upsert plan", () => {
  it("a known content_hash is skipped (same hash → skip, never rewrite)", () => {
    const v = activeVacancy();
    const plan = planVacancyUpsert(new Set([v.content_hash]), [v]);
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.skippedDuplicate).toHaveLength(1);
  });

  it("intra-run duplicates are caught; distinct content inserts", () => {
    const v = activeVacancy();
    const changed = normalizeNavEntry(
      {
        ...NAV_FIXTURE_ACTIVE_DETAIL,
        ad_content: {
          ...NAV_FIXTURE_ACTIVE_DETAIL.ad_content!,
          expires: "2026-09-01T22:00:00Z",
        },
      },
      { importedAtIso: IMPORTED_AT },
    );
    if (changed.kind !== "vacancy") throw new Error("bad kind");
    const plan = planVacancyUpsert(new Set(), [v, v, changed.vacancy]);
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.skippedDuplicate).toHaveLength(1);
  });

  it("computeVacancyContentHash ignores volatile fields by construction", () => {
    const v = activeVacancy();
    // Recomputing from the persisted subset reproduces the stored hash.
    expect(computeVacancyContentHash(v)).toBe(v.content_hash);
  });
});
