/**
 * THE WORKER-INTAKE CARRY — what a visitor typed on the public worker intake
 * (`/worker-intake`) survives sign-up and sign-in (owner decision, 2026-11-15:
 * "after registration ALL data the visitor typed must survive").
 *
 * WHY NOT `?next=` ALONE. The landing sentence rides `?next=/dashboard?say=…`
 * because it is capped at 200 characters. The intake carries a name, a trade
 * and up to a few thousand characters of the person's own words (several
 * locales are Cyrillic: six percent-encoded bytes a letter), while a return
 * path is capped at 1024 characters (`lib/auth/redirect.ts`). So the bridge
 * still uses the ONE return-path mechanism for WHERE the person goes
 * (`WORKER_INTAKE_RETURN_PATH`), and the typed values ride in this browser's
 * storage — no table, no migration, no server copy. Local, not session,
 * storage: production confirms the e-mail address, and the link opens in a
 * NEW tab, where session storage is empty.
 *
 * WHERE IT LANDS — existing canonical homes only, never a new one:
 *   - the name      → the onboarding name field (`complete_onboarding`
 *                     `p_display_name` → `profiles.full_name`);
 *   - the trade     → the onboarding profession (`worker_professions`): a
 *                     registry slug when the intake type is one, else the
 *                     label the person picked, as their own words;
 *   - everything else, verbatim with the form's own field labels → the
 *                     person's owner-only self-description
 *                     (`profiles.profile_text`, the text-first composer's
 *                     column). Nothing is interpreted, mapped or verified.
 *
 * Nothing is saved on the person's behalf before they submit: onboarding shows
 * the values in its own fields and saves them on Finish; a signed-in person
 * who is already onboarded gets the text in their profile composer to save.
 *
 * PURE (no React, no IO) except the three guarded storage helpers at the end.
 */

/** Storage slot. Versioned so a later shape never misreads an older one. */
export const WORKER_INTAKE_CARRY_KEY = "lm.workerIntake.carry.v1";

/**
 * Where the intake's auth doors return: the worker profile, its editor open
 * (`#profile-edit`, opened by `DetailsHashOpener`), where the saved text is in
 * the composer. Locale-less, like every `?next=` value.
 */
export const WORKER_INTAKE_RETURN_PATH = "/dashboard/profile#profile-edit";

/** The same cap as `profiles.profile_text` (`lib/worker/profile-text-actions.ts`). */
export const WORKER_INTAKE_ABOUT_MAX_CHARS = 4000;
/** The intake's own `full_name` maxLength. */
export const WORKER_INTAKE_NAME_MAX_CHARS = 160;
/** The intake comment's maxLength — sized so the comment plus every other
 *  field, labelled, always fits the profile text above (nothing is cut). */
export const WORKER_INTAKE_COMMENT_MAX_CHARS = 2000;
/** What onboarding shows back ("You wrote: …") — the landing sentence cap. */
const SAID_MAX_CHARS = 200;

/**
 * A privacy bound, not an authority term: this is a visitor's own typed text
 * on what may be a shared device. Long enough to confirm an e-mail address on
 * another day; afterwards the browser forgets it.
 */
export const WORKER_INTAKE_CARRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type WorkerIntakeCarry = {
  readonly v: 1;
  /** Epoch ms when it was written. */
  readonly at: number;
  readonly fullName: string;
  /** The intake work-type slug the person picked ("" when none). */
  readonly professionSlug: string;
  /** That work type's label as the person saw it ("" when none). */
  readonly professionLabel: string;
  /** The person's comment alone — shown back in onboarding. */
  readonly comment: string;
  /** Comment + every other filled field, labelled — the profile text. */
  readonly about: string;
};

/** One filled field of the intake, in form order, as the person saw it. */
export type WorkerIntakeLine = { readonly label: string; readonly value: string };

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, max);
}

/**
 * Build the carry from what the form holds. `lines` are the OTHER filled
 * fields (countries, date, choices that differ from the form's default,
 * languages, business details) with the form's own labels.
 */
