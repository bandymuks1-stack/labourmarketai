/**
 * BROWSER CRASH REPORTS — the one shape, sanitised (2026-10-18 incident).
 *
 * A real candidate saw "Application error: a client-side exception has
 * occurred" on every retry and nobody knew: a crash in a browser was visible
 * only in that browser's console. This is the smallest monitoring that would
 * have told us — on existing infrastructure, at zero cost, and WITHOUT touching
 * the database (it is over its free quota): the browser sends one small
 * report, the server writes one sanitised log line, the VPS keeps it in the
 * container log.
 *
 * PRIVACY. A report says WHAT broke and WHERE in the product, never WHO or
 * with what data: no user or account id, no IP address (the server never
 * logs one), no cookie, no query string, no hash, no free text a person
 * typed. The message is cut to a short prefix and every e-mail, URL, number
 * and quoted string in it is replaced by a placeholder; path segments that
 * look like ids or tokens become `:id`. The browser is a family and a major
 * version only ("Safari 15") — what found this incident, and nothing finer.
 *
 * Pure functions. The same sanitiser runs in the browser (before sending) and
 * on the server (authoritative — a hand-made request is cleaned the same way).
 */

export const CLIENT_ERROR_KINDS = ["window", "rejection", "boundary", "global"] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export interface ClientErrorReport {
  readonly kind: ClientErrorKind;
  /** The error class: `SyntaxError`, `TypeError`, `ChunkLoadError`, … */
  readonly name: string;
  /** A redacted prefix of the message. */
  readonly message: string;
  /** The page as a route shape: `/en/invite/:id`, never the real token. */
  readonly route: string;
  /** Next.js server-error digest, when the boundary has one. */
  readonly digest: string | null;
  /** Browser family + major version, e.g. `Safari 15`. */
  readonly browser: string | null;
  /** Build id the page was served from (8 hex). */
  readonly build: string | null;
}

export const CLIENT_ERROR_MAX_BYTES = 2048;
const MESSAGE_MAX = 160;
const ROUTE_MAX = 120;

/** Replace anything that could carry a person's data with a placeholder. */
export function redactMessage(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  return text
    .slice(0, 400)
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>")
    .replace(/\b(?:https?|wss?|file|blob|data):[^\s"'`)]*/gi, "<url>")
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "<str>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\d+/g, "#")
    .replace(/[^\S ]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, MESSAGE_MAX);
}

/** A route shape: no query, no hash, ids and tokens folded to `:id`. */
export function routeShape(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  const path = text.split(/[?#]/)[0] ?? "";
  if (!path.startsWith("/")) return "/";
  const segments = path
    .split("/")
    .filter(Boolean)
    .slice(0, 8)
    .map((s) => {
      if (/^[a-z]{2}$/.test(s)) return s;
      if (/\d/.test(s) && s.length >= 6) return ":id";
      if (s.length > 24) return ":id";
      return /^[a-z][a-z0-9-]*$/i.test(s) ? s.toLowerCase() : ":id";
    });
  return ("/" + segments.join("/")).slice(0, ROUTE_MAX);
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * The authoritative clean-up. Anything that does not fit the shape is dropped
 * or replaced; a report without a valid kind is no report.
 */
export function sanitizeClientErrorReport(raw: unknown): ClientErrorReport | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const kind = pick(r.kind, CLIENT_ERROR_KINDS);
  if (!kind) return null;
  const name = typeof r.name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(r.name) ? r.name : "Error";
  const digest = typeof r.digest === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(r.digest) ? r.digest : null;
  const browser =
    typeof r.browser === "string" && /^[A-Za-z][A-Za-z ]{1,24} \d{1,3}$/.test(r.browser) ? r.browser : null;
  const build = typeof r.build === "string" && /^[0-9a-f]{7,12}$/.test(r.build) ? r.build : null;
  return {
    kind,
    name,
    message: redactMessage(r.message),
    route: routeShape(r.route),
    digest,
    browser,
    build,
  };
}

/** Browser family + major version from a user-agent string (client side). */
export function browserFamily(userAgent: string): string | null {
  const ua = userAgent ?? "";
  const rules: Array<[RegExp, string]> = [
    [/EdgA?\/(\d+)/, "Edge"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/OPR\/(\d+)/, "Opera"],
    [/FBAV\/(\d+)/, "Facebook App"],
    [/Instagram (\d+)/, "Instagram App"],
    [/CriOS\/(\d+)/, "Chrome iOS"],
    [/FxiOS\/(\d+)/, "Firefox iOS"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[\d.]* .*Safari/, "Safari"],
    [/OS (\d+)_\d+.* like Mac OS X/, "iOS WebView"],
  ];
  for (const [re, family] of rules) {
    const m = re.exec(ua);
    if (m) return `${family} ${m[1]}`;
  }
  return null;
}
