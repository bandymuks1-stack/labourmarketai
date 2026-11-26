"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

export interface CvWorkMapNode {
  readonly id: string;
  readonly label: string;
  readonly side: "left" | "right";
  readonly meta?: string;
  readonly level?: "confirmed" | "recorded" | "declared";
  readonly detail?: ReactNode;
}

export interface CvWorkMapEdge {
  readonly from: string;
  readonly to: string;
}

export interface CvWorkMapProps {
  readonly title: string;
  readonly leftLabel: string;
  readonly rightLabel: string;
  /** Caller supplies at most six nodes per group, with unique canonical ids. */
  readonly nodes: readonly CvWorkMapNode[];
  /** Existing relationships only; this presentation infers neither links nor attribution. */
  readonly edges: readonly CvWorkMapEdge[];
  readonly action?: ReactNode;
}

type Link = { key: string; left: string; right: string };
type Geometry = {
  width: number;
  height: number;
  paths: { key: string; d: string; x1: number; y1: number; x2: number; y2: number }[];
};

/** Two stable groups, with exact supplied relationships and one open detail at a time. */
export function CvWorkMap({ title, leftLabel, rightLabel, nodes, edges, action }: CvWorkMapProps) {
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const detailId = `${instanceId}-detail`;
  const canvas = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const links = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const unique = new Map<string, Link>();
    for (const edge of edges) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to || from.side === to.side) continue;
      const left = from.side === "left" ? from.id : to.id;
      const right = from.side === "right" ? from.id : to.id;
      const key = JSON.stringify([left, right]);
      unique.set(key, { key, left, right });
    }
    return [...unique.values()];
  }, [nodes, edges]);

  useEffect(() => {
    const surface = canvas.current;
    if (!surface || links.length === 0) return;
    let frame = 0;
    const measure = () => {
      const bounds = surface.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const round = (value: number) => Math.round(value * 10) / 10;
      const positions = new Map([...buttons.current].map(([id, button]) => [id, button.getBoundingClientRect()]));
      const paths = links.flatMap((link) => {
        const left = positions.get(link.left);
        const right = positions.get(link.right);
        if (!left || !right) return [];
        // Lines occupy only the central gap; endpoints meet the button edges at their centres.
        const x1 = round(left.right - bounds.left);
        const y1 = round(left.top + left.height / 2 - bounds.top);
        const x2 = round(right.left - bounds.left);
        const y2 = round(right.top + right.height / 2 - bounds.top);
        const middle = round((x1 + x2) / 2);
        return [{ key: link.key, d: `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`, x1, y1, x2, y2 }];
      });
      const next = { width: round(bounds.width), height: round(bounds.height), paths };
      setGeometry((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(surface);
    for (const button of buttons.current.values()) observer?.observe(button);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [links]);

  if (nodes.length === 0) return null;
  const visibleSides = (["left", "right"] as const).filter((side) => nodes.some((node) => node.side === side));
  const twoSides = visibleSides.length === 2;
  const connectedIds = new Set<string>();
  if (selected) {
    for (const link of links) {
      if (link.left === selected.id) connectedIds.add(link.right);
      if (link.right === selected.id) connectedIds.add(link.left);
    }
  }
  const buttonId = (id: string) => `${instanceId}-node-${encodeURIComponent(id)}`;

  return (
    <section
      className="min-w-0 rounded-2xl border border-border-subtle bg-surface-1 p-4 sm:p-5"
      aria-labelledby={titleId}
      data-testid="cv-work-map"
      onKeyDown={(event) => {
        if (event.key === "Escape" && selected) {
          event.preventDefault();
          buttons.current.get(selected.id)?.focus();
          setSelectedId(null);
        }
      }}
    >
      <header className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="min-w-0 font-display text-lg font-semibold text-text-primary [overflow-wrap:anywhere]">{title}</h2>
        {action}
      </header>
      <div className={`mb-3 grid min-w-0 ${twoSides ? "grid-cols-2 gap-x-8 sm:gap-x-14 lg:gap-x-40" : "grid-cols-1"}`}>
        {visibleSides.map((side) => (
          <h3 key={side} id={`${instanceId}-${side}`} className="min-w-0 text-sm font-medium text-text-secondary [overflow-wrap:anywhere]">{side === "left" ? leftLabel : rightLabel}</h3>
        ))}
      </div>
      <div ref={canvas} className={`relative grid min-w-0 ${twoSides ? "grid-cols-2 gap-x-8 sm:gap-x-14 lg:gap-x-40" : "grid-cols-1"}`} data-testid="cv-work-map-canvas" data-single-group={!twoSides}>
        {geometry && links.length > 0 ? (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true">
            {geometry.paths.map((path) => {
              const link = links.find((item) => item.key === path.key);
              if (!link) return null;
              const active = Boolean(selected && (link.left === selected.id || link.right === selected.id));
              return (
                <g key={path.key} opacity={selected && !active ? 0.3 : 1}>
                  <path d={path.d} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={active ? 2.5 : 1.5} strokeLinecap="round" className={active ? "stroke-brand-blue" : "stroke-text-muted"} data-active={active} data-testid="cv-work-map-edge" />
                  <circle cx={path.x1} cy={path.y1} r={3} className={active ? "fill-brand-blue" : "fill-text-muted"} />
                  <circle cx={path.x2} cy={path.y2} r={3} className={active ? "fill-brand-blue" : "fill-text-muted"} />
                </g>
              );
            })}
          </svg>
        ) : null}
        {visibleSides.map((side) => (
          <div key={side} role="group" aria-labelledby={`${instanceId}-${side}`} className={`relative min-w-0 gap-3 ${twoSides ? "flex flex-col justify-center" : "grid grid-cols-2 md:grid-cols-3"}`}>
            {nodes.filter((node) => node.side === side).map((node) => {
              const active = selected?.id === node.id;
              const connected = connectedIds.has(node.id);
              const neighbours = links.flatMap((link) => link.left === node.id ? [link.right] : link.right === node.id ? [link.left] : []);
              const neighbourLabels = nodes.filter((other) => neighbours.includes(other.id)).map((other) => other.label);
              const descriptionId = `${buttonId(node.id)}-connections`;
              return (
                <div key={node.id} className="min-w-0">
                  <button
                    ref={(element) => { if (element) buttons.current.set(node.id, element); else buttons.current.delete(node.id); }}
                    id={buttonId(node.id)}
                    type="button"
                    aria-label={node.meta ? `${node.label} — ${node.meta}` : node.label}
                    aria-describedby={neighbourLabels.length > 0 ? descriptionId : undefined}
                    aria-pressed={active}
                    aria-expanded={active}
                    aria-controls={active ? detailId : undefined}
                    onClick={() => setSelectedId((current) => current === node.id ? null : node.id)}
                    className={`relative flex h-full min-h-16 w-full min-w-0 flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1 motion-reduce:transition-none ${node.level === "declared" ? "border-dashed" : "border-solid"} ${active ? "border-brand-blue bg-surface-2 ring-1 ring-brand-blue" : connected ? "border-brand-blue/60 bg-surface-2" : node.level === "confirmed" ? "border-brand-blue/50 bg-surface-1 hover:bg-surface-2" : "border-border-default bg-surface-1 hover:border-brand-blue/60 hover:bg-surface-2"}`}
                    data-testid="cv-work-map-node"
                    data-node-id={node.id}
                    data-connected={connected}
                    data-level={node.level}
                  >
                    <span className={`min-w-0 text-sm font-semibold leading-snug text-text-primary [overflow-wrap:anywhere] ${active ? "" : "line-clamp-2"}`}>{node.label}</span>
                    {node.meta ? <span className={`min-w-0 text-meta leading-snug text-text-secondary [overflow-wrap:anywhere] ${active ? "" : "line-clamp-2"}`}>{node.meta}</span> : null}
                  </button>
                  {neighbourLabels.length > 0 ? <span id={descriptionId} className="sr-only">{side === "left" ? rightLabel : leftLabel}: {neighbourLabels.join("; ")}</span> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {selected ? (
        <div id={detailId} role="region" aria-labelledby={buttonId(selected.id)} className="mt-4 min-w-0 border-t border-border-subtle pt-4 text-sm leading-relaxed text-text-primary [overflow-wrap:anywhere]" data-testid="cv-work-map-detail">
          <h3 className="mb-2 font-semibold">{selected.label}</h3>
          {selected.detail}
        </div>
      ) : null}
    </section>
  );
}
