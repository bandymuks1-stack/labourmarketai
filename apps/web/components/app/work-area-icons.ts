import {
  Activity,
  BarChart3,
  Briefcase,
  CalendarDays,
  ChartNoAxesColumn,
  Compass,
  FolderKanban,
  Gauge,
  Handshake,
  History,
  IdCard,
  Images,
  MessageSquare,
  NotebookPen,
  Package,
  Store,
  UserRound,
  UserSearch,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { WorkAreaIconKey } from "@/lib/navigation/work-areas";

/**
 * ONE ICON PER WORK AREA — the area model carries only the icon id; lucide is
 * a presentation concern and lives here. Shared destinations keep the nav's
 * icons (`components/app/nav-icons.ts`): journal = NotebookPen, messages =
 * MessageSquare, calendar = CalendarDays.
 */
export const WORK_AREA_ICONS: Record<WorkAreaIconKey, LucideIcon> = {
  compass: Compass,
  journal: NotebookPen,
  chart: ChartNoAxesColumn,
  user: UserRound,
  idCard: IdCard,
  images: Images,
  userSearch: UserSearch,
  package: Package,
  store: Store,
  users: UsersRound,
  folder: FolderKanban,
  messages: MessageSquare,
  handshake: Handshake,
  briefcase: Briefcase,
  calendar: CalendarDays,
  gauge: Gauge,
  activity: Activity,
  barChart: BarChart3,
  history: History,
};
