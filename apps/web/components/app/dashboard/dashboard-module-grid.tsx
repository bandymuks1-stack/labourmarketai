import { getTranslations } from "next-intl/server";
import {
  Bell,
  Building2,
  CalendarDays,
  Compass,
  FileText,
  Handshake,
  Home,
  IdCard,
  ListChecks,
  MapPin,
  MessageSquare,
  NotebookPen,
  Search,
  Shield,
  Store,
  User,
  type LucideIcon,
} from "lucide-react";

import { ActionCard } from "@/components/app/action-card";
import type { ControlRoomModule } from "@/lib/dashboard/control-room-view-model";
import type { ModuleIconKey } from "@/lib/dashboard/dashboard-module-registry";

/**
 * Role-specific control-room grid (PR B). Renders the module list the pure
 * view model produced from the ONE dashboard module registry — this
 * component owns presentation only (icons + the shared ActionCard pattern)
 * and can never invent a destination, a label or a count.
 *
 * Every card is fully clickable (ActionCard = a real Link to the module's
 * real route) and carries a badge ONLY when its notification-spine count is
 * > 0 — the same numbers the bell shows, never a parallel count. Mobile:
 * the same compact 2-column grid the owner-approved MyZone grid used
 * (2 → 3 → 5 columns, no horizontal overflow).
 *
 * Icons live here because lucide is a presentation concern; the registry
 * only carries icon ids (same split as BottomNav / DashboardTabs). One icon
 * per destination across the whole app (audit PR8): journal = NotebookPen,
 * messages = MessageSquare, map = MapPin, documents = FileText.
 */
const ICONS: Record<ModuleIconKey, LucideIcon> = {
  home: Home,
  store: Store,
  map: MapPin,
  idCard: IdCard,
  journal: NotebookPen,
  messages: MessageSquare,
  user: User,
  shield: Shield,
  compass: Compass,
  calendar: CalendarDays,
  documents: FileText,
  building: Building2,
  search: Search,
  bell: Bell,
  checklist: ListChecks,
  handshake: Handshake,
};

export async function DashboardModuleGrid({
  modules,
}: {
  modules: readonly ControlRoomModule[];
}) {
  if (modules.length === 0) return null;
  const t = await getTranslations();

  return (
    <section className="flex flex-col gap-3" data-testid="dashboard-module-grid">
      <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
        {t("auth.dashboard.myZone.actionsHeading")}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {modules.map((m) => (
          <ActionCard
            key={m.id}
            href={m.route}
            testid={`dashboard-module-${m.id}`}
            icon={ICONS[m.iconKey]}
            badgeCount={m.badgeCount}
            title={t(m.labelKey)}
            description={t(m.descriptionKey)}
          />
        ))}
      </div>
    </section>
  );
}
