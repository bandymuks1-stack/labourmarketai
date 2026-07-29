import "server-only";

import { getTranslations } from "next-intl/server";

import type { ChatInterestLabels } from "@/lib/conversation/find-work-contract";

/**
 * The canonical `WorkerInterestButton` copy, resolved from the ONE
 * `opportunities.interest.*` namespace.
 *
 * Extracted in W3 (Context Panel) from `lib/conversation/find-work.ts`, where
 * it was a private helper. The panel needs the identical bag: the moment a
 * second surface resolved these strings itself, the express-interest control
 * would start speaking two dialects of the same action — the parallel-structure
 * failure the doctrine names. One resolver, one namespace, every surface.
 *
 * It stays OUT of the `"use server"` modules on purpose: a server-action file
 * may only export async functions that are safe as public endpoints, and this
 * is an internal helper, not an endpoint.
 */
export async function resolveInterestLabels(): Promise<ChatInterestLabels> {
  const t = await getTranslations("opportunities.interest");
  return {
    express: t("express"),
    sent: t("sent"),
    reviewed: t("reviewed"),
    contacted: t("contacted"),
    withdraw: t("withdraw"),
    internalNote: t("internalNote"),
    error: t("error"),
    contactedLink: t("contactedLink"),
    contactEmployer: t("contactEmployer"),
    contactError: t("contactError"),
  };
}
