/**
 * An organization's website, as a link on a PUBLIC page. `companies.website` is
 * free text: `save_company_setup_v3` only marks a malformed value as needing
 * checks and stores it verbatim. So the value is checked where it becomes an
 * `href`, and refused at the door when it names another scheme.
 *
 * Only http(s) on a real host is a link. React blocks `javascript:` but passes
 * `data:` and every other scheme, and a bare `example.com` would be a RELATIVE
 * link into this site, so it gains `https://`.
 */

const HOST_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
const HTTP_SCHEME_RE = /^https?:\/\//i;
// A scheme, unless what follows the colon is a port (`example.com:8080`).
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:(?!\d+(\/|$))/i;

/** The safe absolute URL for a stored website, or null when it must not be a link. */
export function publicWebsiteHref(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  // Browsers strip tabs and newlines inside a URL, so they could hide a scheme.
  if (!value || /[\s\\]/.test(value)) return null;
  if (!HTTP_SCHEME_RE.test(value) && SCHEME_RE.test(value)) return null;
  if (value.startsWith("/")) return null;
  let url: URL;
  try {
    url = new URL(HTTP_SCHEME_RE.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.username || url.password || !HOST_RE.test(url.hostname)) return null;
  return url.href;
}

/** True when a submitted website names a scheme other than http(s). */
export function websiteHasForbiddenScheme(raw: string | null | undefined): boolean {
  const value = (raw ?? "").replace(/\s/g, "");
  return !HTTP_SCHEME_RE.test(value) && SCHEME_RE.test(value);
}
