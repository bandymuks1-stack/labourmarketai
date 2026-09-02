import { setRequestLocale, getTranslations } from "next-intl/server";
import type { CredentialValidityState } from "@/lib/documents/credential-validity";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DOCUMENT_COUNTRIES,
  DOCUMENTS_READINESS_ENABLED,
} from "@/lib/config/documents";
import {
  computeCountryReadiness,
  type DerivedDocumentStatus,
} from "@/lib/documents/readiness";
import {
  getOrgDocumentCentre,
  getWorkerDocumentCentre,
  type WorkProofSummary,
} from "@/lib/documents/document-centre";
import {
  DOC_CENTRE_INVENTORY_ANCHOR,
  DOCUMENT_STATUS_FILTERS,
  canRequestVerification,
  filterCentreDocuments,
  inventoryHref,
  parseInventoryFilters,
  type DocumentVerificationState,
} from "@/lib/documents/document-centre-model";
import { WorkerDocumentVerifyRequestButton } from "@/components/app/worker-document-verify-request-button";
import { WorkerDocumentFileSlot } from "@/components/app/worker-document-file-slot";
import { DocumentJournalDraftReview } from "@/components/app/document-journal-draft-review";
import { DocumentAckInbox } from "@/components/app/document-ack-inbox";
import { OrgDocumentsRegister } from "@/components/app/org-documents-register";
import { TrainingRegister } from "@/components/app/training-register";
import { getWorkerDocumentFiles } from "@/lib/documents/document-files";
import { parseOrgRegisterFilters } from "@/lib/documents/document-file-model";
import { getDocsConsent } from "@/lib/documents/consent-actions";
import { DocsConsentToggle } from "@/components/app/docs-consent-toggle";
import { WorkerDocumentForm } from "@/components/app/worker-document-form";
import { LtDocumentGuidance } from "@/components/app/lt-document-guidance";
import { HashScrollOnLoad } from "@/components/app/hash-scroll-on-load";
import {
  workerReadinessFromChecklist,
  type WorkerCountryReadinessStatus,
} from "@/lib/readiness/worker-readiness";
import type { Role } from "@/lib/auth/actions";

/**
 * "Mano dokumentai" — the document & work-proof centre (control room PR H,
 * gap map §8) on top of the S3 inventory + country readiness surface.
 * UI: TASK 07 final skin (living-arena tokens — arena eyebrow, card glow,
 * rise-in; logic unchanged).
 *
 * Composition only — the page consolidates the EXISTING axes (worker
 * document readiness + verification, CV / evidence / journal exports,
 * journal photo evidence) into one discoverable centre. No second store,
 * no new table, no bucket: file upload does NOT exist yet and the page says
 * so instead of pretending (metadata inventory only).
 *
 * Honest by construction: while DOCUMENTS_READINESS_ENABLED is false the
 * inventory is an open RUOŠIAMA roadmap note (doctrine §18) — no fake
 * content — while the work-proof exports (real today) stay reachable.
 * When live: statuses are the worker's own input + date arithmetic shown
 * VERBATIM, verification is the stored admin decision shown VERBATIM (and
 * hidden entirely where the axis is not readable), the legal disclaimer is
 * always visible, and an uncurated country says so instead of pretending
 * readiness. Org sessions see ONLY the s6 consent-gated aggregates (counts)
 * or an honest note — never another worker's document rows.
 */

const STATUS_TONE: Record<DerivedDocumentStatus, string> = {
  missing: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  ready: "border-state-success/40 bg-state-success/5 text-state-success",
  expiring: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  blocked: "border-state-warning/60 bg-state-warning/10 text-state-warning",
};

const VERIFICATION_TONE: Record<DocumentVerificationState, string> = {
  unverified: "border-ink-500 bg-ink-800/40 text-text-muted",
  pending: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  verified: "border-state-success/40 bg-state-success/5 text-state-success",
  rejected: "border-state-warning/60 bg-state-warning/10 text-state-warning",
};

/** Train E1 — current-validity tones. Same palette as the other badges;
 *  revoked is the only danger tone: a credential that WAS valid and is not. */
