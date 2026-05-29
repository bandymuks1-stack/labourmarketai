import { hasUsefulDescription } from "./request-readiness";

/**
 * Buyer request completion checklist — deterministic, transparent
 * product logic (long-cycle-2 plan PR E).
 *
 * Tells the buyer which parts of a request are present and which are
 * still missing, using ONLY fields that already exist on the request
 * plus the real attachment count. This is NOT AI: it reads no file
 * bytes, calls nothing, and invents no data. Same inputs → same output.
 *
 * Items (every one maps to a real field):
 *   - description: a useful free-text need summary
 *   - files:       at least one attachment
 *   - location:    country OR location present
 *   - timing:      start period OR duration present
 *
 * No "contact/channel" item exists because the request row has no such
 * field — the plan forbids inventing one.
 */

export type RequestCompletionItemKey =
  | "description"
  | "files"
  | "location"
  | "timing";

export interface RequestCompletionInput {
  readonly description: string | null | undefined;
  readonly attachmentCount: number;
  readonly location: string | null | undefined;
  readonly country: string | null | undefined;
  readonly startPeriod: string | null | undefined;
  readonly duration: string | null | undefined;
}

export interface RequestCompletionItem {
  readonly key: RequestCompletionItemKey;
  readonly done: boolean;
}

export interface RequestCompletion {
  readonly items: readonly RequestCompletionItem[];
  readonly doneCount: number;
  readonly totalCount: number;
  /** The first still-missing item, in checklist order, or null if complete. */
  readonly firstMissing: RequestCompletionItemKey | null;
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function computeRequestCompletion(
  input: RequestCompletionInput,
): RequestCompletion {
  const hasFiles = Number.isFinite(input.attachmentCount)
    ? input.attachmentCount > 0
    : false;

  const items: readonly RequestCompletionItem[] = [
    { key: "description", done: hasUsefulDescription(input.description) },
    { key: "files", done: hasFiles },
    {
      key: "location",
      done: nonEmpty(input.location) || nonEmpty(input.country),
    },
    {
      key: "timing",
      done: nonEmpty(input.startPeriod) || nonEmpty(input.duration),
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const firstMissing = items.find((i) => !i.done)?.key ?? null;

  return { items, doneCount, totalCount: items.length, firstMissing };
}
