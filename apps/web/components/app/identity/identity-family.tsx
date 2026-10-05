import type { ReactNode } from "react";
import { Wrench } from "lucide-react";

import { PLAYER_IDENTITY_AVATAR_BORDER, PLAYER_IDENTITY_FALLBACK_SURFACE } from "@/lib/identity/player-identity";
import { personMonogram } from "@/lib/visual/avatar-monogram";
import { cn } from "@/lib/utils";
import type { CompanyIdentity, PersonIdentity, ProjectIdentity } from "@/lib/identity/identity-view";

/**
 * THE IDENTITY FAMILY — one visual family for everything that can be a party in
 * LabourMarket.ai.
 *
 * Every kind has its OWN SILHOUETTE, so you know what you are looking at before
 * you read it, and every kind has a deliberate treatment with and without media:
 *
 *   PERSON      soft squircle. A real photograph when there is one; otherwise a
 *               tonal plate with an engraved figure (never initials in a coloured
 *               circle). Initials appear only from 40 px up, quietly.
 *   ANONYMISED  the same squircle, but veiled: a hatched figure and no name. It
 *               says "a real person whose identity is hidden", not "no data".
 *   COMPANY     squarer tile. A logo on an ivory plate; otherwise an architectural
 *               grid with a monogram.
 *   TEAM        a squircle MOSAIC of its members (2 → halves, 3 → one + two,
 *               4+ → a quartered tile whose last cell carries the overflow), or an
 *               overlapped stack inline.
 *   PROJECT     a wide plate. Site photograph when there is one; otherwise a
 *               generated site plan — never a person-shaped placeholder.
 *   SERVICE     a squircle with a clipped corner and a category glyph.
 *
 * The family holds at every scale (20 → 168 px): detail drops out as it shrinks,
 * the silhouette never changes. Colour is tonal, never a rainbow: six low-chroma
 * plates, chosen deterministically from the id, so the same person is the same
 * everywhere.
 */

const TONES: readonly (readonly [string, string])[] = [
  ["#2d2a26", "#3b3731"], // warm graphite
  ["#24282b", "#323b41"], // slate
  ["#282b25", "#373e33"], // olive grey
  ["#2e2724", "#42352f"], // umber
  ["#2a2630", "#3a3442"], // plum grey
  ["#222b2b", "#2f3e3e"], // teal grey
];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const tone = (id: string) => TONES[hash(id) % TONES.length]!;
const plate = (id: string) => {
  const [a, b] = tone(id);
  return `linear-gradient(160deg, ${a}, ${b})`;
};

const HAIR = "inset 0 0 0 1px rgba(245,241,232,0.12)";

/** ONE source of initials for every person surface (`personMonogram`, pinned
 *  by player-card-identity-consistency.test.ts) — never a second rule here. */
export const initialsOf = personMonogram;

// ───────────────────────── person ─────────────────────────

type PersonLike = PersonIdentity;

/** The engraved figure: head and shoulders, drawn once, scaled to any size. */
function Figure({ hatched = false, id }: { readonly hatched?: boolean; readonly id: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 h-full w-full">
      {hatched ? (
        <defs>
          <pattern id={`h-${id}`} width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
            <line x1="0" y1="0" x2="0" y2="3.2" stroke="rgba(245,241,232,0.5)" strokeWidth="0.9" />
          </pattern>
        </defs>
      ) : null}
      <circle cx="50" cy="39" r="15.5" fill={hatched ? `url(#h-${id})` : "rgba(245,241,232,0.10)"} stroke="rgba(245,241,232,0.28)" strokeWidth="0.8" />
      <path
        d="M17 104 C17 76 32 64 50 64 C68 64 83 76 83 104 Z"
        fill={hatched ? `url(#h-${id})` : "rgba(245,241,232,0.10)"}
        stroke="rgba(245,241,232,0.28)"
        strokeWidth="0.8"
      />
    </svg>
  );
}

