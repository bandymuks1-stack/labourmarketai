import { getTranslations } from "next-intl/server";
import { ChevronRight, FolderKanban, UserSearch } from "lucide-react";

import { iconControl } from "@/components/app/conversation/chat/icon-scale";
import { NavLinkPending } from "@/components/app/nav-link-pending";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { Link } from "@/lib/i18n/navigation";
import { routeIsAdmitted } from "@/lib/navigation/home-goals";
import { loadGoalAdmission } from "@/lib/navigation/home-goals-server";
import { resolveDemandTitle } from "@/lib/demand/sanitize-demand-title";
import { listManagedProjects } from "@/lib/projects/projects";
import { listCompanyDemands } from "@/lib/scouting/scouting";

/** How many of each the home lists; the rest is one tap away on the area page. */
export const QUICK_ACCESS_LIMIT = 3;

const PROJECTS_HREF = "/dashboard/projects";
const NEEDS_HREF = "/dashboard/company/needs";
/** The Needs door's own readback of what the organization already asked for
 *  (`DemandRequestsReadback`) — not the intake section above it. */
const NEEDS_LIST_HREF = `${NEEDS_HREF}#demand-readback-title`;

const ROW =
  "flex min-h-11 items-center gap-2 rounded-lg px-2 text-support text-text-primary outline-none transition-colors duration-150 hover:bg-ink-700/60 focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:transition-none";

/**
 * QUICK ACCESS — pick up where the organization left off (owner P0 No. 1,
 * step 3, 2026-11-12): its active projects and its open needs, by name, one
 * tap from the home.
 *
 * NOTHING NEW IS STORED, AND ONE QUERY IS ADDED. The needs are
 * `listCompanyDemands()` — the organization's labour needs the home ALREADY
 * reads for its opening brief (request-cached, so this costs no query); an
 * agency's own offers are not needs and are not in that list (SEP-4). The
 * projects are `listManagedProjects({ activeOnly: true })` — the Projects
 * page's own reader, working bucket only, kept to the ACTIVE workspace's
 * organization: the one query this block adds to an organization home
 * (`lib/perf/dashboard-render-request-count.test.ts` pins the count). A
 * project links to its own page; a need links to the Needs door's list (there
 * is no page per need). Each list shows at most `QUICK_ACCESS_LIMIT` rows.
 *
 * HONEST WHEN THERE IS NOTHING TO SAY: a list with no open rows is absent,
 * and so is one whose read failed (both readers answer an empty list then) —
 * this block never states "no projects" on a read it could not make (SEP-7);
 * the area page names its own failure. The whole block is absent when both
 * lists are.
 *
 * Open conversations are not listed here: the header's Messages item, with
 * its unread count, is already one action away on every screen.
 *
 * A row is a presentation, never a permission: each list is drawn only when
 * the layout's gate admits the person to its area, and every page re-checks
 * its own rights under RLS.
 */
export async function HomeQuickAccess() {
  const [t, tReadback, admission, workspace] = await Promise.all([
    getTranslations("homeGoals.quick"),
    getTranslations("demandReadback"),
    loadGoalAdmission(),
    getWorkspaceContext(),
  ]);
  const organizationId =
    workspace.workspaces.find((w) => w.kind === "organization" && w.id === workspace.activeWorkspaceId)?.id ?? null;
  if (!organizationId) return null;

  const [projects, needs] = await Promise.all([
    routeIsAdmitted(PROJECTS_HREF, admission) ? loadActiveProjects(organizationId) : [],
    routeIsAdmitted(NEEDS_HREF, admission) ? loadOpenNeeds() : [],
  ]);
  if (projects.length === 0 && needs.length === 0) return null;

  return (
    <section aria-label={t("title")} data-testid="home-quick-access" className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold text-text-primary sm:text-xl">{t("title")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {projects.length > 0 && (
          <QuickList
            testId="home-quick-projects"
            heading={t("projects")}
            icon={<FolderKanban {...iconControl("text-text-secondary")} aria-hidden />}
            rows={projects.map((p) => ({
              key: p.id,
              href: `${PROJECTS_HREF}/${p.id}`,
              label: p.title ?? t("untitledProject"),
            }))}
            allHref={PROJECTS_HREF}
            allLabel={t("allProjects")}
          />
        )}
        {needs.length > 0 && (
          <QuickList
            testId="home-quick-needs"
            heading={t("needs")}
            icon={<UserSearch {...iconControl("text-text-secondary")} aria-hidden />}
            // A need saved without a role carries a stored English stand-in
            // title; the readback's own resolver shows the localized one and
            // leaves the person's own words untouched.
            rows={needs.map((n) => ({
              key: n.id,
              href: NEEDS_LIST_HREF,
              label: resolveDemandTitle(n.title, {
                hiringWorkers: tReadback("syntheticTitle.hiringWorkers"),
                agencyPartnership: tReadback("syntheticTitle.agencyPartnership"),
              }),
            }))}
            allHref={NEEDS_LIST_HREF}
            allLabel={t("allNeeds")}
          />
        )}
      </div>
    </section>
  );
}

function QuickList({
  testId,
  heading,
  icon,
  rows,
  allHref,
  allLabel,
}: {
  testId: string;
  heading: string;
  icon: React.ReactNode;
  rows: readonly { key: string; href: string; label: string }[];
  allHref: string;
  allLabel: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col gap-1 rounded-2xl border border-ink-600 bg-ink-900/60 p-2">
      <h3 className="flex items-center gap-2 px-2 pt-1 text-meta font-medium text-text-muted">
        {icon}
        {heading}
      </h3>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.key}>
            <Link href={row.href as "/dashboard"} className={ROW} data-testid={`${testId}-row`}>
              {/* The person's own words (a project or need title): shown as
                  written, truncated, never translated or interpreted. */}
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <NavLinkPending />
              <ChevronRight {...iconControl("flex-none text-text-muted")} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={allHref as "/dashboard"}
        data-testid={`${testId}-all`}
        className={`${ROW} text-text-secondary`}
      >
        <span className="flex-1">{allLabel}</span>
        <NavLinkPending />
      </Link>
    </div>
  );
}

/** The active workspace's working projects, newest first. A failed read
 *  answers nothing (the reader's own contract), so nothing is claimed. */
async function loadActiveProjects(organizationId: string) {
  try {
    // The organization is part of the QUERY (before the reader's page
    // limit), so another organization's newer projects cannot crowd these out.
    const all = await listManagedProjects({ activeOnly: true, organizationId });
    return all.filter((p) => p.status !== "completed").slice(0, QUICK_ACCESS_LIMIT);
  } catch {
    return [];
  }
}

/** The organization's labour needs that are still open, newest first — the
 *  request-cached list the home's opening brief already read. */
async function loadOpenNeeds() {
  try {
    return (await listCompanyDemands())
      .filter((r) => r.status !== "closed" && r.title.trim() !== "")
      .slice(0, QUICK_ACCESS_LIMIT);
  } catch {
    return [];
  }
}
