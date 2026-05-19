/** Single source of truth for site identity and navigation. */

export const site = {
  name: "labourmarket.ai",
  wordmark: "labourmarket",
  domainTld: ".ai",
  tagline: "The labour market as a living system",
  description:
    "labourmarket.ai turns people, companies, roles and matching into one connected, visual system — every participant represented by a single reusable player card.",
} as const;

export interface NavItem {
  href: string;
  label: string;
  hint: string;
}

/** The /app workspace navigation. One item per canonical concern. */
export const appNav: NavItem[] = [
  { href: "/app", label: "Overview", hint: "Your snapshot" },
  { href: "/app/profile", label: "Profile", hint: "Your one profile" },
  { href: "/app/discover", label: "Discover", hint: "The draft floor" },
  { href: "/app/matches", label: "Matches", hint: "Signal-ranked fit" },
  { href: "/app/company", label: "Company", hint: "Company profile" },
  { href: "/app/hiring-needs", label: "Hiring needs", hint: "Open roles" },
  { href: "/app/communication", label: "Communication", hint: "Start a thread" },
  { href: "/app/settings", label: "Settings", hint: "Account & providers" },
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Console", hint: "Operational directory" },
];

/** Landing-page primary calls to action. */
export const landingCtas = [
  { href: "/register", label: "Create profile", kind: "primary" as const },
  { href: "/app/discover", label: "Find workers", kind: "ghost" as const },
  { href: "/app/matches", label: "Explore matches", kind: "ghost" as const },
];