const VALIDITY_TONE: Record<CredentialValidityState, string> = {
  active: "border-state-success/40 bg-state-success/5 text-state-success",
  expired: "border-state-warning/60 bg-state-warning/10 text-state-warning",
  revoked: "border-state-danger/50 bg-state-danger/10 text-state-danger",
  pending: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  rejected: "border-state-warning/60 bg-state-warning/10 text-state-warning",
  unverified: "border-ink-500 bg-ink-800/40 text-text-muted",
  unknown: "border-ink-500 bg-ink-800/40 text-text-muted",
};

const OVERALL_TONE: Record<WorkerCountryReadinessStatus, string> = {
  not_enough_information: "border-ink-500 bg-ink-800/40 text-text-muted",
  missing_documents: "border-state-warning/50 bg-state-warning/10 text-state-warning",
  needs_verification: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  almost_ready: "border-state-amber/50 bg-state-amber/10 text-state-amber",
  ready_for_country: "border-state-success/50 bg-state-success/10 text-state-success",
};

const CHIP_BASE =
  "inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 font-mono text-meta uppercase tracking-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const CHIP_ACTIVE = "border-brand-blue text-brand-blue";
const CHIP_IDLE = "border-ink-500 text-text-secondary hover:border-brand-blue";

const ORG_ROLES = new Set<Role>(["company", "agency"]);

/** The honest `?docNotice=` vocabulary the document-file actions redirect
 *  with — an unknown value renders nothing (never an error surface). */
const DOC_NOTICE_SUCCESS = new Set([
  "uploaded",
  "created",
  "archived",
  "revoked",
  "assigned",
  "acknowledged",
  // Register delta v1 outcomes.
  "updated",
  "submitted",
  "repaired_approved",
]);
const DOC_NOTICE_WARN = new Set([
  "unchanged",
  "repaired_returned",
  "no_pending_workflow",
  "no_approval_definition",
  "invalid",
  "invalid_state",
  "invalid_assignee",
  "already_assigned",
  "already_acknowledged",
  "not_current",
  "not_allowed",
  "not_found",
  "limit_reached",
  "version_limit_reached",
  "path_mismatch",
  "file_too_large",
  "unsupported_type",
  "needs_migration",
  "error",
]);

