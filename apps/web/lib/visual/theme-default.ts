/**
 * WHICH THEME A PAGE OPENS IN when the person never chose one (owner decision
 * 2026-10-28): the PUBLIC site — landing, jobs, pricing, legal, sign-in and
 * sign-up, invitations — opens LIGHT; the signed-in workspace keeps its dark
 * default until the owner decides otherwise. A saved choice ("light"/"dark" in
 * the shared `theme` key) always wins, on every page.
 *
 * ONE rule, two readers: the pre-paint bootstrap (an inline script, so it is
 * built here as a string from the same pattern) and `<ThemeReapply/>`.
 */

/** The signed-in workspace: `/{locale}/dashboard…`, `/{locale}/onboarding…`,
 *  `/{locale}/cv…`. Everything else is the public site. */
export const WORKSPACE_PATH_SOURCE = "^/[a-z]{2}/(dashboard|onboarding|cv)(/|$)";

export type ThemeName = "light" | "dark";

export function defaultThemeForPath(pathname: string): ThemeName {
  return new RegExp(WORKSPACE_PATH_SOURCE).test(pathname) ? "dark" : "light";
}

/** The saved choice when there is one, otherwise the page's default. */
export function resolveTheme(saved: string | null, pathname: string): ThemeName {
  if (saved === "light" || saved === "dark") return saved;
  return defaultThemeForPath(pathname);
}

/** The pre-paint bootstrap: resolves before the first paint so the light/dark
 *  token swap never flickers; a storage failure still lands on the page's
 *  default. */
export const THEME_BOOTSTRAP_SCRIPT =
  "(function(){var d=new RegExp(" +
  JSON.stringify(WORKSPACE_PATH_SOURCE) +
  ").test(location.pathname)?'dark':'light';" +
  "try{var s=localStorage.getItem('theme');var t=(s==='light'||s==='dark')?s:d;document.documentElement.dataset.theme=t;}" +
  "catch(e){document.documentElement.dataset.theme=d;}})();";
