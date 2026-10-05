import type { ReactNode } from "react";
import { Hammer } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  COMPANIES,
  PEOPLE,
  PROJECTS,
  TEAMS,
  companyById,
  personById,
} from "@/lib/design-proof/product-fixtures";

import { PersonAvatar, TeamMark } from "./identity";

/**
 * ENTITY — one way to FILL a surface with who or what something is.
 *
 * Premium here does not depend on photography. An entity fills its frame the
 * same way whether it has media or not:
 *
 *   photo      the photograph, face-centred, graded into the palette
 *   no photo   a tonal plate lit from one corner, with the engraved figure
 *              scaled to the frame — large enough to be a presence, not an icon
 *   anonymous  the same plate, veiled, no name
 *   company    logo on ivory, or a drafted grid with a large monogram
 *   team       a mosaic of its members
 *   project    site photograph, or a site plan drawn from the project's own id
 *   service    a clipped plate with a category glyph
 *
 * A scrim and the entity's name/eyebrow are set on top by `EntityCard`, so
 * every entity — with or without media — reads as the same kind of object.
 */
export type Entity =
  | { readonly kind: "person"; readonly id: string }
  | { readonly kind: "company"; readonly id: string }
  | { readonly kind: "project"; readonly id: string }
  | { readonly kind: "team"; readonly id: string }
  | { readonly kind: "service"; readonly id: string; readonly name: string; readonly by: string; readonly icon?: ReactNode };

const TONES: readonly (readonly [string, string, string])[] = [
  ["#2d2a26", "#46403a", "rgba(212,175,55,0.20)"],
  ["#24292c", "#38444c", "rgba(120,170,200,0.18)"],
  ["#292c25", "#3e4636", "rgba(160,190,120,0.16)"],
  ["#2f2724", "#4d3a31", "rgba(214,140,90,0.20)"],
  ["#2b2731", "#413a4d", "rgba(170,140,210,0.16)"],
  ["#232d2d", "#32484a", "rgba(110,190,190,0.16)"],
];
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const toneOf = (id: string) => TONES[hash(id) % TONES.length]!;

export type Resolved = { readonly eyebrow: string; readonly title: string; readonly sub?: string };

export function resolve(e: Entity): Resolved {
  switch (e.kind) {
    case "person": {
      const p = personById(e.id);
      return { eyebrow: p.role, title: p.anonymous ? "Anonymous candidate" : p.name, sub: p.location };
    }
    case "company": {
      const c = companyById(e.id);
      return { eyebrow: c.kind, title: c.name, sub: c.place };
    }
    case "project": {
      const p = PROJECTS.find((x) => x.id === e.id)!;
      return { eyebrow: p.status, title: p.name, sub: p.place };
    }
    case "team": {
      const t = Object.values(TEAMS).find((x) => x.id === e.id)!;
      return { eyebrow: `Team · ${t.members.length}`, title: t.name };
    }
    case "service":
      return { eyebrow: "Service", title: e.name, sub: e.by };
  }
}

/** The figure, drawn to fill: used by people plates at any size. */
function BigFigure({ hatched = false, id }: { readonly hatched?: boolean; readonly id: string }) {
  const f = hatched ? `url(#hh-${id})` : "rgba(245,241,232,0.075)";
  return (
    <svg viewBox="0 0 100 125" preserveAspectRatio="xMidYMax slice" aria-hidden className="absolute inset-0 h-full w-full">
      {hatched ? (
        <defs>
          <pattern id={`hh-${id}`} width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
            <line x1="0" y1="0" x2="0" y2="2.6" stroke="rgba(245,241,232,0.42)" strokeWidth="0.7" />
          </pattern>
        </defs>
      ) : null}
      <circle cx="50" cy="48" r="17" fill={f} stroke="rgba(245,241,232,0.22)" strokeWidth="0.5" />
      <path d="M12 130 C12 92 30 79 50 79 C70 79 88 92 88 130 Z" fill={f} stroke="rgba(245,241,232,0.22)" strokeWidth="0.5" />
    </svg>
  );
}

