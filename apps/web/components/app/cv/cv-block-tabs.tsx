import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * ONE SCREEN PER BLOCK (decision 0034, owner 2026-11-24): the Living CV is
 * split into blocks, each with its own address (`?tab=`), reached by these
 * tabs and never appended below the Overview. A link, a notification or the
 * chat opens a block directly.
 *
 * Server-rendered links, not client state: the address IS the state, so a
 * deep link, the back button and a reload all land on the same block.
 *
 * PRINT IS THE WHOLE CV. "Download CV" prints the page; a block that is not
 * the active one is hidden on screen only (`print:block`), so the document
 * never loses a section because of the tab the person happened to be on.
 */

export const CV_BLOCKS = ["overview", "experience", "projects", "photos", "documents", "reviews"] as const;
export type CvBlock = (typeof CV_BLOCKS)[number];

export function parseCvBlock(raw: string | string[] | undefined): CvBlock {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  return (CV_BLOCKS as readonly string[]).includes(v ?? "") ? (v as CvBlock) : "overview";
}

export function CvBlockTabs({
  active,
  blocks,
  hrefFor,
  labelFor,
}: {
  readonly active: CvBlock;
  /** Only the blocks that have content — an empty block has no tab. */
  readonly blocks: readonly CvBlock[];
  readonly hrefFor: (block: CvBlock) => string;
  readonly labelFor: (block: CvBlock) => string;
}) {
  return (
    <nav
      className="-mx-4 overflow-x-auto px-4 print:hidden sm:mx-0 sm:px-0"
      data-testid="cv-block-tabs"
    >
      <ul className="flex min-w-max gap-1 border-b border-[rgb(var(--c-text-primary)/0.12)]">
        {blocks.map((b) => {
          const isActive = b === active;
          return (
            <li key={b}>
              <a
                href={hrefFor(b)}
                aria-current={isActive ? "page" : undefined}
                data-testid={`cv-tab-${b}`}
                className={cn(
                  "inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-[#D4AF37] text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-primary",
                )}
              >
                {labelFor(b)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** One block's content: shown on screen only when it is the active block,
 *  always printed. */
export function CvTabPanel({
  block,
  active,
  children,
}: {
  readonly block: CvBlock;
  readonly active: CvBlock;
  readonly children: ReactNode;
}) {
  return (
    <div
      data-cv-block={block}
      className={cn("contents", block !== active && "hidden print:contents")}
    >
      {children}
    </div>
  );
}
