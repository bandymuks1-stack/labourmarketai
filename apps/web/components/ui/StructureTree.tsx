import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StructureNode = {
  readonly id: string;
  readonly label: ReactNode;
  /** One short line beside the label: a role, a status chip, a date. */
  readonly meta?: ReactNode;
  /** A real count from the data, or omit it. Never an estimate. */
  readonly count?: number;
  readonly children?: readonly StructureNode[];
  /** Shown under a node that can have children but has none. */
  readonly empty?: ReactNode;
};

/**
 * ONE STRUCTURE TREE — what belongs to what, more than one level deep:
 * company → teams → people, project → teams → people.
 *
 * Nested lists, so a screen reader announces the levels and the item counts
 * without an ARIA tree. A node with children is a native `<details>`: it
 * opens and closes with the keyboard and without JavaScript, and starts open
 * down to `openDepth`. The label is whatever the caller passes — a link, a
 * `ListRow`-style line, plain text. For one level of grouping use
 * `GroupedList`; this is for two levels and more.
 */
export function StructureTree({
  label,
  nodes,
  openDepth = 1,
  testId,
  className,
}: {
  /** Accessible name of the whole structure. */
  label: string;
  nodes: readonly StructureNode[];
  /** Levels open at first: 1 = the top level's children are visible. */
  openDepth?: number;
  testId?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} data-testid={testId} className={cn("min-w-0", className)}>
      <Level nodes={nodes} depth={0} openDepth={openDepth} />
    </nav>
  );
}

function Line({ node }: { node: StructureNode }) {
  return (
    <span className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
      <span className="min-w-0 text-sm font-medium text-text-primary">{node.label}</span>
      {typeof node.count === "number" && (
        <span className="shrink-0 font-mono text-xs text-text-muted">{node.count}</span>
      )}
      {node.meta && <span className="min-w-0 text-xs text-text-muted">{node.meta}</span>}
    </span>
  );
}

function Level({
  nodes,
  depth,
  openDepth,
}: {
  nodes: readonly StructureNode[];
  depth: number;
  openDepth: number;
}) {
  return (
    <ul className={cn("flex flex-col", depth > 0 && "ml-3 border-l border-ink-600 pl-3")}>
      {nodes.map((node) => {
        const canHaveChildren = node.children !== undefined;
        if (!canHaveChildren) {
          return (
            <li key={node.id} className="flex min-w-0 px-1">
              <Line node={node} />
            </li>
          );
        }
        const children = node.children ?? [];
        return (
          <li key={node.id} className="min-w-0">
            <details open={depth < openDepth} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden
                  className="inline-block w-3 shrink-0 text-xs text-text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
                >
                  ›
                </span>
                <Line node={node} />
              </summary>
              {children.length === 0 ? (
                node.empty ? (
                  <p className="ml-3 border-l border-ink-600 py-2 pl-3 text-sm text-text-muted">
                    {node.empty}
                  </p>
                ) : null
              ) : (
                <Level nodes={children} depth={depth + 1} openDepth={openDepth} />
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
}
