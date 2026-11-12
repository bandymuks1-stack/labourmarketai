import { getTranslations } from "next-intl/server";

import { HomePinsStrip } from "@/components/app/home/home-pins-strip";
import { routeRequirement } from "@/lib/auth/role-gated-routes";
import { getUnreadConversationCount } from "@/lib/communication/unread";
import {
  MAX_HOME_PINS,
  pinnableAreas,
  resolveHomePins,
  type HomePinContext,
  type HomePinRole,
} from "@/lib/home/home-pins";
import { loadHomePins } from "@/lib/home/home-pins-server";

/** Quick access to what is active — existing, ungated signed-in routes. */
const QUICK_LINKS = [
  { id: "projects", href: "/dashboard/projects" },
  { id: "orders", href: "/dashboard/service-requests" },
  { id: "conversations", href: "/dashboard/communication" },
] as const;

/** The workspace role each home is rendered for — the SAME gate the page uses. */
const GATE_ROLE: Record<HomePinRole, "worker" | "company"> = {
  worker: "worker",
  company: "company",
  agency: "company",
};

/**
 * The pinned strip's server half: reads the person's stored choice, keeps
 * only the areas this home may show, and hands the client plain strings.
 *
 * ACCESS: the candidates are the home's own area list, minus any whose route
 * the one role table (`lib/auth/role-gated-routes.ts`) gates behind a role
 * this home is not rendered for. A stored pin outside that set never renders.
 */
export async function HomePinsSection({
  context,
  role,
}: {
  context: HomePinContext;
  role: HomePinRole;
}) {
  const [t, tAll, read, unread] = await Promise.all([
    getTranslations("homePins"),
    getTranslations(),
    loadHomePins(context),
    getUnreadConversationCount().catch(() => null),
  ]);

  const reachable = pinnableAreas(context).filter((area) => {
    const need = routeRequirement(area.href.replace(/[?#].*$/, ""));
    if (!need) return true;
    return need.kind === "role" && need.role === GATE_ROLE[role];
  });
  const reachableIds = new Set(reachable.map((a) => a.id));

  if (read.status === "failed") {
    return (
      <p data-testid="home-pins-unreadable" className="text-sm text-text-muted">
        {t("readFailed")}
      </p>
    );
  }

  const resolved = resolveHomePins(read.status === "profile" ? read.pins : null, context, role);
  const initial = {
    pins: resolved.pins.filter((id) => reachableIds.has(id)),
    recent: resolved.recent.filter((id) => reachableIds.has(id)),
  };

  return (
    <HomePinsStrip
      context={context}
      storage={read.status}
      initial={initial}
      areas={reachable.map((a) => ({
        id: a.id,
        href: a.href,
        iconKey: a.iconKey,
        label: tAll(a.labelKey),
      }))}
      quickLinks={QUICK_LINKS.map((q) => ({
        id: q.id,
        href: q.href,
        label: t(`quick.${q.id}`),
        note:
          q.id === "conversations" && typeof unread === "number" && unread > 0
            ? t("unread", { count: unread })
            : undefined,
      }))}
      labels={{
        title: t("title"),
        edit: t("edit"),
        done: t("done"),
        empty: t("empty"),
        more: t("more"),
        recent: t("recent"),
        quick: t("quickTitle"),
        pin: t.raw("pin") as string,
        unpin: t.raw("unpin") as string,
        moveEarlier: t.raw("moveEarlier") as string,
        moveLater: t.raw("moveLater") as string,
        limit: t("limit", { max: MAX_HOME_PINS }),
        deviceOnly: t("deviceOnly"),
        saveFailed: t("saveFailed"),
      }}
    />
  );
}

/** Holds the strip's height while it reads, so the home never jumps. */
export function HomePinsPending() {
  return <div aria-hidden data-testid="home-pins-pending" className="h-40" />;
}
