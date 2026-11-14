/**
 * Canonical path of the public job board (SEO audit 2026-11-03).
 *
 * Page 2+ of the unfiltered board is its own canonical: pointing every page at
 * page 1 tells a crawler the deeper pages are copies, though each lists
 * different ads. A free-text search or the personal "saved" view still
 * canonicalizes to the board itself, so filter combinations never become
 * indexable duplicates.
 *
 * A PROFESSION is the one filter with its own canonical (owner P0, 2026-11-12):
 * `/jobs?profession=<slug>` lists that profession's ads under its own title,
 * so it names itself, and so do its pages 2+. Whether it may be indexed is a
 * separate question, answered from the live count in
 * `lib/seo/jobs-profession-page.ts`. The slug must already be a catalogue slug
 * (`readProfessionSlugParam`); the page passes nothing else.
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
  /** A catalogue slug, already validated by the caller. */
  profession?: string | null;
}): string {
  const raw = sp.page ?? "1";
  const page = /^\d+$/.test(raw) ? Number(raw) : 1;
  if (sp.q || sp.saved) return "/jobs";
  const paged = page > 1 && page <= JOBS_SELF_CANONICAL_MAX_PAGE;
  if (sp.profession) {
    // Past the cap a profession folds back to ITS first page, not to the board.
    const base = `/jobs?profession=${encodeURIComponent(sp.profession)}`;
    return paged ? `${base}&page=${page}` : base;
  }
  return paged ? `/jobs?page=${page}` : "/jobs";
}