export function PersonAvatar({
  person,
  size = 40,
  bare = false,
  anonymousLabel = "Anonymous",
  surface = "plate",
  className,
}: {
  readonly person: PersonLike;
  readonly size?: number;
  /** no outer shape (used inside mosaics, which clip it) */
  readonly bare?: boolean;
  /** the accessible name of a veiled person, in the viewer's language */
  readonly anonymousLabel?: string;
  /**
   * What a person WITHOUT a photo is drawn on. "plate" is the frozen
   * family's tonal plate with an engraved figure (a fixed dark palette);
   * "canonical" is the product's theme-swappable fallback surface
   * (`PLAYER_IDENTITY_FALLBACK_SURFACE` + border, initials at every size),
   * the one the persistent-portrait contract pins. Real routes that must
   * swap theme choose "canonical"; the choice is explicit, never implicit.
   */
  readonly surface?: "plate" | "canonical";
  readonly className?: string;
}) {
  const radius = bare ? 0 : "28%";
  const base = {
    width: size,
    height: size,
    borderRadius: radius,
    boxShadow: bare ? undefined : HAIR,
  } as const;
  if (person.photo && !person.anonymous) {
    return (
      <span className={cn("relative inline-block shrink-0 overflow-hidden", className)} style={base} data-identity="person-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={person.photo.src}
          alt={person.name}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
          style={{ objectPosition: `${(person.photo.face?.x ?? 0.5) * 100}% ${(person.photo.face?.y ?? 0.35) * 100}%` }}
        />
        <span aria-hidden className="absolute inset-0" style={{ boxShadow: "inset 0 -14px 18px -14px rgba(0,0,0,0.5)" }} />
      </span>
    );
  }
  if (person.anonymous) {
    return (
      <span
        className={cn("relative inline-block shrink-0 overflow-hidden", className)}
        style={{ ...base, background: "linear-gradient(160deg,#1c1d1f,#27292c)" }}
        role="img"
        aria-label={anonymousLabel}
        data-identity="person-anonymous"
      >
        <Figure hatched id={person.id} />
        {size >= 40 ? (
          <span aria-hidden className="absolute bottom-[9%] left-1/2 h-[3px] w-[26%] -translate-x-1/2 rounded-full bg-[rgba(245,241,232,0.35)]" />
        ) : null}
      </span>
    );
  }
  if (surface === "canonical") {
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden font-display font-bold tracking-tightest",
          PLAYER_IDENTITY_FALLBACK_SURFACE,
          PLAYER_IDENTITY_AVATAR_BORDER,
          className,
        )}
        style={{ ...base, fontSize: Math.max(10, size * 0.36) }}
        role="img"
        aria-label={person.name}
        data-identity="person-fallback"
        data-surface="canonical"
      >
        <span aria-hidden>{initialsOf(person.name)}</span>
      </span>
    );
  }
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden", className)}
      style={{ ...base, background: plate(person.id) }}
      role="img"
      aria-label={person.name}
      data-identity="person-fallback"
    >
      <Figure id={person.id} />
      {size >= 40 ? (
        <span
          aria-hidden
          className="absolute inset-x-0 flex items-end justify-center font-display font-semibold leading-none tracking-[-0.02em] text-[rgba(245,241,232,0.88)]"
          style={{ top: "56%", bottom: "6%", fontSize: Math.max(11, size * 0.27) }}
        >
          {initialsOf(person.name)}
        </span>
      ) : null}
    </span>
  );
}

// ───────────────────────── company ─────────────────────────