function DocNoticeBanner({
  notice,
  tf,
}: {
  notice: string | undefined;
  tf: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (!notice) return null;
  const success = DOC_NOTICE_SUCCESS.has(notice);
  if (!success && !DOC_NOTICE_WARN.has(notice)) return null;
  return (
    <p
      role="status"
      className={`rounded-md border px-3 py-2 text-sm ${
        success
          ? "border-state-success/40 bg-state-success/5 text-state-success"
          : "border-state-warning/50 bg-state-warning/10 text-state-warning"
      }`}
      data-testid="doc-notice"
      data-notice={notice}
    >
      {tf(`notice.${notice}` as never)}
    </p>
  );
}

export default async function WorkerDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    country?: string;
    type?: string;
    status?: string;
    docNotice?: string;
    /* Org register (delta v1) filter axes — searchParams only, no route. */
    regStatus?: string;
    regDirection?: string;
    regObject?: string;
    regRetention?: string;
    regQ?: string;
    /** C2b — document → journal draft review (searchParams only, no route). */
    draftFrom?: string;
    /** Training & Certification v1 outcome notice (closed vocabulary,
     *  validated inside the section — never rendered raw). */
    trn?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("documents");
  const tc = await getTranslations("documentCentre");
  const tf = await getTranslations("documentFiles");

  // Role branch (page-level active_role read, the overview's pattern): org
  // sessions get the consent-gated aggregate view — a worker document row
  // is owner-only by RLS and is never rendered to an org session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let activeRole: Role | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_role")
      .eq("id", user.id)
      .single();
    activeRole = (profile?.active_role as Role | null) ?? null;
  }

  const sp = await searchParams;

  if (activeRole && ORG_ROLES.has(activeRole)) {
    const org = await getOrgDocumentCentre();
    return (
      <div className="flex flex-col gap-6" data-testid="documents-page">
        <Header t={t} />
        <DocNoticeBanner notice={sp.docNotice} tf={tf} />
        <section
          className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/30 p-4"
          data-testid="doc-centre-org"
        >
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {tc("org.title")}
          </h2>
          <p className="text-xs text-text-secondary">{tc("org.intro")}</p>
          {org.kind === "unavailable" ? (
            <p
              className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
              data-testid="doc-centre-org-unavailable"
            >
              {tc("org.unavailable")}
            </p>
          ) : org.summary.workers === 0 ? (
            <p
              className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
              data-testid="doc-centre-org-empty"
            >
              {tc("org.noConsented")}
            </p>
          ) : (
            <>
              <dl
                className="grid grid-cols-2 gap-2 sm:grid-cols-5"
                data-testid="doc-centre-org-summary"
              >
                {(
                  [
                    ["workersLabel", org.summary.workers],
                    ["totalLabel", org.summary.total],
                    ["validLabel", org.summary.valid],
                    ["expiringLabel", org.summary.expiring],
                    ["attentionLabel", org.summary.attention],
                  ] as const
                ).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex flex-col gap-0.5 rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2"
                  >
                    <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {tc(`org.${key}`)}
                    </dt>
                    <dd className="font-display text-lg font-semibold text-text-primary">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-meta text-text-muted">
                {tc("org.consentNote")}
              </p>
            </>
          )}
          <Link
            href={"/dashboard/projects" as "/dashboard"}
            className="text-sm font-semibold text-brand-blue underline-offset-2 hover:underline"
            data-testid="doc-centre-org-project-link"
          >
            {tc("org.projectAxisLink")}
          </Link>
          <p className="text-meta text-text-muted">
            {tc("org.projectAxisNote")}
          </p>
        </section>
        {/* Document & Evidence Engine v1 — the org's OWN register (org-scope
            rows only; worker document rows stay owner-only by RLS) and the
            caller's own acknowledgement inbox. */}
        <OrgDocumentsRegister
          locale={locale}
          filters={parseOrgRegisterFilters(sp)}
        />
        <DocumentAckInbox locale={locale} />
        {/* Training & Certification v1 — programmes, assignments and the
            certificate register. The training MATERIAL is an org register
            document above, and confirming it was read stays the
            acknowledgement inbox's job — never duplicated here. */}
        <TrainingRegister locale={locale} notice={sp.trn} />
        {/* WAGON 9 — LT-master guidance stays informational for every role. */}
        <LtDocumentGuidance locale={locale} />
      </div>
    );
  }

  // The document centre and the docs-aggregate consent both resolve their own
  // worker from the session — neither reads the other's result — so they cost
  // one round trip instead of two. The consent read stays behind the readiness
  // constant so the disabled branch issues exactly the queries it issued
  // before (today the constant is `true`, so that arm is unreachable; guarding
  // it keeps this change semantics-preserving if it is ever flipped).
  const [centre, docsConsent] = await Promise.all([
    getWorkerDocumentCentre(),
    DOCUMENTS_READINESS_ENABLED ? getDocsConsent() : Promise.resolve(null),
  ]);

  if (!DOCUMENTS_READINESS_ENABLED) {
    return (
      <div className="flex flex-col gap-6" data-testid="documents-page">
        <Header t={t} />
        {/* Work-proof exports work independently of the document-storage
            layer — keep them available even while readiness is preparing. */}
        <WorkProofExports t={t} tc={tc} locale={locale} workProof={centre.workProof} />
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="documents-preparing"
        >
          {t("preparing")}
        </p>
        {/* WAGON 9 — LT-master guidance is static informational content,
            independent of the document-storage layer, so it renders in the
            preparing state too. */}
        <LtDocumentGuidance locale={locale} />
      </div>
    );
  }

  const country = (DOCUMENT_COUNTRIES as readonly string[]).includes(
    sp.country ?? "",
  )
    ? (sp.country as string)
    : null;

  const now = new Date();
  // S6 — the worker's documents-aggregate consent (null until the gated
  // draft is applied → honest needs-gate state inside the toggle). Read in
  // the batch above; nothing between here and there depends on it.

  const inv = centre.inventory;
  const filters =
    inv.kind === "ok"
      ? parseInventoryFilters(sp, inv.typeSlugs)
      : { type: null, status: null };
  const visibleDocuments =
    inv.kind === "ok" ? filterCentreDocuments(inv.documents, filters) : [];
  const ownedTypeSlugs =
    inv.kind === "ok"
      ? [...new Set(inv.documents.map((d) => d.documentTypeSlug))]
      : [];

  // Document & Evidence Engine v1 — the FILE layer state. `available` only
  // when the human-gated migration really answered here; otherwise the page
  // keeps its truthful no-upload note and renders no file controls.
  const fileState =
    inv.kind === "ok"
      ? await getWorkerDocumentFiles(inv.documents.map((d) => d.id))
      : ({ available: false } as const);

  return (
    <div className="flex flex-col gap-6" data-testid="documents-page">
      {/* `#training` is the return target of the training save action
          (`?trn=…#training`). Measured 2026-08-28: four seconds after that
          redirect `window.scrollY` was still 0 — the browser never acted on
          the hash. The link only looked alive while the section sat above the
          fold; now that the documents lead the page it has to actually work. */}
      <HashScrollOnLoad />
      <Header t={t} />
      <DocNoticeBanner notice={sp.docNotice} tf={tf} />

      {/* C2b — document → journal draft review. Mounted ONLY under
          ?draftFrom= (searchParams only, no route — this page's stated
          pattern); the seam re-answers ownership under the caller's RLS. */}
      {sp.draftFrom ? (
        <DocumentJournalDraftReview
          locale={locale}
          documentFileId={sp.draftFrom}
        />
      ) : null}

      {/* (a) Attention strip — counts of REAL field states only (derived
          valid_until status; stored verification), each resolving into the
          inventory below. Zero everywhere → one calm line, no fake urgency. */}
      {inv.kind === "ok" ? (
        <section
          className="flex flex-col gap-2"
          data-testid="doc-centre-attention"
          aria-label={tc("attention.title")}
        >
          {inv.attention.expiring === 0 &&
          inv.attention.missing === 0 &&
          inv.attention.reviewNeeded === 0 ? (
            <p
              className="rounded-md border border-state-success/30 bg-state-success/5 px-3 py-2 text-sm text-text-secondary"
              data-testid="doc-centre-attention-empty"
            >
              {tc("attention.empty")}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {inv.attention.expiring > 0 ? (
                  <Link
                    href={inventoryHref({ status: "expiring", country }) as "/dashboard"}
                    className={`${CHIP_BASE} border-state-warning/50 bg-state-warning/5 text-state-warning`}
                    data-testid="doc-centre-attention-expiring"
                  >
                    {tc("attention.expiring", { n: inv.attention.expiring })}
                  </Link>
                ) : null}
                {inv.attention.missing > 0 ? (
                  <Link
                    href={inventoryHref({ status: "missing", country }) as "/dashboard"}
                    className={`${CHIP_BASE} border-state-warning/50 bg-state-warning/5 text-state-warning`}
                    data-testid="doc-centre-attention-missing"
                  >
                    {tc("attention.missing", { n: inv.attention.missing })}
                  </Link>
                ) : null}
                {inv.attention.reviewNeeded > 0 ? (
                  <Link
                    href={inventoryHref({ country }) as "/dashboard"}
                    className={`${CHIP_BASE} border-brand-blue/40 bg-brand-blue/5 text-brand-blue`}
                    data-testid="doc-centre-attention-review"
                  >
                    {tc("attention.reviewNeeded", {
                      n: inv.attention.reviewNeeded,
                    })}
                  </Link>
                ) : null}
              </div>
              <p className="text-meta text-text-muted">
                {tc("attention.note")}
              </p>
            </>
          )}
        </section>
      ) : null}

      <p
        className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
        data-testid="documents-disclaimer"
      >
        {t("disclaimer")}
      </p>

      {inv.kind === "needs-migration" ? (
        <p className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
          {t("needsMigration")}
        </p>
      ) : inv.kind === "no-worker" ? (
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
          {t("noWorker")}
        </p>
      ) : inv.kind !== "ok" ? (
        <p className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
          {t("error")}
        </p>
      ) : (
        <>
          {/* (b) Worker document inventory — statuses + verification VERBATIM,
              filterable by type/status via searchParams. Metadata only. */}
          <section
            className="flex flex-col gap-3"
            data-testid="documents-list"
            id={DOC_CENTRE_INVENTORY_ANCHOR.slice(1)}
          >
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("list.title")}
            </h2>
            {inv.documents.length > 0 ? (
              <div className="flex flex-col gap-2" data-testid="doc-centre-filters">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {tc("filters.statusLabel")}
                  </span>
                  <Link
                    href={inventoryHref({ type: filters.type, country }) as "/dashboard"}
                    className={`${CHIP_BASE} ${filters.status === null ? CHIP_ACTIVE : CHIP_IDLE}`}
                  >
                    {tc("filters.all")}
                  </Link>
                  {DOCUMENT_STATUS_FILTERS.map((s) => (
                    <Link
                      key={s}
                      href={
                        inventoryHref({ type: filters.type, status: s, country }) as "/dashboard"
                      }
                      className={`${CHIP_BASE} ${filters.status === s ? CHIP_ACTIVE : CHIP_IDLE}`}
                      data-testid={`doc-centre-filter-status-${s}`}
                    >
                      {t(`status.${s}` as never)}
                    </Link>
                  ))}
                </div>
                {ownedTypeSlugs.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {tc("filters.typeLabel")}
                    </span>
                    <Link
                      href={
                        inventoryHref({ status: filters.status, country }) as "/dashboard"
                      }
                      className={`${CHIP_BASE} ${filters.type === null ? CHIP_ACTIVE : CHIP_IDLE}`}
                    >
                      {tc("filters.all")}
                    </Link>
                    {ownedTypeSlugs.map((slug) => (
                      <Link
                        key={slug}
                        href={
                          inventoryHref({ type: slug, status: filters.status, country }) as "/dashboard"
                        }
                        className={`${CHIP_BASE} ${filters.type === slug ? CHIP_ACTIVE : CHIP_IDLE}`}
                        data-testid={`doc-centre-filter-type-${slug}`}
                      >
                        {t(`types.${slug}` as never)}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {inv.documents.length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
                {t("empty")}
              </p>
            ) : visibleDocuments.length === 0 ? (
              <p
                className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
                data-testid="doc-centre-no-matches"
              >
                {tc("filters.noMatches")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {visibleDocuments.map((d) => (
                  <li
                    key={d.id}
                    className="card-border glow-hover rise-in flex flex-wrap items-center justify-between gap-2 p-3"
                    data-status={d.derivedStatus}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-text-primary">
                        {t(`types.${d.documentTypeSlug}` as never)}
                        {d.country ? ` · ${d.country}` : ""}
                      </span>
                      {d.validUntil ? (
                        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                          {t("fields.validUntil")}: {d.validUntil}
                        </span>
                      ) : null}
                      {/* Train E1: the reviewer's decision date is a fact of
                          the history; shown as a date, never as a score. */}
                      {d.verifiedAt ? (
                        <span
                          className="font-mono text-meta uppercase tracking-label text-text-muted"
                          data-testid="doc-centre-reviewed-on"
                        >
                          {tc("validity.reviewedOn", { date: d.verifiedAt.slice(0, 10) })}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Train E1 — CURRENT validity, derived by the pure rule
                          (lib/documents/credential-validity) from the stored
                          row + the append-only history. Rendered only when the
                          verification axis is readable; the stored verification
                          below stays VERBATIM next to it — current state and
                          history are shown apart, never merged. */}
                      {d.validity ? (
                        <span
                          className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${VALIDITY_TONE[d.validity.state]}`}
                          data-testid="doc-centre-validity"
                          data-validity={d.validity.state}
                        >
                          {tc(`validity.${d.validity.state}`)}
                        </span>
                      ) : null}
                      {/* Verification VERBATIM — rendered only when the axis
                          is really readable; no claim otherwise. */}
                      {inv.verificationAvailable && d.verification ? (
                        <span
                          className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${VERIFICATION_TONE[d.verification]}`}
                          data-testid="doc-centre-verification"
                          data-verification={d.verification}
                        >
                          {tc(`verification.${d.verification}`)}
                        </span>
                      ) : null}
                      <span
                        className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[d.derivedStatus]}`}
                      >
                        {t(`status.${d.derivedStatus}` as never)}
                      </span>
                      {/* Worker-side "send for verification" — the first
                          link of the approval chain (RPC 20260613100200
                          finally gets its caller). Rendered only for
                          eligible rows: stored ready + unverified/rejected
                          on a readable verification axis. */}
                      {inv.verificationAvailable && canRequestVerification(d) ? (
                        <WorkerDocumentVerifyRequestButton
                          locale={locale}
                          documentId={d.id}
                          labels={{
                            submit: tc("verifyRequest.submit"),
                            sent: tc("verifyRequest.sent"),
                            notReady: tc("verifyRequest.notReady"),
                            unavailable: tc("verifyRequest.unavailable"),
                            error: tc("verifyRequest.error"),
                          }}
                        />
                      ) : null}
                    </div>
                    {/* Document & Evidence Engine v1 — REAL per-document
                        file controls, rendered ONLY when the file layer
                        actually answered in this environment. */}
                    {fileState.available ? (
                      <WorkerDocumentFileSlot
                        locale={locale}
                        workerDocumentId={d.id}
                        info={
                          fileState.byDocument.get(d.id) ?? {
                            current: null,
                            versionCount: 0,
                          }
                        }
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {/* (d) Honest storage note — rendered ONLY while the file layer
                is genuinely absent here (human-gated migration unapplied).
                Once uploads truly work end-to-end the controls above replace
                this note; it is never removed while the claim would be
                false. */}
            {!fileState.available ? (
              <p
                className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
                data-testid="doc-centre-upload-note"
              >
                {tc("uploadNote")}
              </p>
            ) : null}
            {/* (e) W4 Slice 2 — the FIRST write path into worker_documents:
                the audited upsert RPC finally has a caller. Facts about a
                document the worker HOLDS (the note above stays honest about
                files). Renders only when the schema is present (inv ok). */}
            <WorkerDocumentForm
              labels={{
                title: t("editor.title"),
                typeLabel: t("editor.typeLabel"),
                countryLabel: t("editor.countryLabel"),
                countryNone: t("editor.countryNone"),
                statusLabel: t("editor.statusLabel"),
                validFromLabel: t("editor.validFromLabel"),
                validUntilLabel: t("fields.validUntil"),
                noteLabel: t("editor.noteLabel"),
                notePlaceholder: t("editor.notePlaceholder"),
                save: t("editor.save"),
                saving: t("editor.saving"),
                saved: t("editor.saved"),
                invalid: t("editor.invalid"),
                needsMigration: t("needsMigration"),
                errorMsg: t("editor.errorMsg"),
              }}
              typeOptions={inv.typeSlugs
                .filter((s) => t.has(`types.${s}` as never))
                .map((s) => [s, t(`types.${s}` as never)] as const)}
              statusOptions={(["ready", "missing", "blocked"] as const).map(
                (s) => [s, t(`status.${s}` as never)] as const,
              )}
              countryOptions={DOCUMENT_COUNTRIES}
            />
          </section>

          <section className="flex flex-col gap-3" data-testid="documents-country">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("country.title")}
            </h2>
            <p className="text-xs text-text-secondary">{t("country.help")}</p>
            <div className="flex flex-wrap gap-2">
              {DOCUMENT_COUNTRIES.map((c) => (
                <Link
                  key={c}
                  href={`/dashboard/documents?country=${c}` as "/dashboard"}
                  className={`rounded-md border px-3 py-1.5 font-mono text-meta uppercase tracking-label ${
                    country === c
                      ? "border-brand-blue text-brand-blue"
                      : "border-ink-500 text-text-secondary hover:border-brand-blue"
                  }`}
                >
                  {c}
                </Link>
              ))}
            </div>
            {country ? (
              (() => {
                const readiness = computeCountryReadiness(
                  country,
                  inv.readiness.documents,
                  inv.readiness.requirements,
                  now,
                );
                if (!readiness.requirementsKnown) {
                  return (
                    <p
                      className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
                      data-testid="documents-country-unknown"
                    >
                      {t("country.unknown", { country })}
                    </p>
                  );
                }
                const overall = workerReadinessFromChecklist(
                  readiness.items,
                  inv.readiness.availabilitySet,
                );
                return (
                  <div className="flex flex-col gap-2">
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${OVERALL_TONE[overall.status]}`}
                      data-testid="documents-overall-status"
                      data-status={overall.status}
                    >
                      <span className="font-mono text-meta uppercase tracking-label">
                        {t(`overall.${overall.status}` as never)}
                      </span>
                      {!inv.readiness.availabilitySet ? (
                        <span className="text-meta text-text-muted">
                          {t("overall.availabilityHint")}
                        </span>
                      ) : null}
                    </div>
                    <ul className="flex flex-col gap-2">
                      {readiness.items.map((i) => (
                        <li
                          key={i.documentTypeSlug}
                          className="card-border glow-hover rise-in flex flex-wrap items-center justify-between gap-2 p-3"
                        >
                          <span className="text-sm text-text-primary">
                            {t(`types.${i.documentTypeSlug}` as never)}
                            <span className="ml-2 font-mono text-meta uppercase tracking-label text-text-muted">
                              {t(`requirement.${i.requirementLevel}` as never)}
                            </span>
                            {i.confidence === "needs_legal_review" ||
                            i.sourceStatus === "needs_legal_source" ? (
                              <span className="ml-2 font-mono text-meta uppercase tracking-label text-state-warning">
                                {t("needsLegalReview")}
                              </span>
                            ) : null}
                            {i.sourceUrl ? (
                              <a
                                href={i.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 font-mono text-meta uppercase tracking-label text-brand-blue underline"
                              >
                                {t("sourceLink")}
                              </a>
                            ) : null}
                          </span>
                          <span
                            className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[i.status]}`}
                          >
                            {t(`status.${i.status}` as never)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-meta text-text-muted">
                      {t("scopeNote")}
                    </p>
                    {readiness.nextActionSlug ? (
                      <p
                        className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
                        data-testid="documents-next-action"
                      >
                        {t("country.next", {
                          doc: t(`types.${readiness.nextActionSlug}` as never),
                        })}
                      </p>
                    ) : (
                      <p className="rounded-md border border-state-success/30 bg-state-success/5 px-3 py-2 text-sm text-text-secondary">
                        {t("country.ok", { country })}
                      </p>
                    )}
                  </div>
                );
              })()
            ) : null}
          </section>
        </>
      )}

      {/* IA (documents hierarchy): these four blocks stood BETWEEN the
          attention strip and the document inventory, so on a page called "My
          documents" the documents were the EIGHTH block, at y=910 on a
          1280x900 viewport — a full screen below the fold, behind exports, an
          acknowledgement inbox, a training register and an agency-consent
          toggle. None of them is a document. They are all still here, in the
          same order, with the same props and the same reads; they now follow
          the inventory instead of guarding it.

          They stay OUTSIDE the `inv.kind === "ok"` branch on purpose: a worker
          whose inventory is unreadable, unmigrated or worker-less must still
          reach their exports, their training register and — above all — the
          consent toggle that decides what their agency can see. Folding them
          into the ok-branch would have made a privacy control disappear
          exactly when the page is already degraded.

          `TrainingRegister` keeps its `#training` id, and its save action
          already redirects to `?trn=…#training`, so the confirmation still
          scrolls itself into view from the new position. */}
      {/* (c) Work-proof section — the real exports + own journal evidence
          counts, all linking to the existing surfaces (nothing duplicated). */}
      <WorkProofExports t={t} tc={tc} locale={locale} workProof={centre.workProof} />

      {/* Document & Evidence Engine v1 — documents this person was asked to
          confirm (version-bound acks). Renders nothing while the layer is
          absent or the inbox is empty. */}
      <DocumentAckInbox locale={locale} />

      {/* Training & Certification v1 — the person's own training and their
          certificates. Completing is self-only; nobody records it for them. */}
      <TrainingRegister locale={locale} notice={sp.trn} />

      <DocsConsentToggle current={docsConsent} />

      {/* WAGON 9 (area 17) — Lithuanian-master jurisdiction/document
          guidance. LT locale renders the full draft registry; other locales
          see only the "being prepared from the Lithuanian master" notice
          (owner correction 2026-07-05). */}
      <LtDocumentGuidance locale={locale} />
    </div>
  );
}

/** Work proof & exports (§8.8 + PR H (c)): the real, working print→PDF
 *  exports (Verified CV, Evidence Report), the journal CSV download
 *  (quality-train PR I), the worker's OWN journal evidence counts linking the
 *  real journal surface, plus an HONEST format-status line. No fake export
 *  buttons — unavailable formats are stated, not shown as clickable. Existing
 *  routes only; no duplicate report system. The CSV entry is a plain anchor
 *  (a file download, not a page). */
function WorkProofExports({
  t,
  tc,
  locale,
  workProof,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  tc: Awaited<ReturnType<typeof getTranslations>>;
  locale: string;
  workProof: WorkProofSummary;
}) {
  const exports = [
    { key: "cv", href: "/cv", label: t("reports.cv"), note: t("reports.cvNote") },
    {
      key: "evidence",
      href: "/dashboard/reports/evidence",
      label: t("reports.evidence"),
      note: t("reports.evidenceNote"),
    },
    {
      key: "journal",
      href: `/${locale}/dashboard/journal/export`,
      label: t("reports.journal"),
      note: t("reports.journalNote"),
      download: true,
    },
  ];
  const cardClass =
    "flex min-h-[3.25rem] flex-col rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-sm text-text-primary transition-colors hover:border-brand-blue";
  const countsKnown =
    workProof.journalEntryCount !== null && workProof.journalPhotoCount !== null;
  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="documents-reports-exports"
    >
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
        {tc("workProof.title")}
      </span>
      <p className="text-xs text-text-secondary">{t("reports.intro")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {/* Own journal evidence — REAL counts (head counts over the worker's
            own rows) linking the real journal surface; unreadable counts say
            so instead of showing a fake zero. */}
        <Link
          href={"/dashboard/journal" as "/dashboard"}
          data-testid="doc-centre-journal-proof"
          className={cardClass}
        >
          <span className="font-semibold">{tc("workProof.journalTitle")}</span>
          <span className="text-xs text-text-muted">
            {countsKnown
              ? tc("workProof.journalCounts", {
                  entries: workProof.journalEntryCount ?? 0,
                  photos: workProof.journalPhotoCount ?? 0,
                })
              : tc("workProof.countsUnavailable")}
          </span>
        </Link>
        {exports.map((e) =>
          e.download ? (
            <a
              key={e.key}
              href={e.href}
              data-testid={`documents-report-${e.key}`}
              className={cardClass}
            >
              <span className="font-semibold">{e.label}</span>
              <span className="text-xs text-text-muted">{e.note}</span>
            </a>
          ) : (
            <Link
              key={e.key}
              href={e.href as "/dashboard"}
              data-testid={`documents-report-${e.key}`}
              className={cardClass}
            >
              <span className="font-semibold">{e.label}</span>
              <span className="text-xs text-text-muted">{e.note}</span>
            </Link>
          ),
        )}
      </div>
      {/* Photo evidence lives inside journal entries; project galleries render
          on each project page — linked, never duplicated here. */}
      <p className="text-meta text-text-muted" data-testid="doc-centre-gallery-note">
        {tc("workProof.galleryNote")}
      </p>
      <p
        className="font-mono text-meta uppercase tracking-label text-text-muted"
        data-testid="documents-export-format-status"
      >
        {t("reports.formatStatus")}
      </p>
    </section>
  );
}

function Header({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <header className="flex flex-col gap-1">
      <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
        {t("eyebrow")}
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h1>
      <p className="text-sm text-text-secondary">{t("subtitle")}</p>
    </header>
  );
}
