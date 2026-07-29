import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MapPin, MessageSquare, Users } from "lucide-react";

import type { ProjectMapCard } from "@/lib/projects/map";
import { CountUp } from "@/components/app/today/count-up";
import {
  WORKSPACE_ACCENT_DOT,
  WORKSPACE_PERSONAL_DOT,
} from "@/components/app/conversation/chat/workspace-chip";
import { workspaceAccentIndex } from "@/lib/company/organization-switch";

/**
 * Manager MAP (TASK 07 slice 2 — MAP → ARENA → DRAFT). The infrastructure
 * view: each project is an arena card with its REAL team size and one click
 * into the ARENA (operations board) — max 2 clicks from map to action
 * (DESIGN_SOUL §4). No score, no fake activity; a project with zero workers
 * shows a plain zero and points at the draft.
 */
export async function ProjectMap({
  projects,
  locale,
}: {
  projects: ProjectMapCard[];
  locale: string;
}) {
  const t = await getTranslations("projects.map");
  if (projects.length === 0) return null;

  // Workspace context (rebuild W6): a manager of SEVERAL organizations sees
  // which org each project belongs to — same deterministic accent hue as the
  // workspace chip. One org → no chip (nothing ambiguous to label).
  const distinctOrgs = new Set(projects.map((p) => p.organizationId ?? "—"));
  const showOrg = distinctOrgs.size > 1;

  return (
    <section className="flex flex-col gap-3" data-testid="project-map">
      <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("title")}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <li
            key={p.id}
            className="card-border glow-hover rise-in flex h-full flex-col gap-3 p-5"
          >
            {/* Card body → STADIONAS (the live project view, T07.3). */}
            <Link
              href={`/${locale}/dashboard/projects/${p.id}`}
              data-testid="project-stadium-link"
              className="flex flex-1 flex-col gap-3"
            >
              <span className="font-display text-lg font-semibold tracking-tightest text-text-primary">
                {p.title ?? t("untitled")}
              </span>
              {showOrg && p.orgName ? (
                <span
                  className="inline-flex items-center gap-1.5 text-meta text-text-muted"
                  data-testid={`project-org-context-${p.id}`}
                >
                  <span
                    className={`size-2 flex-none rounded-full ${
                      p.organizationId
                        ? WORKSPACE_ACCENT_DOT[
                            workspaceAccentIndex(p.organizationId) %
                              WORKSPACE_ACCENT_DOT.length
                          ]
                        : WORKSPACE_PERSONAL_DOT
                    }`}
                    aria-hidden
                  />
                  {p.orgName}
                </span>
              ) : null}
              {p.city ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-meta uppercase tracking-label text-text-muted">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {p.city}
                </span>
              ) : null}
              <span className="mt-auto flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-cyan" aria-hidden />
                <CountUp
                  text={String(p.assignedCount)}
                  className="font-mono text-2xl font-bold tracking-tightest text-text-primary"
                />
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("teamLabel")}
                </span>
              </span>
            </Link>
            {/* Project-scoped actions: open the project board + a clearly
                scoped communication entry (systemic-ux-project-v1). */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link
                href={`/${locale}/dashboard/projects/${p.id}/operations`}
                data-testid="project-operations-link"
                className="inline-flex min-h-8 w-fit items-center font-mono text-meta uppercase tracking-label text-brand-blue hover:underline"
              >
                {t("openArena")} →
              </Link>
              <Link
                href={`/${locale}/dashboard/communication`}
                data-testid="project-card-chat-cta"
                className="inline-flex min-h-8 w-fit items-center gap-1.5 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-brand-blue hover:underline"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                {t("chatCta")}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
