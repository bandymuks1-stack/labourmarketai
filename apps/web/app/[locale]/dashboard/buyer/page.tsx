import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { OrgTier1Warning } from "@/components/app/org-tier1-warning";
import { PilotDraftForm } from "@/components/app/pilot-draft-form";
import { Tier2ReadinessExplainer } from "@/components/app/tier2-readiness-explainer";
import { BuyerRequestsSection } from "@/components/app/buyer-requests-section";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { getPilotDraft } from "@/lib/pilot/pilot-drafts";
import { getOwnCustomer } from "@/lib/buyer/customers";
import { listOwnCustomerRequests } from "@/lib/buyer/customer-requests";
import { listOwnAttachments } from "@/lib/buyer/customer-request-attachments";

const BUYER_FIELDS = [
  { key: "serviceType" as const, labelKey: "field.serviceType.label", placeholderKey: "field.serviceType.placeholder", variant: "text" as const },
  { key: "location" as const, labelKey: "field.location.label", placeholderKey: "field.location.placeholder", variant: "text" as const },
  { key: "timing" as const, labelKey: "field.timing.label", placeholderKey: "field.timing.placeholder", variant: "text" as const },
  { key: "budget" as const, labelKey: "field.budget.label", placeholderKey: "field.budget.placeholder", variant: "text" as const },
  { key: "notes" as const, labelKey: "field.notes.label", placeholderKey: "field.notes.placeholder", variant: "textarea" as const },
];