export function buildWorkerIntakeCarry(input: {
  readonly fullName: string;
  readonly professionSlug: string;
  readonly professionLabel: string;
  readonly comment: string;
  readonly lines: readonly WorkerIntakeLine[];
  readonly now: number;
}): WorkerIntakeCarry {
  const comment = clean(input.comment, WORKER_INTAKE_COMMENT_MAX_CHARS);
  const professionLabel = clean(input.professionLabel, 200);
  const detail = input.lines
    .map((l) => ({ label: clean(l.label, 120), value: clean(l.value, 400) }))
    .filter((l) => l.value.length > 0)
    .map((l) => (l.label ? `${l.label}: ${l.value}` : l.value));
  const about = [comment, detail.join("\n")]
    .filter((part) => part.length > 0)
    .join("\n\n")
    .slice(0, WORKER_INTAKE_ABOUT_MAX_CHARS);
  return {
    v: 1,
    at: input.now,
    fullName: clean(input.fullName, WORKER_INTAKE_NAME_MAX_CHARS),
    professionSlug: /^[a-z0-9_]{1,60}$/.test(input.professionSlug) ? input.professionSlug : "",
    professionLabel,
    comment,
    about,
  };
}

/** True when the carry holds anything the person typed. */
export function hasWorkerIntakeContent(c: WorkerIntakeCarry): boolean {
  return c.fullName.length > 0 || c.professionSlug.length > 0 || c.about.length > 0;
}

/** Read a stored value back; null when absent, malformed, foreign or expired. */
export function parseWorkerIntakeCarry(
  raw: string | null | undefined,
  now: number,
): WorkerIntakeCarry | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 20_000) return null;
  let d: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    d = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (d.v !== 1 || typeof d.at !== "number" || !Number.isFinite(d.at)) return null;
  if (now - d.at > WORKER_INTAKE_CARRY_TTL_MS || d.at - now > 60_000) return null;
  const carry: WorkerIntakeCarry = {
    v: 1,
    at: d.at,
    fullName: clean(d.fullName, WORKER_INTAKE_NAME_MAX_CHARS),
    professionSlug:
      typeof d.professionSlug === "string" && /^[a-z0-9_]{1,60}$/.test(d.professionSlug)
        ? d.professionSlug
        : "",
    professionLabel: clean(d.professionLabel, 200),
    comment: clean(d.comment, WORKER_INTAKE_COMMENT_MAX_CHARS),
    about: clean(d.about, WORKER_INTAKE_ABOUT_MAX_CHARS),
  };
  return hasWorkerIntakeContent(carry) ? carry : null;
}

/** The comment as onboarding shows it back, capped like the landing sentence. */
export function workerIntakeSaid(c: WorkerIntakeCarry): string {
  const said = c.comment.replace(/\s+/g, " ").trim();
  return said.length > SAID_MAX_CHARS ? `${said.slice(0, SAID_MAX_CHARS - 1)}…` : said;
}

/** The locale-prefixed href of an intake auth door, through `?next=`. */
export function workerIntakeDoorHref(locale: string, door: "signup" | "login"): string {
  return `/${locale}/auth/${door}?next=${encodeURIComponent(WORKER_INTAKE_RETURN_PATH)}`;
}

// ── Storage (browser only; every access guarded — private mode, blocked site
//    data: the pages work without it, the carry simply does not happen). ──

export function writeWorkerIntakeCarry(c: WorkerIntakeCarry): void {
  try {
    if (hasWorkerIntakeContent(c)) {
      window.localStorage.setItem(WORKER_INTAKE_CARRY_KEY, JSON.stringify(c));
    } else {
      window.localStorage.removeItem(WORKER_INTAKE_CARRY_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

export function readWorkerIntakeCarry(): WorkerIntakeCarry | null {
  try {
    const carry = parseWorkerIntakeCarry(
      window.localStorage.getItem(WORKER_INTAKE_CARRY_KEY),
      Date.now(),
    );
    if (!carry) window.localStorage.removeItem(WORKER_INTAKE_CARRY_KEY);
    return carry;
  } catch {
    return null;
  }
}

/** Forget it once it is saved where it belongs. */
export function clearWorkerIntakeCarry(): void {
  try {
    window.localStorage.removeItem(WORKER_INTAKE_CARRY_KEY);
  } catch {
    /* nothing to clear */
  }
}
