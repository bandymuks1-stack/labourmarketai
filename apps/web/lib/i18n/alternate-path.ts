/**
 * Where "this page in another language" lives, read from the page's own hreflang
 * alternates (absolute URLs, `/<locale>/...`). Pages whose path differs per
 * language — an answer has a translated slug — declare it there; without this the
 * switcher kept the current slug and landed on a 404. Returns the path WITHOUT
 * the locale prefix (what the locale-aware Link expects), or null when the page
 * declares no alternate for that locale, in which case the current path is kept.
 */
export function alternatePathFor(
  locale: string,
  alternates: ReadonlyArray<{ hreflang: string | null; href: string }>,
): string | null {
  const hit = alternates.find((a) => a.hreflang === locale);
  if (!hit) return null;
  let path: string;
  try {
    path = new URL(hit.href, "https://labourmarket.ai").pathname;
  } catch {
    return null;
  }
  const prefix = `/${locale}`;
  if (path === prefix) return "/";
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : null;
}
