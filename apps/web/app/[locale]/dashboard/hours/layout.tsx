import { dashboardPageMetadata } from "@/lib/navigation/dashboard-metadata";

/**
 * Metadata-only segment layout: names /dashboard/hours in the document title
 * (WCAG 2.4.2) without editing page.tsx, which sits under the owner's scoped
 * product-gate waiver `work-hours-allocation-surface` (owner 2026-10-26: fix
 * the title with a separate minimal change, never by widening a waiver).
 * Renders its children unchanged.
 */
export const generateMetadata = dashboardPageMetadata("/dashboard/hours", "workHours.title");

export default function HoursTitleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