export function CompanyMark({ company, size = 40, className }: { readonly company: CompanyIdentity; readonly size?: number; readonly className?: string }) {
  const style = { width: size, height: size, borderRadius: "14%", boxShadow: HAIR } as const;
  if (company.logoUrl) {
    return (
      <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden", className)} style={{ ...style, background: "#ece7dc" }} role="img" aria-label={company.name} data-identity="company-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={company.logoUrl} alt="" loading="lazy" draggable={false} className="h-[62%] w-[62%] object-contain" />
      </span>
    );
  }
  if (company.logo) {
    return (
      <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ ...style, background: "#ece7dc" }} role="img" aria-label={company.name} data-identity="company-logo">
        <svg viewBox={company.logo.viewBox ?? "0 0 64 64"} className="h-[62%] w-[62%]" aria-hidden>
          <path d={company.logo.path} fill="#151513" />
        </svg>
      </span>
    );
  }
  const words = company.name.split(/\s+/).filter((w) => !/^(AS|UAB|OÜ|GmbH|Sp\.|AB)$/i.test(w));
  const mono = words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden", className)} style={{ ...style, background: plate(company.id) }} role="img" aria-label={company.name} data-identity="company-fallback">
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 h-full w-full opacity-60">
        {[25, 50, 75].map((v) => (
          <g key={v} stroke="rgba(245,241,232,0.13)" strokeWidth="0.7">
            <line x1={v} y1="0" x2={v} y2="100" />
            <line x1="0" y1={v} x2="100" y2={v} />
          </g>
        ))}
      </svg>
      <span className="relative font-display font-bold leading-none tracking-[-0.03em] text-[rgba(245,241,232,0.92)]" style={{ fontSize: Math.max(10, size * 0.36) }}>
        {size >= 28 ? mono : mono[0]}
      </span>
    </span>
  );
}

// ───────────────────────── team ─────────────────────────

export function TeamMark({ members, size = 48, className }: { readonly members: readonly PersonLike[]; readonly size?: number; readonly className?: string }) {
  const n = members.length;
  const cell = (m: PersonLike, s: number, key?: string) => <PersonAvatar key={key ?? m.id} person={m} size={s} bare />;
  const half = size / 2;
  const gap = 1.5;
  const q = (size - gap) / 2;
  let inner: ReactNode;
  if (n <= 1) inner = cell(members[0]!, size);
  else if (n === 2)
    inner = (
      <div className="flex h-full w-full" style={{ gap }}>
        <div className="overflow-hidden" style={{ width: (size - gap) / 2, height: size }}>
          <PersonAvatar person={members[0]!} size={size} bare />
        </div>
        <div className="overflow-hidden" style={{ width: (size - gap) / 2, height: size }}>
          <div style={{ marginLeft: -(size - gap) / 2 }}>
            <PersonAvatar person={members[1]!} size={size} bare />
          </div>
        </div>
      </div>
    );
  else if (n === 3)
    inner = (
      <div className="flex h-full w-full" style={{ gap }}>
        <div className="overflow-hidden" style={{ width: q, height: size }}>
          <PersonAvatar person={members[0]!} size={size} bare />
        </div>
        <div className="flex flex-col" style={{ gap }}>
          {[members[1]!, members[2]!].map((m) => (
            <div key={m.id} className="overflow-hidden" style={{ width: q, height: q }}>
              {cell(m, q)}
            </div>
          ))}
        </div>
      </div>
    );
  else {
    const over = n - 3;
    inner = (
      <div className="grid h-full w-full" style={{ gridTemplateColumns: `${q}px ${q}px`, gap }}>
        {members.slice(0, 3).map((m) => (
          <div key={m.id} className="overflow-hidden" style={{ width: q, height: q }}>
            {cell(m, q)}
          </div>
        ))}
        {n === 4 ? (
          <div className="overflow-hidden" style={{ width: q, height: q }}>
            {cell(members[3]!, q)}
          </div>
        ) : (
          <div className="flex items-center justify-center bg-[#1b1a18] font-display font-semibold tracking-[-0.02em] text-[rgba(245,241,232,0.9)]" style={{ width: q, height: q, fontSize: Math.max(9, q * 0.42) }}>
            +{over}
          </div>
        )}
      </div>
    );
  }
  void half;
  return (
    <span className={cn("relative inline-block shrink-0 overflow-hidden", className)} style={{ width: size, height: size, borderRadius: "28%", boxShadow: HAIR, background: "#161513" }} role="img" aria-label={`Team of ${n}`} data-identity="team">
      {inner}
    </span>
  );
}

