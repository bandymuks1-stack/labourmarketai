import {
  Briefcase,
  Building2,
  FileSignature,
  Handshake,
  UserSearch,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { PublicIntentIconKey } from "@/lib/navigation/public-intents";

/** One icon per public intent — shared by the desktop mega-menu and the
 *  mobile menu so the two never disagree about what an intent looks like. */
export const INTENT_ICONS: Record<PublicIntentIconKey, LucideIcon> = {
  briefcase: Briefcase,
  userSearch: UserSearch,
  wrench: Wrench,
  fileSignature: FileSignature,
  handshake: Handshake,
  building: Building2,
};

/** An intent with its labels already resolved on the server (the public shell
 *  ships a small message pick, so client components receive strings). */
export type RenderedIntent = {
  readonly id: string;
  readonly iconKey: PublicIntentIconKey;
  readonly title: string;
  /** The short name used where room is tight (the desktop intent bar). */
  readonly short: string;
  readonly description: string;
  readonly links: ReadonlyArray<{
    readonly id: string;
    readonly href: string;
    readonly label: string;
    readonly account: boolean;
  }>;
};

/**
 * The FIRST GROUP of the one navigation, where a shell has one: the places a
 * signed-in person returns to all day (home, journal, calendar, messages).
 * Plain links, shown before the goals in the bar and at the top of the menu.
 * The public shell passes none.
 */
export type NavLeadLink = {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  /** True for the page the person is on (`aria-current="page"`). */
  readonly current?: boolean;
};
