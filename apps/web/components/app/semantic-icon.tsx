import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Building2,
  CalendarDays,
  CircleDashed,
  CircleHelp,
  Clock3,
  FileSearch,
  FolderKanban,
  Hammer,
  History,
  Home,
  MapPin,
  NotebookPen,
  Radio,
  ScrollText,
  User,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/**
 * THE SEMANTIC ICON VOCABULARY — one concept, one glyph, everywhere
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §AE).
 *
 * A visual-first product communicates through shape before words, and that
 * only works when a shape means the SAME thing on every surface. This module
 * is the one place a product CONCEPT is bound to a glyph, exactly as
 * `role-icon.tsx` binds a role and `today/skill-icon.tsx` a skill group. A
 * surface asks for a concept, never for a lucide name, so the vocabulary can
 * be corrected in one place and no surface can drift into a decorative icon.
 *
 * Every mount carries an accessible label (`label`) — the icon is never the
 * only carrier of meaning (constitution §AP): the caller passes the localized
 * word, and the glyph is `aria-hidden` while the word lives in the DOM.
 *
 * No 'use client': pure presentation, usable from server and client alike.
 */
export const SEMANTIC_CONCEPTS = [
  "person",
  "work",
  "object",
  "project",
  "time",
  "calendar",
  "journal",
  "team",
  "company",
  "evidence",
  "confirmed",
  "unconfirmed",
  "unknown",
  "historical",
  "current",
  "remote",
  "location",
  "money",
  "warning",
  "source",
] as const;
export type SemanticConcept = (typeof SEMANTIC_CONCEPTS)[number];

const GLYPH: Record<SemanticConcept, LucideIcon> = {
  person: User,
  work: Hammer,
  object: MapPin,
  project: FolderKanban,
  time: Clock3,
  calendar: CalendarDays,
  journal: NotebookPen,
  team: UsersRound,
  company: Building2,
  evidence: ScrollText,
  confirmed: BadgeCheck,
  unconfirmed: CircleDashed,
  unknown: CircleHelp,
  historical: History,
  current: Radio,
  remote: Home,
  location: MapPin,
  money: Banknote,
  warning: AlertTriangle,
  source: FileSearch,
};

export function SemanticIcon({
  concept,
  label,
  className = "h-4 w-4",
  strokeWidth = 1.75,
}: {
  concept: SemanticConcept;
  /** The localized word the glyph stands for. Rendered for assistive
   *  technology; visually the glyph carries it. */
  label: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = GLYPH[concept];
  return (
    <>
      <Icon
        className={className}
        strokeWidth={strokeWidth}
        aria-hidden
        data-semantic-icon={concept}
      />
      <span className="sr-only">{label}</span>
    </>
  );
}
