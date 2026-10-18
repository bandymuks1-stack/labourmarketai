import { getTranslations } from "next-intl/server";

import type { EvidenceChainLabels } from "@/components/app/work-world/evidence-chain";

/** Resolve the `evidenceChain` copy once per request. */
export async function buildEvidenceChainLabels(): Promise<EvidenceChainLabels> {
  const t = await getTranslations("evidenceChain");
  return {
    label: t("label"),
    own: t("own"),
    nodes: {
      recorded: t("nodes.recorded"),
      photo: t("nodes.photo"),
      manager: t("nodes.manager"),
      history: t("nodes.history"),
    },
    status: {
      done: t("status.done"),
      waiting: t("status.waiting"),
      absent: t("status.absent"),
      attention: t("status.attention"),
      unknown: t("status.unknown"),
    },
  };
}