export function EntityPlate({ entity, className }: { readonly entity: Entity; readonly className?: string }) {
  const base = cn("absolute inset-0 overflow-hidden", className);
  if (entity.kind === "person") {
    const p = personById(entity.id);
    if (p.photo && !p.anonymous) {
      return (
        <div className={base} data-plate="person-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.photo.src.replace("-400", "-800")} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover saturate-[0.9]" style={{ objectPosition: `${p.photo.face.x * 100}% ${Math.max(0, p.photo.face.y * 100 - 12)}%` }} />
        </div>
      );
    }
    const [a, b, glow] = toneOf(p.id);
    return (
      <div className={base} data-plate={p.anonymous ? "person-anonymous" : "person-fallback"} style={{ background: p.anonymous ? "linear-gradient(165deg,#17181a,#26282b)" : `linear-gradient(165deg,${a},${b})` }}>
        <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(90% 70% at 85% 8%, ${p.anonymous ? "rgba(245,241,232,0.10)" : glow}, transparent 70%)` }} />
        <BigFigure hatched={p.anonymous} id={p.id} />
        {!p.anonymous ? <span aria-hidden className="absolute left-[8%] top-[6%] font-display text-[clamp(0.75rem,22cqw,4.4rem)] font-semibold leading-none tracking-[-0.05em] text-[rgba(245,241,232,0.16)]">{p.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}</span> : null}
      </div>
    );
  }
  if (entity.kind === "company") {
    const c = companyById(entity.id);
    const [a, b, glow] = toneOf(c.id);
    return (
      <div className={base} data-plate={c.logo ? "company-logo" : "company-fallback"} style={{ background: c.logo ? "linear-gradient(160deg,#1d1c19,#2b2924)" : `linear-gradient(160deg,${a},${b})` }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 h-full w-full opacity-70">
          {[16, 33, 50, 67, 84].map((v) => (
            <g key={v} stroke="rgba(245,241,232,0.08)" strokeWidth="0.35">
              <line x1={v} y1="0" x2={v} y2="100" />
              <line x1="0" y1={v} x2="100" y2={v} />
            </g>
          ))}
        </svg>
        <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(80% 60% at 20% 10%, ${glow}, transparent 70%)` }} />
        <div className="absolute inset-0 flex items-start justify-start p-[9%]">
          {c.logo ? (
            <span className="flex aspect-square w-[34%] items-center justify-center rounded-[16%] bg-[#ece7dc]">
              <svg viewBox={c.logo.viewBox ?? "0 0 64 64"} className="h-[62%] w-[62%]" aria-hidden><path d={c.logo.path} fill="#151513" /></svg>
            </span>
          ) : (
            <span className="font-display text-[clamp(0.85rem,26cqw,5rem)] font-bold leading-none tracking-[-0.05em] text-[rgba(245,241,232,0.9)]">
              {c.name.split(/\s+/).filter((w) => !/^(AS|UAB|OÜ|GmbH|Sp\.|AB)$/i.test(w)).slice(0, 2).map((w) => w[0]).join("")}
            </span>
          )}
        </div>
      </div>
    );
  }
  if (entity.kind === "project") {
    const p = PROJECTS.find((x) => x.id === entity.id)!;
    if (p.media) {
      return (
        <div className={base} data-plate="project-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.media.src} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover saturate-[0.85]" style={{ objectPosition: p.media.pos }} />
        </div>
      );
    }
    const [a, b, glow] = toneOf(p.id);
    const h = hash(p.id);
    const x = 14 + (h % 40), y = 14 + ((h >> 5) % 34);
    return (
      <div className={base} data-plate="project-plan" style={{ background: `linear-gradient(150deg,${a},${b})` }}>
        <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(70% 70% at 80% 15%, ${glow}, transparent 70%)` }} />
        <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 h-full w-full">
          <g fill="none" stroke="rgba(245,241,232,0.2)" strokeWidth="0.6">
            <rect x="10" y="10" width="140" height="80" rx="2" />
            <rect x={x} y={y} width="70" height="44" rx="1.5" stroke="rgba(245,241,232,0.38)" />
            <path d={`M${x} ${y + 22} H${x + 70} M${x + 35} ${y} V${y + 44}`} />
            <path d="M10 70 H150 M96 10 V90" strokeDasharray="2 2.4" />
          </g>
          <circle cx={x + 70} cy={y + 44} r="2.4" fill="rgba(245,241,232,0.8)" />
        </svg>
      </div>
    );
  }
  if (entity.kind === "team") {
    const t = Object.values(TEAMS).find((x) => x.id === entity.id)!;
    const ms = t.members.map(personById);
    return (
      <div className={cn(base, "grid bg-[#151412]")} data-plate="team" style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 1.5 }}>
        {ms.slice(0, 3).map((m) => (
          <div key={m.id} className="relative overflow-hidden">
            <EntityPlate entity={{ kind: "person", id: m.id }} />
          </div>
        ))}
        <div className="relative z-10 flex items-start justify-end p-[10%] font-display text-[clamp(1.2rem,8cqw,2.4rem)] font-semibold tracking-[-0.03em] text-[rgba(245,241,232,0.9)]">+{ms.length - 3}</div>
      </div>
    );
  }
  const [a, b, glow] = toneOf(entity.id);
  return (
    <div className={base} data-plate="service" style={{ background: `linear-gradient(160deg,${a},${b})` }}>
      <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(80% 60% at 80% 10%, ${glow}, transparent 70%)` }} />
      <div className="absolute left-[9%] top-[9%] h-[28%] w-[28%] text-[rgba(245,241,232,0.8)]">{entity.icon ?? <Hammer className="h-full w-full" strokeWidth={1.2} aria-hidden />}</div>
    </div>
  );
}

