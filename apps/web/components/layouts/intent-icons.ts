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
