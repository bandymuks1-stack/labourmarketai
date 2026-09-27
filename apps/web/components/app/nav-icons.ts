import {
  CalendarDays,
  Home,
  IdCard,
  MapPin,
  MessageSquare,
  NotebookPen,
  Shield,
  Store,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { NavIconKey } from "@/lib/config/navigation";

/**
 * ONE ICON PER DESTINATION, for every nav surface that renders the catalogue.
 *
 * This map used to live inside `bottom-nav.tsx`. It moved here the moment a
 * SECOND surface — the one top bar (`conversation-header.tsx`) — had to render
 * the same core destinations: two private copies of "which icon means journal"
 * is how the phone bar and the top bar start disagreeing about the same place.
 *
 * The config carries only the icon ID (`NavIconKey`); lucide is a presentation
 * concern and stays out of it. Audit PR8's icon rule holds: journal =
 * NotebookPen, messages = MessageSquare, map = MapPin, calendar = CalendarDays
 * — the same icons the MyZone action grid uses, so the nav and the grid speak
 * one visual language. FileText stays reserved for documents.
 */
export const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  home: Home,
  store: Store,
  map: MapPin,
  idCard: IdCard,
  journal: NotebookPen,
  messages: MessageSquare,
  calendar: CalendarDays,
  network: Users,
  user: User,
  shield: Shield,
};
