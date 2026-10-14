import { personMonogram } from "@/lib/visual/avatar-monogram";
import { cn } from "@/lib/utils";
import type { CompanyIdentity, PersonIdentity, ProjectIdentity } from "@/lib/identity/identity-view";

/**
 * THE IDENTITY FAMILY — one visual family for every party in LabourMarket.ai.
 *
 * Re-port (D2, 2026-10-14) of the owner-frozen design class 4e695e261
 * (branch `feat/cc/visual-language-proof`: ea0e77f13, 30ccdfe94, e5413f896),
 * adapted to the owner restraint directives of 2026-10-09/10:
 *
 *   PERSON   soft squircle. The person's real photograph when the reader
 *            returned one; otherwise a calm tonal PLATE with the person's
 *            initials — never a stand-in face. From card size up the plate
 *            carries the frozen engraved figure, faintly, behind the initials.
 *   VEILED   the same squircle, hatched, no name and never a photo: "a real
 *            person whose identity is hidden", not "no data".
 *   COMPANY  squarer tile. A logo on an ivory ground; otherwise the plate with
 *            a quiet grid and the company's monogram.
 *   PROJECT  a wide plate. A real site photograph when there is one;
 *            otherwise the plate and the project's monogram. (The frozen
 *            class drew a GENERATED site plan here; it is dropped — a
 *            generated picture must never read as the project's evidence.)
 *   TEAM     an overlapped stack of the people above.
 *
 * SIZES. One family at every scale (`IDENTITY_SIZE`): `chip` (inline, 28),
 * `row` (a list row, 40), `card` (a person card, 64). The STAGE (the Player
 * Card) is the 4:5 `PersonPortrait`, which draws its no-photo person through
 * this same plate and monogram — two silhouettes, one person.
 *
 * RESTRAINT. Tones are six low-chroma theme tokens (`--c-identity-*`),
 * chosen from the id so the same party is the same everywhere. A tone is
 * never a state: no gold, no green, no accent colour on any mark. Trust or
 * presence is the CALLER's frame, said in words beside the mark.
 */

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Six tonal plates, theme tokens (`--c-identity-Na/Nb`), chosen from the id. */
const TONE_COUNT = 6;
const tone = (id: string) => (hash(id) % TONE_COUNT) + 1;
export const plate = (id: string) => {
  const n = tone(id);
  return `linear-gradient(160deg, rgb(var(--c-identity-${n}a)), rgb(var(--c-identity-${n}b)))`;
};

/** The ink monograms, hairlines and figures are drawn in, at an alpha. Light
 *  on the dark plates and deep on the light plates — never a fixed palette. */
const FIG = (alpha: number) => `rgb(var(--c-identity-figure) / ${alpha})`;
const HAIR = `inset 0 0 0 1px ${FIG(0.14)}`;

/** ONE source of initials for every person surface (`personMonogram`, pinned
 *  by player-card-identity-consistency.test.ts) — never a second rule here. */
export const initialsOf = personMonogram;

/** Which plate a PERSON gets. Keyed by the display name (the id only when
 *  there is no name), because not every reader carries an id — the Player
 *  Card's does not — and the same person must read the same on every
 *  surface: the card, the roster row and the account menu. */
export function personToneKey(name: string, id?: string | null): string {
  const n = name.trim().toLocaleLowerCase();
  return n.length > 0 ? n : (id ?? "");
}

/** The family's size scale, in px. The stage is `PersonPortrait`. */
export const IDENTITY_SIZE = { chip: 28, row: 40, card: 64 } as const;
export type IdentitySize = keyof typeof IDENTITY_SIZE | number;
const px = (size: IdentitySize) => (typeof size === "number" ? size : IDENTITY_SIZE[size]);

/** From card size up there is room for the engraved figure behind the
 *  initials; below it the plate carries the initials alone (calm, legible). */
export const FIGURE_MIN_PX = IDENTITY_SIZE.card;

/** First letters of an organization/project name (legal forms and quote
 *  marks skipped: UAB „Statybų grupė" → "SG"). Neutral "•" when nothing is left. */