export function TeamStack({ members, size = 28, max = 4, className }: { readonly members: readonly PersonLike[]; readonly size?: number; readonly max?: number; readonly className?: string }) {
  const shown = members.slice(0, max);
  const over = members.length - shown.length;
  const overlap = Math.round(size * 0.3);
  return (
    <span className={cn("inline-flex items-center", className)} data-identity="team-stack">
      {shown.map((m, i) => (
        <span key={m.id} className="relative rounded-[28%] ring-2 ring-ink-900" style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: shown.length - i }}>
          <PersonAvatar person={m} size={size} />
        </span>
      ))}
      {over > 0 ? (
        <span className="relative flex items-center justify-center rounded-[28%] bg-[#1d1c1a] font-display font-semibold text-[rgba(245,241,232,0.88)] ring-2 ring-ink-900" style={{ marginLeft: -overlap, width: size, height: size, fontSize: Math.max(9, size * 0.36), boxShadow: HAIR }}>
          +{over}
        </span>
      ) : null}
    </span>
  );
}

// ───────────────────────── project ─────────────────────────

export function ProjectMark({ project, size = 48, wide = true, className }: { readonly project: ProjectIdentity; readonly size?: number; readonly wide?: boolean; readonly className?: string }) {
  const w = wide ? Math.round(size * 1.45) : size;
  const style = { width: w, height: size, borderRadius: "10%", boxShadow: HAIR } as const;
  if (project.media) {
    return (
      <span className={cn("relative inline-block shrink-0 overflow-hidden", className)} style={style} role="img" aria-label={project.name} data-identity="project-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={project.media.src} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover saturate-[0.85]" style={{ objectPosition: project.media.pos ?? "50% 50%" }} />
        <span aria-hidden className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,7,6,0.5),transparent_55%)]" />
      </span>
    );
  }
  const h = hash(project.id);
  const lines = [0, 1, 2, 3].map((i) => ({ x: 14 + ((h >> (i * 4)) % 70), y: 12 + ((h >> (i * 3 + 2)) % 70) }));
  return (
    <span className={cn("relative inline-block shrink-0 overflow-hidden", className)} style={{ ...style, background: plate(project.id) }} role="img" aria-label={project.name} data-identity="project-plan">
      <svg viewBox="0 0 145 100" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 h-full w-full">
        <g fill="none" stroke="rgba(245,241,232,0.16)" strokeWidth="0.8">
          <rect x="14" y="14" width="117" height="72" rx="3" />
          <rect x="30" y="28" width="62" height="44" rx="2" />
          <path d={`M${lines[0]!.x} 14 V86 M14 ${lines[1]!.y} H131`} />
          <path d={`M${lines[2]!.x} ${lines[2]!.y} h38 v26 h-38 z`} stroke="rgba(245,241,232,0.3)" />
        </g>
        <circle cx={lines[3]!.x + 40} cy={lines[3]!.y} r="3.2" fill="rgba(245,241,232,0.7)" />
      </svg>
    </span>
  );
}

// ───────────────────────── service ─────────────────────────

export function ServiceMark({ id, size = 40, icon, label = "Service", className }: { readonly id: string; readonly size?: number; readonly icon?: ReactNode; /** accessible name in the viewer's language; "" = decorative (the row names it) */ readonly label?: string; readonly className?: string }) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center text-[rgba(245,241,232,0.85)]", className)}
      style={{ width: size, height: size, background: plate(id), borderRadius: "28%", clipPath: "polygon(0 0, 74% 0, 100% 26%, 100% 100%, 0 100%)", boxShadow: HAIR }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      data-identity="service"
    >
      <span style={{ width: size * 0.46, height: size * 0.46 }} className="flex items-center justify-center">
        {icon ?? <Wrench strokeWidth={1.5} style={{ width: "100%", height: "100%" }} aria-hidden />}
      </span>
    </span>
  );
}
