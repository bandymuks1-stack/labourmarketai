"use server";

import "server-only";

import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { listOrgEmployeeEngagements } from "@/lib/company/org-employee-engagements";
import { fetchQuickReviewQueue } from "@/lib/journal/review-queue";

import {
  CONFIRM_CHAT_ENABLE_LIMIT,
  CONFIRM_CHAT_ENTRY_LIMIT,
  CONFIRM_CHAT_SKILL_LIMIT,
  type ConfirmChatEntry,
  type ConfirmWorkChatResult,
} from "@/lib/conversation/confirm-work-contract";

/**
 * "Patvirtink Jono darbą" / "ką reikia patvirtinti?" (owner contract §14 —
 * WORK → EVIDENCE → EMPLOYER CONFIRMATION → VERIFIED CAPABILITY → LIVING
 * IDENTITY). Two canonical reads, nothing else:
 *   • `fetchQuickReviewQueue()` — the inbox's one-tap queue: the entries the
 *     gated `reviewable_journal_entry_ids` RPC returns (a manager of the
 *     organization; the person's engagement has journal review ENABLED; no
 *     confirmation yet), with the declared-unverified skills a confirmation
 *     would verify;
 *   • `listOrgEmployeeEngagements(organizationId)` — the organization's
 *     active employee engagements with the CANONICAL review flag, so the
 *     answer can say WHO is not reviewable yet and offer the one action that
 *     changes it (`set_engagement_journal_review`, the membership RPC).
 * A person named in the sentence narrows the queue. Bounded; no write.
 */
export async function loadConfirmWorkForChat(sentence: string): Promise<ConfirmWorkChatResult> {
  const company = await requireEmployerCompany();
  if (!company.ok) return { kind: "no-company" };
  try {
    const [queue, members] = await Promise.all([
      fetchQuickReviewQueue(),
      listOrgEmployeeEngagements(company.organizationId),
    ]);
    const lower = sentence.toLowerCase();
    const named = queue.filter((e) => {
      const n = e.workerName.toLowerCase().trim();
      return n.length >= 3 && lower.includes(n);
    });
    const shown = (named.length > 0 ? named : queue).slice(0, CONFIRM_CHAT_ENTRY_LIMIT);
    const entries: ConfirmChatEntry[] = shown.map((e) => ({
      entryId: e.id,
      workerName: e.workerName,
      createdAt: e.createdAt,
      excerpt: e.originalText.replace(/\s+/g, " ").trim().slice(0, 80),
      recognizedSlugs: e.recognizedSlugs.slice(0, 4),
      skillsToConfirm: e.skillsToConfirm.slice(0, CONFIRM_CHAT_SKILL_LIMIT).map((s) => ({ id: s.id, slug: s.slug })),
    }));
    const rows = members.kind === "ok" ? members.rows : [];
    return {
      kind: "ok",
      entries,
      entryTotal: named.length > 0 ? named.length : queue.length,
      notEnabled: rows.filter((m) => !m.journalReviewEnabled).slice(0, CONFIRM_CHAT_ENABLE_LIMIT).map((m) => ({ engagementId: m.engagementId, name: m.name })),
      enabledCount: rows.filter((m) => m.journalReviewEnabled).length,
    };
  } catch {
    return { kind: "error" };
  }
}