export function entityMonogram(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter((w) => w.length > 0 && !/^(AS|UAB|MB|IĮ|VšĮ|OÜ|SIA|GmbH|Sp\.?|z\.?o\.?o\.?|AB|Ltd\.?|Oy|ApS)$/i.test(w));
  const mono = words
    .slice(0, 2)
    .map((w) => w.charAt(0).toLocaleUpperCase())
    .join("");
  return mono || "•";
}

// ───────────────────────── person ─────────────────────────

/** The engraved figure: head and shoulders, drawn once, scaled to any size.
 *  A glyph of "a person", never a likeness. */
export function PersonFigure({ hatched = false, id }: { readonly hatched?: boolean; readonly id: string }) {
  const patternId = `identity-hatch-${hash(id).toString(36)}`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 h-full w-full">
      {hatched ? (
        <defs>
          <pattern id={patternId} width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
            <line x1="0" y1="0" x2="0" y2="3.2" stroke={FIG(0.5)} strokeWidth="0.9" />
          </pattern>
        </defs>
      ) : null}
      <circle cx="50" cy="39" r="15.5" fill={hatched ? `url(#${patternId})` : FIG(0.08)} stroke={FIG(0.22)} strokeWidth="0.8" />
      <path
        d="M17 104 C17 76 32 64 50 64 C68 64 83 76 83 104 Z"
        fill={hatched ? `url(#${patternId})` : FIG(0.08)}
        stroke={FIG(0.22)}
        strokeWidth="0.8"
      />
    </svg>
  );
}

/**
 * A person at chip / row / card size. `person.photo` is an already-authorised
 * URL (own avatar, or `getAvatarForVisibleWorker`); without one the plate and
 * initials. `anonymous` always wins over a photo.
 */
export function PersonAvatar({
  person,
  size = "row",
  anonymousLabel = "",
  decorative = false,
  testId,
  className,
}: {
  readonly person: PersonIdentity;
  readonly size?: IdentitySize;
  /** The accessible name of a veiled person, in the viewer's language. */
  readonly anonymousLabel?: string;
  /** The row beside it already names the person: hide the mark from AT. */
  readonly decorative?: boolean;
  readonly testId?: string;
  readonly className?: string;
}) {
  const s = px(size);
  const base = { width: s, height: s, borderRadius: "28%", boxShadow: HAIR } as const;
  const a11y = (label: string) =>
    decorative || label.length === 0 ? ({ "aria-hidden": true } as const) : ({ role: "img", "aria-label": label } as const);

  if (person.photo && !person.anonymous) {
    return (
      <span
        className={cn("relative inline-block shrink-0 overflow-hidden", className)}
        style={base}
        data-identity="person-photo"
        data-testid={testId}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={person.photo.src}
          alt={decorative ? "" : person.name}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
          style={{ objectPosition: `${(person.photo.face?.x ?? 0.5) * 100}% ${(person.photo.face?.y ?? 0.35) * 100}%` }}
        />
      </span>
    );
  }
  if (person.anonymous) {
    return (
      <span
        className={cn("relative inline-block shrink-0 overflow-hidden bg-ink-700", className)}
        style={base}
        {...a11y(anonymousLabel)}
        data-identity="person-anonymous"
        data-testid={testId}
      >
        <PersonFigure hatched id={person.id} />
      </span>
    );
  }
  const withFigure = s >= FIGURE_MIN_PX;
  const key = personToneKey(person.name, person.id);
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden", className)}
      style={{ ...base, background: plate(key) }}
      {...a11y(person.name)}
      data-identity="person-fallback"
      data-testid={testId}
    >
      {withFigure ? <PersonFigure id={key} /> : null}
      <span
        aria-hidden
        className={cn(
          "font-display font-semibold leading-none tracking-[-0.02em] text-[rgb(var(--c-identity-figure)/0.88)]",
          withFigure && "absolute inset-x-0 flex items-end justify-center",
        )}
        style={withFigure ? { top: "56%", bottom: "8%", fontSize: s * 0.26 } : { fontSize: Math.max(10, s * 0.38) }}
      >
        {initialsOf(person.name)}
      </span>
    </span>
  );
}

