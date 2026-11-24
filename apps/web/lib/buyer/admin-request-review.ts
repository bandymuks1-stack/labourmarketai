import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  computeAdminReviewPriority,
  type AdminReviewPriorityStatus,
} from "@/lib/buyer/admin-review-priority";
import {
  computeExtractionReadiness,
  type ExtractionReadiness,
} from "@/lib/buyer/attachment-readiness";

/** Zeroed file-readiness tally (kinds of future reader a request needs). */
function emptyReadinessTally(): Record<ExtractionReadiness, number> {
  return {
    future_readable_text_file: 0,
    future_pdf_reader_needed: 0,
    future_ocr_needed: 0,
    manual_review_only: 0,
  };
}

/**
 * Admin manual-review listing (long-cycle plan PR B, option B2).
 *
 * READ-ONLY. Lists the most recent buyer requests with a deterministic
 * manual-review priority so an admin can see which requests need a look
 * and why. No mutation, no AI, no OCR, no extraction, no file-byte
 * reads, no signed URLs minted here.
 *
 * Access: the caller (the admin dashboard page) is gated by
 * `requireSuperadmin`. Every query uses the user-scoped supabase client;
 * `customer_requests` / `customer_request_attachments` RLS limits SELECT
 * to `profile_id = auth.uid() OR is_admin()`, so a real admin session
 * sees all rows while a non-admin would only ever see their own.
 *
 * Gracefully returns kind: "needs-migration" when customer_requests is
 * absent (42P01). A missing attachments table is non-fatal — counts
 * fall back to 0 so the request list still renders.
 */

const RELATION_NOT_FOUND_CODE = "42P01";
const DEFAULT_LIMIT = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export interface AdminReviewRequestRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  /** Id-only pointer to the requester — the row's click path to the
   *  existing admin user-inspect page (dead-UI P0 fix, 2026-07-05). */
  readonly profileId: string;
  readonly needSummary: string | null;
  readonly createdAt: string;
  readonly attachmentCount: number;
  readonly priority: AdminReviewPriorityStatus;
  readonly order: number;
  /** Whether the free-text need summary is useful enough to act on. */
  readonly hasUsefulDescription: boolean;
  /** Count of attachments by the kind of FUTURE reader they would need. */
  readonly fileReadiness: Record<ExtractionReadiness, number>;
}

export type AdminReviewListResult =
  | { kind: "ok"; rows: readonly AdminReviewRequestRow[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export async function listRequestsForAdminReview(
  limit: number = DEFAULT_LIMIT,
): Promise<AdminReviewListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", rows: [] };

  const { data: requests, error } = await asAny(supabase)
    .from("customer_requests")
    .select("id, title, need_summary, status, created_at, profile_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE)
      return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqRows = (requests ?? []) as any[];
  const ids = reqRows.map((r) => r.id as string);

  // Attachment counts + file-readiness tally per request. A missing
  // attachments table is non-fatal — every request simply counts as 0
  // files. We read only the MIME type (metadata) — never file bytes —
  // to classify what KIND of future reader each file would need.
  const countByRequest = new Map<string, number>();
  const readinessByRequest = new Map<string, Record<ExtractionReadiness, number>>();
  if (ids.length > 0) {
    const { data: attachments, error: attErr } = await asAny(supabase)
      .from("customer_request_attachments")
      .select("request_id, mime_type")
      .in("request_id", ids);
    if (!attErr) {
      for (const a of (attachments ?? []) as {
        request_id: string;
        mime_type: string | null;
      }[]) {
        countByRequest.set(
          a.request_id,
          (countByRequest.get(a.request_id) ?? 0) + 1,
        );
        const tally =
          readinessByRequest.get(a.request_id) ?? emptyReadinessTally();
        tally[computeExtractionReadiness(a.mime_type)] += 1;
        readinessByRequest.set(a.request_id, tally);
      }
    }
  }

  const rows: AdminReviewRequestRow[] = reqRows.map((r) => {
    const attachmentCount = countByRequest.get(r.id as string) ?? 0;
    const profileId = (r.profile_id as string | null) ?? "";
    const priority = computeAdminReviewPriority({
      description: (r.need_summary as string | null) ?? null,
      attachmentCount,
      status: r.status as string,
    });
    return {
      id: r.id as string,
      title: r.title as string,
      status: r.status as string,
      profileId,
      needSummary: (r.need_summary as string | null) ?? null,
      createdAt: r.created_at as string,
      attachmentCount,
      priority: priority.status,
      order: priority.order,
      hasUsefulDescription: priority.hasUsefulDescription,
      fileReadiness:
        readinessByRequest.get(r.id as string) ?? emptyReadinessTally(),
    };
  });

  // Most actionable first (lower order), then newest within a tier.
  rows.sort((a, b) =>
    a.order !== b.order
      ? a.order - b.order
      : b.createdAt.localeCompare(a.createdAt),
  );

  return { kind: "ok", rows };
}
