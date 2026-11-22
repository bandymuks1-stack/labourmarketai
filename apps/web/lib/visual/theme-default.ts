/**
 * WHICH THEME A PAGE OPENS IN when the person never chose one.
 *
 * Owner decision 2026-11-15: a new account starts LIGHT — the signed-in
 * workspace opens light too, as the public site (landing, jobs, pricing,
 * legal, sign-in and sign-up, invitations) has since the owner decision of
 * 2026-10-28. Dark stays one tap away (the avatar menu and the theme
 * toggles), and a saved choice ("light"/"dark" in the shared `theme` key)
 * always wins, on every page: a person who chose dark keeps dark.
 *
 * The per-area rule stays (the workspace pattern below), so a later owner
 * decision can give one area its own default without a second mechanism.
 *
 * ONE rule, two readers: the pre-paint bootstrap (an inline script, so it is
 * built here as a string from the same pattern) and `<ThemeReapply/>`.
 */

/** The signed-in workspace: `/{locale}/dashboard…`, `/{locale}/onboarding…`,
 *  `/{locale}/cv…`. Everything else is the public site. */
export const WORKSPACE_PATH_SOURCE = "^/[a-z]{2}/(dashboard|onboarding|cv)(/|$)";

export type ThemeName = "light" | "dark";

/** The signed-in workspace's default (owner decision 2026-11-15: light). */
export const WORKSPACE_DEFAULT_THEME: ThemeName = "light";
/** The public site's default (owner decision 2026-10-28: light). */
export const PUBLIC_DEFAULT_THEME: ThemeName = "light";

export function defaultThemeForPath(pathname: string): ThemeName {
  return new RegExp(WORKSPACE_PATH_SOURCE).test(pathname) ? WORKSPACE_DEFAULT_THEME : PUBLIC_DEFAULT_THEME;
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
  ").test(location.pathname)?" +
  JSON.stringify(WORKSPACE_DEFAULT_THEME) +
  ":" +
  JSON.stringify(PUBLIC_DEFAULT_THEME) +
  ";" +
  "try{var s=localStorage.getItem('theme');var t=(s==='light'||s==='dark')?s:d;document.documentElement.dataset.theme=t;}" +
  "catch(e){document.documentElement.dataset.theme=d;}})();";
