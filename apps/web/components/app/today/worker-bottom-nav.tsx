"use client";

import { useSearchParams } from "next/navigation";

import { BottomNav, type WorkerNavIconKey } from "@/components/app/bottom-nav";
import { usePathname } from "@/lib/i18n/navigation";
import { WORKER_TABS, activeWorkerTab, type WorkerTabId } from "@/lib/today/today-route";

/** The worker bar's copy, resolved on the server (`todayScreen.nav.*`) and
 *  handed down — no client message namespace is added for it. */
export type WorkerNavLabels = Readonly<Record<WorkerTabId, string>> & {
  readonly aria: string;
};

/**
 * The worker's three tabs — ŠIANDIEN · PASAULIS · PAKLAUSK (frozen contract
 * §2.3, IA §2) — built ON the existing `BottomNav` primitive, not beside
 * it: same list item, same icon size, same selected-state bar, same tap
 * height. Only the tab set and the active rule differ, and both come from
 * `lib/today/today-route.ts`, the module the page's own surface decision
 * reads — so the bar can never highlight a tab the page is not showing.
 *
 * Visible at every width: on desktop the same three roots stay one tap
 * away (IA §8 — the rail is a later slice; nothing desktop-only is added).
 */
export function WorkerBottomNav({
  labels,
  placement,
}: {
  labels: WorkerNavLabels;
  placement: "fixed" | "static";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = activeWorkerTab(pathname, searchParams);
  return (
    <BottomNav
      items={WORKER_TABS.map((tab) => ({
        id: tab.id,
        href: tab.href,
        label: labels[tab.id],
        iconKey: tab.id satisfies WorkerNavIconKey,
      }))}
      activeId={active}
      placement={placement}
      visibility="all"
      ariaLabel={labels.aria}
      testId="worker-bottom-nav"
    />
  );
}
