/** Single source of truth for site identity and navigation. */

export const site = {
  name: "labourmarket.ai",
  wordmark: "labourmarket",
  domainTld: ".ai",
  tagline: "Find work. Find workers. Faster.",
  description:
    "Create your work profile, show your skills, and get discovered by companies hiring now. Hiring? Find suitable workers, compare who fits, and contact the right people faster.",
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
  {
    href: "/register",
    label: "Create your work profile",
    kind: "primary" as const,
  },
  {
    href: "/app/discover",
    label: "Find suitable workers",
    kind: "ghost" as const,
  },
  { href: "/app/matches", label: "Compare matches", kind: "ghost" as const },
];
