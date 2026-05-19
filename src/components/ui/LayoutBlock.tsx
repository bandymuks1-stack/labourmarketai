/**
 * Re-orderable layout primitive (presentational only).
 *
 * `LayoutBlockView` is the one block container; `LayoutRegion` renders a
 * typed, ordered list of {@link LayoutBlock} descriptors. Reordering later =
 * changing the descriptor array (or calling `reorderBlocks`) — no component
 * rewrites, no second block system. It composes the panel/token layer; it
 * does not introduce a new surface style.
 */
import type { LayoutBlock, LayoutBlockSpan } from "@/lib/layout-blocks";
import { orderBlocks } from "@/lib/layout-blocks";

const SPAN_CLASS: Record<LayoutBlockSpan, string> = {
  full: "lg:col-span-12",
  half: "lg:col-span-6",
  third: "lg:col-span-4",
};

export function LayoutBlockView({
  block,
  children,
}: {
  block: LayoutBlock;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`${SPAN_CLASS[block.span ?? "full"]} glass p-6`}
      data-block-kind={block.kind}
      data-block-id={block.id}
    >
      {block.title ? (
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-fg-mute">
          {block.title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

export function LayoutRegion({
  blocks,
  render,
}: {
  blocks: LayoutBlock[];
  render: (block: LayoutBlock) => React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {orderBlocks(blocks).map((block) => (
        <LayoutBlockView key={block.id} block={block}>
          {render(block)}
        </LayoutBlockView>
      ))}
    </div>
  );
}
