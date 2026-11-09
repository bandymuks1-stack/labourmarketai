/**
 * Canonical path of the public job board (SEO audit 2026-11-03).
 *
 * Page 2+ of the unfiltered board is its own canonical: pointing every page at
 * page 1 tells a crawler the deeper pages are copies, though each lists
 * different ads. A search, a profession filter or the personal "saved" view
 * still canonicalize to the board itself, so filter combinations never become
 * indexable duplicates.
 */
/**
 * The deepest page that names itself. Every ad already has its own URL in
 * /jobs-sitemap.xml, so deep listing pages add no discovery; past this point
 * they fold back to the board, which keeps crawlers off deep OFFSET scans
 * (page 2,500 took 2 s on 2026-11-03).
 */
export const JOBS_SELF_CANONICAL_MAX_PAGE = 100;

export function jobsCanonicalPath(sp: {
  q?: string;
  page?: string;
  saved?: string;
  profession?: string;
}): string {
  const raw = sp.page ?? "1";
  const page = /^\d+$/.test(raw) ? Number(raw) : 1;
  const filtered = Boolean(sp.q || sp.profession || sp.saved);
  return !filtered && page > 1 && page <= JOBS_SELF_CANONICAL_MAX_PAGE
    ? `/jobs?page=${page}`
    : "/jobs";
}