export default async function BuyerDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "customer");

  const t = await getTranslations("roleDashboards.buyer");
  const tSetup = await getTranslations("roleDashboards.buyer.setup");
  const tRequests = await getTranslations("roleDashboards.buyer.requests");
  const existingDraft = await getPilotDraft("buyer_request");
  const customerRead = await getOwnCustomer();
  const customer = customerRead.kind === "ok" ? customerRead.row : null;
  const migrationNeeded = customerRead.kind === "needs-migration";
  const requestsResult = await listOwnCustomerRequests();
  const attachmentsResultRaw = await listOwnAttachments();
  type AttachmentItemDto = {
    id: string;
    requestId: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    analysisStatus: string;
    createdAt: string;
  };
  type AttachmentsState =
    | { kind: "ok"; rows: readonly AttachmentItemDto[] }
    | { kind: "needs-migration"; rows: readonly AttachmentItemDto[] }
    | { kind: "error"; rows: readonly AttachmentItemDto[]; message: string };
  const attachmentsResult: AttachmentsState =
    attachmentsResultRaw.kind === "ok"
      ? {
          kind: "ok",
          rows: attachmentsResultRaw.rows.map((a) => ({
            id: a.id,
            requestId: a.requestId,
            fileName: a.fileName,
            mimeType: a.mimeType,
            fileSizeBytes: a.fileSizeBytes,
            analysisStatus: a.analysisStatus,
            createdAt: a.createdAt,
          })),
        }
      : attachmentsResultRaw.kind === "needs-migration"
        ? { kind: "needs-migration", rows: [] }
        : { kind: "error", rows: [], message: attachmentsResultRaw.message };
  const tAttachments = await getTranslations(
    "roleDashboards.buyer.requests.attachments",
  );
  const tUnderstanding = await getTranslations(
    "roleDashboards.buyer.requests.understanding",
  );

  const requestsLabels = {
    heading: tRequests("heading"),
    subheading: tRequests("subheading"),
    newRequestHeading: tRequests("newRequestHeading"),
    newRequestSubtitle: tRequests("newRequestSubtitle"),
    fieldTitle: tRequests("fieldTitle"),
    fieldTitlePlaceholder: tRequests("fieldTitlePlaceholder"),
    fieldTitleHelp: tRequests("fieldTitleHelp"),
    fieldNeedSummary: tRequests("fieldNeedSummary"),
    fieldNeedSummaryPlaceholder: tRequests("fieldNeedSummaryPlaceholder"),
    fieldCountry: tRequests("fieldCountry"),
    fieldCountryPlaceholder: tRequests("fieldCountryPlaceholder"),
    fieldLocation: tRequests("fieldLocation"),
    fieldLocationPlaceholder: tRequests("fieldLocationPlaceholder"),
    fieldRole: tRequests("fieldRole"),
    fieldRolePlaceholder: tRequests("fieldRolePlaceholder"),
    fieldTeamSize: tRequests("fieldTeamSize"),
    fieldTeamSizePlaceholder: tRequests("fieldTeamSizePlaceholder"),
    fieldStartPeriod: tRequests("fieldStartPeriod"),
    fieldStartPeriodPlaceholder: tRequests("fieldStartPeriodPlaceholder"),
    fieldDuration: tRequests("fieldDuration"),
    fieldDurationPlaceholder: tRequests("fieldDurationPlaceholder"),
    fieldLanguage: tRequests("fieldLanguage"),
    fieldLanguagePlaceholder: tRequests("fieldLanguagePlaceholder"),
    fieldNotes: tRequests("fieldNotes"),
    fieldNotesPlaceholder: tRequests("fieldNotesPlaceholder"),
    statusLabel: tRequests("statusLabel"),
    statusDraft: tRequests("statusDraft"),
    statusSubmitted: tRequests("statusSubmitted"),
    statusHelp: tRequests("statusHelp"),
    submit: tRequests("submit"),
    resultSaved: tRequests("resultSaved"),
    resultNeedsMigration: tRequests("resultNeedsMigration"),
    resultInvalid: tRequests("resultInvalid"),
    resultError: tRequests("resultError"),
    listHeading: tRequests("listHeading"),
    emptyStateHeading: tRequests("emptyStateHeading"),
    emptyStateBody: tRequests("emptyStateBody"),
    columnTitle: tRequests("columnTitle"),
    columnStatus: tRequests("columnStatus"),
    columnUpdated: tRequests("columnUpdated"),
    manualReviewBanner: tRequests("manualReviewBanner"),
    migrationBlockerHeading: tRequests("migrationBlockerHeading"),
    migrationBlockerBody: tRequests("migrationBlockerBody"),
    attachmentsHeading: tAttachments("heading"),
    attachmentsEmpty: tAttachments("empty"),
    attachmentsMigrationBlocker: tAttachments("migrationBlocker"),
    attachmentsAnalysisFallback: tAttachments("analysisFallback"),
    attachmentsUploader: {
      addButton: tAttachments("addButton"),
      uploadingLabel: tAttachments("uploadingLabel"),
      successLabel: tAttachments("successLabel"),
      errorTooLarge: tAttachments("errorTooLarge"),
      errorBadType: tAttachments("errorBadType"),
      errorNeedsMigration: tAttachments("errorNeedsMigration"),
      errorGeneric: tAttachments("errorGeneric"),
      removeLabel: tAttachments("removeLabel"),
      removingLabel: tAttachments("removingLabel"),
      sizeHelp: tAttachments("sizeHelp"),
      allowedHelp: tAttachments("allowedHelp"),
    },
    understanding: {
      panelHeading: tUnderstanding("panelHeading"),
      basicsHeading: tUnderstanding("basicsHeading"),
      labelStatus: tUnderstanding("labelStatus"),
      labelCreated: tUnderstanding("labelCreated"),
      labelDescription: tUnderstanding("labelDescription"),
      noDescription: tUnderstanding("noDescription"),
      readinessHeading: tUnderstanding("readinessHeading"),
      readinessStatus: {
        no_files: tUnderstanding("readinessStatus.no_files"),
        files_added: tUnderstanding("readinessStatus.files_added"),
        enough_for_manual_review: tUnderstanding(
          "readinessStatus.enough_for_manual_review",
        ),
        needs_more_info: tUnderstanding("readinessStatus.needs_more_info"),
      },
      honestMessage: tUnderstanding("honestMessage"),
      nextActionHeading: tUnderstanding("nextActionHeading"),
      nextAction: {
        add_first_file: tUnderstanding("nextAction.add_first_file"),
        add_more_project_details: tUnderstanding(
          "nextAction.add_more_project_details",
        ),
        administrator_will_review: tUnderstanding(
          "nextAction.administrator_will_review",
        ),
      },
      filesHeading: tUnderstanding("filesHeading"),
      analysisStatusLabel: tUnderstanding("analysisStatusLabel"),
      analysisNotStarted: tUnderstanding("analysisNotStarted"),
      fileReviewChip: tUnderstanding("fileReviewChip"),
      requestStatus: {
        draft: tUnderstanding("requestStatus.draft"),
        submitted: tUnderstanding("requestStatus.submitted"),
        in_review: tUnderstanding("requestStatus.in_review"),
        needs_followup: tUnderstanding("requestStatus.needs_followup"),
        approved: tUnderstanding("requestStatus.approved"),
        closed: tUnderstanding("requestStatus.closed"),
      },
    },
  };

  return (
    <div className="flex flex-col gap-6" data-testid="buyer-dashboard">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      <section
        className="card-border flex flex-col gap-2 p-4"
        data-testid="buyer-dashboard-pilot-disclaimer"
      >
        <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
          PILOT
        </p>
        <p className="text-sm text-text-secondary">{t("pilotDisclaimer")}</p>
      </section>

      <OrgTier1Warning />

      {customer ? (
        <section
          className="card-border flex flex-col gap-3 p-5"
          data-testid="buyer-dashboard-customer-state"
        >
          <header className="flex items-center gap-2">
            <span className="rounded bg-state-success/20 px-2 py-0.5 text-xs text-state-success">
              ✓
            </span>
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {tSetup("existingHeading")}
            </h2>
          </header>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">{tSetup("contactName")}</dt>
              <dd className="text-text-primary">{customer.contactName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{tSetup("customerType")}</dt>
              <dd className="text-text-primary">
                {tSetup(`customerTypeOptions.${customer.customerType}`)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{tSetup("country")}</dt>
              <dd className="text-text-primary">{customer.country ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{tSetup("market")}</dt>
              <dd className="text-text-primary">{customer.market ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{tSetup("contactPreference")}</dt>
              <dd className="text-text-primary">
                {tSetup(`contactPreferenceOptions.${customer.contactPreference}`)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{tSetup("reviewStatus")}</dt>
              <dd className="text-text-primary">{customer.reviewStatus}</dd>
            </div>
          </dl>
          <Link
            href={"/dashboard/start/buyer" as "/dashboard"}
            className="self-start text-sm text-brand-blue hover:underline"
            data-testid="buyer-dashboard-edit-setup"
          >
            ← {tSetup("formTitle")}
          </Link>
        </section>
      ) : migrationNeeded ? (
        <section
          className="card-border flex flex-col gap-2 p-5"
          data-testid="buyer-dashboard-migration-blocker"
        >
          <header className="flex items-center gap-2">
            <span className="rounded bg-state-warning/20 px-2 py-0.5 text-xs text-state-warning">
              blokuota
            </span>
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {tSetup("migrationBlockerHeading")}
            </h2>
          </header>
          <p className="text-sm text-text-secondary">
            {tSetup("migrationBlockerBody")}
          </p>
        </section>
      ) : (
        <section
          className="card-border flex flex-col gap-2 p-5"
          data-testid="buyer-dashboard-no-customer-yet"
        >
          <p className="text-sm text-text-secondary">
            {tSetup("formSubtitle")}
          </p>
          <Link
            href={"/dashboard/start/buyer" as "/dashboard"}
            className="self-start text-sm text-brand-blue hover:underline"
            data-testid="buyer-dashboard-goto-setup"
          >
            {tSetup("submit")} →
          </Link>
        </section>
      )}

      <Tier2ReadinessExplainer
        source="dashboard_buyer_tier2_readiness"
        testId="buyer-dashboard-tier2-readiness"
      />

      <BuyerRequestsSection
        listResult={requestsResult}
        attachmentsResult={attachmentsResult}
        labels={requestsLabels}
      />

      <section
        className="card-border flex flex-col gap-4 p-5"
        data-testid="buyer-dashboard-first-action"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t("firstAction.title")}
          </h2>
          <p className="text-sm text-text-secondary">
            {t("firstAction.body")}
          </p>
        </header>
        <PilotDraftForm
          draftType="buyer_request"
          fields={BUYER_FIELDS}
          i18nNamespace="roleDashboards.buyer.draftForm"
          initialDraft={existingDraft}
        />
      </section>

      <Link
        href="/dashboard/profile"
        className="self-start text-sm text-brand-blue hover:underline"
        data-testid="buyer-dashboard-profile-link"
      >
        {t("profileLink")} →
      </Link>
    </div>
  );
}
