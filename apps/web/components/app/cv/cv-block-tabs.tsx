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
  ariaLabel,
}: {
  readonly active: CvBlock;
  /** Only the blocks that have content — an empty block has no tab. */
  readonly blocks: readonly CvBlock[];
  readonly hrefFor: (block: CvBlock) => string;
  readonly labelFor: (block: CvBlock) => string;
  /** Names the block navigation for assistive technology. */
  readonly ariaLabel: string;
}) {
  return (
    // The same segmented control as the organization Living CV (#3775): three
    // to a row on a phone, one row from `sm`; it never scrolls sideways.
    <nav aria-label={ariaLabel} className="print:hidden" data-testid="cv-block-tabs">
      <ul className="grid grid-cols-3 gap-1 rounded-card border border-ink-600 bg-ink-800/40 p-1 sm:flex sm:w-max sm:max-w-full sm:flex-wrap">
        {blocks.map((b) => {
          const isActive = b === active;
          return (
            <li key={b} className="min-w-0">
              <a
                href={hrefFor(b)}
                aria-current={isActive ? "page" : undefined}
                data-testid={`cv-tab-${b}`}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-[0.6rem] px-3 text-center text-support [overflow-wrap:anywhere]",
                  isActive
                    ? "bg-brand-blue/15 font-semibold text-text-primary"
                    : "text-text-secondary hover:text-text-primary",
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
