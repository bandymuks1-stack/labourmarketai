import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { readHeldProfileRoles } from "@/lib/auth/profile-roles";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { workspaceOpensCompanySpace } from "@/lib/company/organization-authority";
import { CompanyActionNextActions } from "@/components/app/company-action-next-actions";
import { listOwnCandidateDrafts } from "@/lib/candidates/candidate-drafts";
import { CANDIDATE_DRAFT_STATUSES, type CandidateDraftStatus } from "@/lib/candidates/candidate-draft-types";
import {
  CandidateDraftsManager,
  type CandidateDraftsLabels,
} from "@/components/app/candidate-drafts-manager";

export const dynamic = "force-dynamic";

/**
 * Candidate / provider drafts (slice candidate-provider-draft-v1).
 *
 * Any authenticated requester / manager keeps their OWN private drafts of
 * unregistered people/providers (owner-scoped by RLS). A draft is never an
 * account; it is honestly labelled and cannot be assigned until linked.
 */
export default async function CandidatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("candidates");
  const tRooms = await getTranslations("companyActionRooms");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const read = await listOwnCandidateDrafts();

  // WHO IS LOOKING. The drafts are private to their author whatever the role
  // (RLS: owner_id = auth.uid()), so the page stays open to everyone who can
  // sign in. But the shell and the primary action below are the COMPANY hiring
  // room: a worker who followed the role-choice link was told "Įmonė · Samdyti"
  // and offered a button to /dashboard/company/scouting, which then bounces
  // them (owner audit 2026-10-02). Without the company space the page is just
  // the private list, under its own neutral title.
  // An unanswered role read is NOT "no company role": it keeps the company
  // shell this page always had instead of silently demoting a real manager.
  const held = await readHeldProfileRoles({ supabase, userId: user.id });
  const heldRoles = new Set<string>(held.ok ? held.value : ["company"]);
  const inCompanySpace =
    heldRoles.has("company") || workspaceOpensCompanySpace(await getWorkspaceContext());

  const labels: CandidateDraftsLabels = {
    eyebrow: t("eyebrow"),
    title: t("title"),
    intro: t("intro"),
    honestyNote: t("honestyNote"),
    labelNotRegistered: t("labels.notRegistered"),
    labelNotVerified: t("labels.notVerified"),
    labelDraft: t("labels.draft"),
    labelCanLinkLater: t("labels.canLinkLater"),
    linkedNote: t("labels.linked"),
    notAssignableNote: t("notAssignableNote"),
    createTitle: t("create.title"),
    nameLabel: t("create.nameLabel"),
    namePlaceholder: t("create.namePlaceholder"),
    contactLabel: t("create.contactLabel"),
    contactPlaceholder: t("create.contactPlaceholder"),
    professionLabel: t("create.professionLabel"),
    professionPlaceholder: t("create.professionPlaceholder"),
    languageLabel: t("create.languageLabel"),
    languagePlaceholder: t("create.languagePlaceholder"),
    skillsLabel: t("create.skillsLabel"),
    skillsPlaceholder: t("create.skillsPlaceholder"),
    notesLabel: t("create.notesLabel"),
    notesPlaceholder: t("create.notesPlaceholder"),
    statusLabel: t("create.statusLabel"),
    create: t("create.submit"),
    creating: t("create.submitting"),
    listTitle: t("listTitle"),
    empty: t("empty"),
    save: t("save"),
    saving: t("saving"),
    delete: t("delete"),
    saved: t("saved"),
    saveError: t("saveError"),
    needsMigration: t("needsMigration"),
    statusLabels: Object.fromEntries(
      CANDIDATE_DRAFT_STATUSES.map((s) => [s, t(`statuses.${s}`)]),
    ) as Record<CandidateDraftStatus, string>,
  };

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      {/* Company action framing: this is the "Hire" action under the company
          identity, not a separate system. */}
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="self-start text-xs font-medium text-brand-blue transition-colors hover:underline"
          data-testid="back-to-action-center"
        >
          ← {tRooms("backToActions")}
        </Link>
        <p
          className="font-mono text-meta uppercase tracking-label text-brand-orange"
          data-testid="company-context"
        >
          {inCompanySpace ? tRooms("candidates.context") : t("eyebrow")}
        </p>
      </div>

      {inCompanySpace ? (
        <CompanyActionNextActions room="candidates" primaryHref="/dashboard/company/scouting" />
      ) : null}

      <CandidateDraftsManager
        drafts={read.kind === "ok" ? read.drafts : []}
        labels={labels}
        needsMigration={read.kind === "needs-migration"}
      />
    </div>
  );
}
