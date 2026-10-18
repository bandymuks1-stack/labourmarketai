import { getTranslations } from "next-intl/server";

import { WorkContextMap, type WorkContextMapNode } from "@/components/app/work-world/work-context-map";
import { playerInitials } from "@/lib/identity/player-identity";
import type { WorkerPlayerCard } from "@/lib/player-card/player-card";
import { buildWorkContext } from "@/lib/player-card/work-context";

/**
 * Server wrapper for the Level 2 work-context map: resolves copy, builds the
 * nodes from the ONE player card (no second source) and renders the map.
 */
export async function WorkContextSection({
  card,
  name,
  avatarUrl = null,
}: {
  readonly card: WorkerPlayerCard;
  readonly name: string;
  readonly avatarUrl?: string | null;
}) {
  const t = await getTranslations("workContext");
  const tChain = await getTranslations("evidenceChain");
  const statusWords = { done: tChain("status.done"), absent: tChain("status.absent"), unknown: tChain("status.unknown") };

  const nodes: WorkContextMapNode[] = buildWorkContext(card).map((n) => {
    const label = t(`nodes.${n.key}`);
    let fact: string;
    if (n.key === "next") fact = t("facts.next");
    else if (n.status !== "done") fact = statusWords[n.status];
    else if (n.key === "current") fact = n.names.join(" · ");
    else fact = t(`facts.${n.key}`, { count: n.count ?? 0 });
    return { key: n.key, status: n.status, label, fact, href: n.href, door: n.key === "next" };
  });

  return (
    <WorkContextMap
      title={t("title")}
      person={{ name, initials: playerInitials(name), avatarUrl }}
      nodes={nodes}
      statusWords={statusWords}
    />
  );
}
