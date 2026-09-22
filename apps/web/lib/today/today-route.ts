import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";

/**
 * ŠIANDIEN — the worker's OPENING CONTEXT inside the ONE conversation
 * (owner decision 0017, 2026-09-22: one product, one authenticated home,
 * the conversation as the control plane).
 *
 * PURE. No IO, no React, no `server-only` — the SAME predicate runs on the
 * server (the root page decides which opening context to compose) and
 * wherever a client needs the same answer, so the two can never disagree
 * about who a person is standing as.
 *
 * The rule, in words:
 *   · `/dashboard` is the conversation for EVERY identity. There is no
 *     second root, no `?ask=1` door and no tab that "opens the chat" — the
 *     chat is what the home IS;
 *   · a WORKER standing in their PERSONAL space opens that conversation
 *     with ŠIANDIEN as its opening context — one next action, today's
 *     recorded work, open items, one growth line, one opportunity line,
 *     the stations — composed ABOVE the greeting and the composer;
 *   · every other identity (company / agency / admin) and a worker acting
 *     inside an organization open the conversation with the opening
 *     composition they already had;
 *   · every existing deep link (`?result=`, `?say=`, `?intent=`, …) keeps
 *     working — they always addressed the conversation, and the
 *     conversation is now always what `/dashboard` renders.
 *
 * SUPERSEDES the 2026-09-13 worker mobile IA §2 split ("ŠIANDIEN is a page;
 * PAKLAUSK is the conversation on demand") — frozen contract §2.3 named the
 * three tabs "a hypothesis, not irreversible architecture", and the owner
 * retired it on 2026-09-22 (`docs/DECISIONS/0017-one-product-chat-first.md`).
 */

/** True for a worker whose ACTIVE workspace is the personal space. A worker
 *  acting inside an organization is not in their personal "now". */
export function isWorkerPersonalSpace(input: {
  readonly activeRole: string | null | undefined;
  readonly activeWorkspaceId: string | null | undefined;
}): boolean {
  return (
    input.activeRole === "worker" &&
    (input.activeWorkspaceId ?? PERSONAL_WORKSPACE_ID) === PERSONAL_WORKSPACE_ID
  );
}

/** Which opening context the ONE conversation composes for a person. */
export type ConversationOpeningContext = "today" | "workspace";

/** The one decision: a worker in their personal space opens with ŠIANDIEN;
 *  everyone else opens with the workspace composition. */
export function conversationOpeningContext(input: {
  readonly activeRole: string | null | undefined;
  readonly activeWorkspaceId: string | null | undefined;
}): ConversationOpeningContext {
  return isWorkerPersonalSpace(input) ? "today" : "workspace";
}

/** The secondary stations reachable from ŠIANDIEN in one tap. Every href is
 *  an existing route; `world` is the opportunities workspace (the former
 *  PASAULIS tab — a contextual result, not a second root); `numbers` is the
 *  Work-in-Numbers station — a first-class surface under A-14 (owner
 *  decision 0015). */
export const TODAY_STATIONS = [
  { id: "world", href: "/dashboard/opportunities" },
  { id: "journal", href: "/dashboard/journal" },
  { id: "numbers", href: "/dashboard/work-in-numbers" },
  { id: "profile", href: "/dashboard/profile" },
  { id: "cv", href: "/cv" },
  { id: "gallery", href: "/dashboard/gallery" },
] as const;
export type TodayStationId = (typeof TODAY_STATIONS)[number]["id"];