/** A team inline: the people overlapped, the overflow as a count. */
export function TeamStack({
  members,
  size = "chip",
  max = 4,
  className,
}: {
  readonly members: readonly PersonIdentity[];
  readonly size?: IdentitySize;
  readonly max?: number;
  readonly className?: string;
}) {
  const s = px(size);
  const shown = members.slice(0, max);
  const over = members.length - shown.length;
  const overlap = Math.round(s * 0.3);
  return (
    <span className={cn("inline-flex items-center", className)} data-identity="team-stack">
      {shown.map((m, i) => (
        <span key={m.id} className="relative rounded-[28%] ring-2 ring-ink-900" style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: shown.length - i }}>
          <PersonAvatar person={m} size={s} decorative />
        </span>
      ))}
      {over > 0 ? (
        <span
          className="relative flex items-center justify-center rounded-[28%] bg-ink-700 font-display font-semibold tabular-nums text-text-secondary ring-2 ring-ink-900"
          style={{ marginLeft: -overlap, width: s, height: s, fontSize: Math.max(9, s * 0.36), boxShadow: HAIR }}
        >
          +{over}
        </span>
      ) : null}
    </span>
  );
}

// ───────────────────────── company ─────────────────────────

export function CompanyMark({
  company,
  size = "row",
  decorative = false,
  className,
}: {
  readonly company: CompanyIdentity;
  readonly size?: IdentitySize;
  readonly decorative?: boolean;
  readonly className?: string;
}) {
  const s = px(size);
  const style = { width: s, height: s, borderRadius: "14%", boxShadow: HAIR } as const;
  const a11y = decorative ? ({ "aria-hidden": true } as const) : ({ role: "img", "aria-label": company.name } as const);
  if (company.logoUrl) {
    // A logo is drawn for a light ground in every theme (brand semantics,
    // not an identity tone): ivory, the one literal in this family.
    return (
      <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden", className)} style={{ ...style, background: "#ece7dc" }} {...a11y} data-identity="company-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={company.logoUrl} alt="" loading="lazy" draggable={false} className="h-[62%] w-[62%] object-contain" />
      </span>
    );
  }
  const mono = entityMonogram(company.name);
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden", className)} style={{ ...style, background: plate(company.id) }} {...a11y} data-identity="company-fallback">
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 h-full w-full">
        {[25, 50, 75].map((v) => (
          <g key={v} stroke={FIG(0.08)} strokeWidth="0.7">
            <line x1={v} y1="0" x2={v} y2="100" />
            <line x1="0" y1={v} x2="100" y2={v} />
          </g>
        ))}
      </svg>
      <span aria-hidden className="relative font-display font-semibold leading-none tracking-[-0.03em] text-[rgb(var(--c-identity-figure)/0.9)]" style={{ fontSize: Math.max(10, s * 0.36) }}>
        {s >= 28 ? mono : mono.charAt(0)}
      </span>
    </span>
  );
}

// ───────────────────────── project ─────────────────────────

export function ProjectMark({
  project,
  size = "row",
  wide = true,
  decorative = false,
  className,
}: {
  readonly project: ProjectIdentity;
  readonly size?: IdentitySize;
  readonly wide?: boolean;
  readonly decorative?: boolean;
  readonly className?: string;
}) {
  const h = px(size);
  const w = wide ? Math.round(h * 1.45) : h;
  const style = { width: w, height: h, borderRadius: "10%", boxShadow: HAIR } as const;
  const a11y = decorative ? ({ "aria-hidden": true } as const) : ({ role: "img", "aria-label": project.name } as const);
  if (project.media) {
    return (
      <span className={cn("relative inline-block shrink-0 overflow-hidden", className)} style={style} {...a11y} data-identity="project-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={project.media.src} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" style={{ objectPosition: project.media.pos ?? "50% 50%" }} />
      </span>
    );
  }
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden", className)} style={{ ...style, background: plate(project.id) }} {...a11y} data-identity="project-plate">
      <span aria-hidden className="font-display font-semibold leading-none tracking-[-0.03em] text-[rgb(var(--c-identity-figure)/0.9)]" style={{ fontSize: Math.max(10, h * 0.34) }}>
        {entityMonogram(project.name)}
      </span>
    </span>
  );
}
