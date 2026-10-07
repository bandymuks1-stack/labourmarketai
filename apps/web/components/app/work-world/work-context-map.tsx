import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CheckCheck,
  ClipboardList,
  Compass,
  HelpCircle,
  History,
  Minus,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { Link } from "@/lib/i18n/navigation";
import type { WorkContextKey, WorkContextStatus } from "@/lib/player-card/work-context";
import { cn } from "@/lib/utils";

/**
 * LIVE WORK GRAPH — LEVEL 2 (authenticated professional context).
 *
 * The person is the CENTRE; the six stages of their work life are arranged on
 * ONE flow path around them:
 *
 *   WORKING NOW → RECORDS → MANAGER'S RECORD → HISTORY → SKILLS → NEXT
 *
 * A relationship graph is used here because relationships ARE the question
 * ("how does what I do now become what I can do next?"). The path segment
 * between two stages is solid only when BOTH stages have data, so the diagram
 * itself shows where the person's work has — and has not yet — carried through.
 *
 * Every node is a real link to the surface that owns its facts. State is never
 * colour alone: ring shape (solid / dashed / dotted) + glyph + word. On a
 * phone the same content is an ordered list; no information is lost. Pure and
 * i18n-agnostic: the model comes from `buildWorkContext(card)` (no second
 * source of truth) and the caller passes resolved strings.
 */

const ICON: Record<WorkContextKey, LucideIcon> = {
  current: Briefcase,
  records: ClipboardList,
  manager: BadgeCheck,
  history: History,
  skills: Wrench,
  next: Compass,
};

// Centre of each node, in % of the map box. The path runs along this order.
const POS: Record<WorkContextKey, { x: number; y: number }> = {
  current: { x: 20, y: 16 },
  records: { x: 7, y: 50 },
  manager: { x: 20, y: 84 },
  history: { x: 80, y: 84 },
  skills: { x: 93, y: 50 },
  next: { x: 80, y: 16 },
};
const ORDER: readonly WorkContextKey[] = ["current", "records", "manager", "history", "skills", "next"];

const TONE: Record<WorkContextKey, string> = {
  current: "border-state-live text-state-live",
  records: "border-brand-cyan text-brand-cyan",
  manager: "border-trust-accent text-trust-accent",
  history: "border-brand-blue text-brand-blue",
  skills: "border-brand-cyan text-brand-cyan",
  next: "border-ink-500 text-text-primary",
};

const GLYPH: Record<WorkContextStatus, LucideIcon> = { done: CheckCheck, absent: Minus, unknown: HelpCircle };
const RING: Record<WorkContextStatus, string> = {
  done: "border-solid",
  absent: "border-dashed opacity-75",
  unknown: "border-dotted opacity-80",
};

export interface WorkContextMapNode {
  readonly key: WorkContextKey;
  readonly status: WorkContextStatus;
  readonly label: string;
  /** The stated fact ("23 records"), or the status word when absent/unknown. */
  readonly fact: string;
  readonly href: string;
  /** Next is a door, not a fact about the person: drawn with an arrow glyph. */
  readonly door?: boolean;
}

export function WorkContextMap({
  title,
  person,
  nodes,
  statusWords,
  testId = "work-context-map",
}: {
  readonly title: string;
  readonly person: { readonly name: string; readonly initials: string; readonly avatarUrl: string | null };
  readonly nodes: readonly WorkContextMapNode[];
  readonly statusWords: Record<WorkContextStatus, string>;
  readonly testId?: string;
}) {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const ordered = ORDER.map((k) => byKey.get(k)).filter((n): n is WorkContextMapNode => Boolean(n));

  return (
    <section aria-label={title} className="flex flex-col gap-4" data-testid={testId}>
      <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">{title}</h3>

      {/* Desktop: the spatial map. */}
      <div className="relative mx-auto hidden aspect-[16/9] w-full max-w-3xl md:block" data-testid={`${testId}-spatial`}>
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {ordered.slice(0, -1).map((n, i) => {
            const m = ordered[i + 1];
            const a = POS[n.key];
            const b = POS[m.key];
            // Solid only where the work has carried through BOTH stages.
            const through = n.status === "done" && m.status === "done" && !m.door;
            return (
              <line
                key={`${n.key}-${m.key}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                vectorEffect="non-scaling-stroke"
                strokeWidth={2}
                strokeDasharray={through ? undefined : "5 5"}
                className={through ? "stroke-brand-blue" : "stroke-ink-600"}
              />
            );
          })}
        </svg>

        <div
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center"
          data-testid={`${testId}-person`}
        >
          <PersonPortrait name={person.name} avatarUrl={person.avatarUrl} initials={person.initials} width="84px" />
          <p className="font-display text-lg font-bold tracking-tightest text-text-primary">{person.name}</p>
        </div>

        {ordered.map((n) => (
          <div
            key={n.key}
            className="absolute -mt-7 -translate-x-1/2"
            style={{ left: `${POS[n.key].x}%`, top: `${POS[n.key].y}%` }}
          >
            <NodeLink node={n} statusWords={statusWords} layout="stack" />
          </div>
        ))}
      </div>

      {/* Phone: the same content as an ordered list. */}
      <div className="md:hidden">
        <div className="mb-3 flex items-center gap-3">
          <PersonPortrait name={person.name} avatarUrl={person.avatarUrl} initials={person.initials} width="48px" />
          <p className="font-display text-lg font-bold tracking-tightest text-text-primary">{person.name}</p>
        </div>
        <ol className="flex flex-col gap-1" data-testid={`${testId}-list`}>
          {ordered.map((n) => (
            <li key={n.key}>
              <NodeLink node={n} statusWords={statusWords} layout="row" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function NodeLink({
  node,
  statusWords,
  layout,
}: {
  readonly node: WorkContextMapNode;
  readonly statusWords: Record<WorkContextStatus, string>;
  readonly layout: "stack" | "row";
}) {
  const Icon = ICON[node.key];
  const Glyph = node.door ? ArrowRight : GLYPH[node.status];
  const row = layout === "row";
  return (
    <Link
      href={node.href as "/dashboard"}
      data-testid={`work-context-node-${node.key}`}
      data-status={node.status}
      className={cn(
        "group flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-ink-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        row ? "min-h-11 flex-row" : "w-36 flex-col text-center",
      )}
    >
      <span
        className={cn(
          "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 bg-ink-900",
          node.door ? "border-solid" : RING[node.status],
          TONE[node.key],
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink-900">
          <Glyph className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        </span>
      </span>
      <span className={cn("flex min-w-0 flex-col", row ? "items-start" : "items-center")}>
        <span className="font-mono text-[0.625rem] uppercase tracking-label text-text-secondary">{node.label}</span>
        <span
          className={cn(
            "text-sm [overflow-wrap:anywhere]",
            node.status === "done" ? "font-semibold text-text-primary" : "text-text-secondary",
          )}
        >
          {node.fact}
        </span>
        <span className="sr-only">{`${node.label}: ${statusWords[node.status]}`}</span>
      </span>
    </Link>
  );
}
