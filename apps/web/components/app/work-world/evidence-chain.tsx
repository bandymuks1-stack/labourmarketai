import { AlertTriangle, BadgeCheck, Camera, CheckCheck, ClipboardList, Clock, History, Minus, HelpCircle, type LucideIcon } from "lucide-react";

import {
  CHAIN_NODES,
  type ChainNode,
  type ChainNodeKey,
  type ChainNodeStatus,
  type EvidenceChainModel,
} from "@/lib/evidence/evidence-chain";
import { cn } from "@/lib/utils";

/**
 * THE EVIDENCE CHAIN — the product's recognisable "how far has this work got?"
 * pattern (premium completion mission §8). One component, used wherever a
 * record's standing is shown: Journal rows today; identity, project, team, the
 * Living CV and reports next. See `lib/evidence/evidence-chain.ts` for the
 * derivation and the rules (EVIDENCE ≠ VERIFICATION, UNKNOWN ≠ ZERO).
 *
 * STATE IS NEVER COLOUR ALONE. Each status has its own RING SHAPE (solid /
 * dashed / dotted), its own GLYPH (check / clock / dash / alert / ?) and its
 * own WORD (screen-reader text always, visible text in `full`). Colour only
 * reinforces: cyan = evidence, green = a manager's record, amber = needs
 * attention, gold = in the person's history (design rule #4: gold never means
 * confirmation).
 *
 * Server-safe and i18n-agnostic: the caller passes resolved labels.
 */

export interface EvidenceChainLabels {
  /** Accessible name for the whole chain. */
  readonly label: string;
  readonly nodes: Record<ChainNodeKey, string>;
  readonly status: Record<ChainNodeStatus, string>;
  /** Spoken for a self-confirmed manager node: "own", never a manager's. */
  readonly own: string;
}

const NODE_ICON: Record<ChainNodeKey, LucideIcon> = {
  recorded: ClipboardList,
  photo: Camera,
  manager: BadgeCheck,
  history: History,
};

const STATUS_GLYPH: Record<ChainNodeStatus, LucideIcon> = {
  done: CheckCheck,
  waiting: Clock,
  absent: Minus,
  attention: AlertTriangle,
  unknown: HelpCircle,
};

// Ring SHAPE carries the state; colour is secondary.
const RING: Record<ChainNodeStatus, string> = {
  done: "border-solid",
  waiting: "border-dashed",
  absent: "border-dashed opacity-70",
  attention: "border-solid",
  unknown: "border-dotted opacity-80",
};

function toneFor(node: ChainNode): string {
  if (node.status === "attention") return "border-state-amber text-state-amber";
  if (node.status === "done") {
    if (node.key === "photo" || node.key === "recorded") return "border-brand-cyan text-brand-cyan";
    if (node.key === "manager") return node.own ? "border-brand-cyan text-brand-cyan" : "border-trust-accent text-trust-accent";
    return "border-brand-blue text-brand-blue"; // history = gold
  }
  return "border-ink-500 text-text-muted";
}

export function EvidenceChain({
  chain,
  labels,
  size = "compact",
  testId,
}: {
  readonly chain: EvidenceChainModel;
  readonly labels: EvidenceChainLabels;
  /** `compact`: nodes only (a row). `full`: nodes with visible words. */
  readonly size?: "compact" | "full";
  readonly testId?: string;
}) {
  const full = size === "full";
  return (
    <ol
      aria-label={labels.label}
      className={cn("flex items-start", full ? "gap-1 sm:gap-2" : "gap-1")}
      data-testid={testId ?? "evidence-chain"}
      data-verification={chain.verification}
    >
      {chain.nodes.map((node, i) => {
        const Icon = NODE_ICON[node.key];
        const Glyph = STATUS_GLYPH[node.status];
        const next = chain.nodes[i + 1];
        // The connector is solid only between two real "done" steps.
        const linked = node.status === "done" && next?.status === "done";
        const word =
          node.key === "manager" && node.own && node.status === "done"
            ? labels.own
            : labels.status[node.status];
        return (
          <li
            key={node.key}
            className="flex min-w-0 items-start"
            data-node={node.key}
            data-status={node.status}
            data-own={node.own ? "true" : undefined}
          >
            <span className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-full border-2 bg-ink-900",
                  RING[node.status],
                  toneFor(node),
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ink-900">
                  <Glyph className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                </span>
              </span>
              <span
                className={cn(
                  "text-center text-meta leading-tight text-text-secondary",
                  full ? "max-w-[6.5rem]" : "sr-only",
                )}
              >
                {labels.nodes[node.key]}
                {full ? <span className="block text-text-muted">{word}</span> : null}
              </span>
              {!full ? <span className="sr-only">{`${labels.nodes[node.key]}: ${word}`}</span> : null}
            </span>
            {i < CHAIN_NODES.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "mx-1 mt-4 h-0.5 w-3 shrink-0 sm:w-5",
                  linked ? "bg-brand-blue" : "border-t-2 border-dashed border-ink-600",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