/**
 * ENTITY CARD — the one card of the product.
 *
 * Media (or its plate) fills the card; the scrim and the entity's eyebrow +
 * name are set on it. Translucent edge, large radius, 1px hairline; the
 * selected / featured one wears a gold hairline. Anything the caller wants to
 * say about the entity (a state, an action) goes in `children`, over the scrim.
 */
export function EntityCard({
  entity,
  aspect = "4 / 5",
  selected = false,
  eyebrow,
  title,
  className,
  children,
  as: Tag = "div",
  onClick,
  tall,
}: {
  readonly entity: Entity;
  readonly aspect?: string;
  readonly selected?: boolean;
  readonly eyebrow?: string;
  readonly title?: string;
  readonly className?: string;
  readonly children?: ReactNode;
  readonly as?: "div" | "button";
  readonly onClick?: () => void;
  readonly tall?: boolean;
}) {
  const r = resolve(entity);
  void tall;
  return (
    <Tag
      type={Tag === "button" ? "button" : undefined}
      onClick={onClick}
      data-entity={entity.kind}
      data-selected={selected || undefined}
      className={cn(
        "group relative isolate block w-full overflow-hidden rounded-[26px] text-left [container-type:inline-size]",
        aspect === "fill" && "h-full",
        "shadow-[inset_0_0_0_1px_rgba(245,241,232,0.10)] transition-[box-shadow,transform] duration-300",
        selected && "shadow-[inset_0_0_0_1.5px_rgba(212,175,55,0.7),0_0_44px_rgba(212,175,55,0.10)]",
        Tag === "button" && "cursor-pointer hover:shadow-[inset_0_0_0_1px_rgba(245,241,232,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        className,
      )}
      style={aspect === "fill" ? undefined : { aspectRatio: aspect }}
    >
      <EntityPlate entity={entity} />
      <span aria-hidden className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,7,6,0.86)_0%,rgba(7,7,6,0.42)_38%,transparent_66%)]" />
      <span className="ec-text absolute inset-x-0 bottom-0 flex flex-col gap-1 p-[7%] pt-10">
        {entity.kind === "person" && !eyebrow ? (
          <>
            <span className="font-display line-clamp-3 [overflow-wrap:anywhere] text-[clamp(1.15rem,8.5cqw,1.85rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-text-primary">{title ?? r.title}</span>
            <span className="text-[clamp(0.85rem,5.2cqw,1rem)] font-medium leading-tight text-text-primary/85">{r.eyebrow}</span>
          </>
        ) : (
          <>
            <span className="sig-stamp !text-[0.68rem] !text-[rgba(235,200,95,0.95)]">{eyebrow ?? r.eyebrow}</span>
            <span className="font-display line-clamp-3 [overflow-wrap:anywhere] text-[clamp(1.05rem,7.5cqw,1.7rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-text-primary">{title ?? r.title}</span>
          </>
        )}
        {r.sub ? <span className="text-[0.8rem] leading-tight text-text-muted">{r.sub}</span> : null}
        {children}
      </span>
    </Tag>
  );
}

/** A small, full-bleed identity: the same plate, cropped to a rounded square. */
export function EntityThumb({ entity, size = 56, className }: { readonly entity: Entity; readonly size?: number; readonly className?: string }) {
  const r = resolve(entity);
  return (
    <span className={cn("relative inline-block shrink-0 overflow-hidden [container-type:inline-size]", className)} style={{ width: size, height: size, borderRadius: entity.kind === "person" ? "28%" : entity.kind === "project" ? "18%" : "22%", boxShadow: "inset 0 0 0 1px rgba(245,241,232,0.12)" }} role="img" aria-label={r.title}>
      <EntityPlate entity={entity} />
    </span>
  );
}

export { PEOPLE, COMPANIES, PersonAvatar, TeamMark };
