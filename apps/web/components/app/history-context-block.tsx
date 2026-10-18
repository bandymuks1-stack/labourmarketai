import { useTranslations } from "next-intl";

import type { HistoryContext, ProofConcept } from "@/lib/organization-evidence/professional-history-context";

/**
 * THE WORK BEHIND THE HOURS - one record's professional-history context.
 *
 * Presentational and i18n-aware: it renders a `HistoryContext` a caller
 * already holds (profile section, person page, Work in Numbers period line)
 * and nothing else. It adds no data source and no authority.
 *
 * WHAT IT REFUSES TO DO
 *  - show a field the record does not carry (an absent project, client or
 *    capacity renders NOTHING, never "unknown" filler and never a guess);
 *  - merge the work date with the date the platform received the record
 *    ("recorded" is its own labelled line, the work date is shown by the
 *    caller's own date line);
 *  - collapse the proof facts into one "verified" badge: each fact is its
 *    own line of words, and the note says an organisation's attestation is
 *    not the client's acceptance and not payment.
 *
 * Neutral tokens only: confirmation green stays the property of the
 * evidence-standing chip (`EvidenceState`), so this block can never make an
 * attestation look like verification.
 */

const SOURCE_KINDS = new Set([
  "xlsx", "csv", "pdf", "api", "agent", "erp", "payroll", "sis", "lms", "email", "drive", "manual",
]);
const ROLES = new Set([
  "employer", "agency", "client", "end_client", "project_owner", "subcontractor",
  "education_provider", "training_provider", "assessor", "verifier", "placement_provider",
  "public_body", "sector_body", "other",
]);
const RELATIONSHIPS = new Set([
  "candidate", "employee", "former_employee", "agency_worker", "subcontractor", "contractor",
  "student", "graduate", "trainee", "apprentice", "programme_participant", "volunteer", "other",
]);

function Row({ term, children, testId }: { term: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-2" data-testid={testId}>
      <dt className="shrink-0 text-meta text-text-muted sm:w-36">{term}</dt>
      <dd className="min-w-0 break-words text-sm text-text-secondary">{children}</dd>
    </div>
  );
}

export function HistoryContextBlock({ context }: { context: HistoryContext | null | undefined }) {
  const t = useTranslations("historyContext");
  const tRole = useTranslations("evidenceImport.role");
  const tKind = useTranslations("evidenceImport.sourceKind");
  const tRel = useTranslations("evidenceImport.relationship");
  if (!context) return null;

  const role = (r: string) => (ROLES.has(r) ? tRole(r as never) : null);
  const party = (p: { role: string; label: string }) => {
    const r = role(p.role);
    return r ? `${p.label} (${r})` : p.label;
  };
  const sourceKind =
    context.source.kind && SOURCE_KINDS.has(context.source.kind)
      ? tKind(context.source.kind as never)
      : null;
  const relationship =
    context.relationshipKind && RELATIONSHIPS.has(context.relationshipKind)
      ? tRel(context.relationshipKind as never)
      : null;
  const supplier = context.source.supplierName;
  const proof = context.proof.concepts.filter((c): c is Exclude<ProofConcept, "SUPERVISOR_CONFIRMED"> =>
    c !== "SUPERVISOR_CONFIRMED",
  );
  const attestedAs =
    context.proof.attestedByRole && ROLES.has(context.proof.attestedByRole)
      ? tRole(context.proof.attestedByRole as never)
      : null;

  const hasSource = sourceKind !== null || supplier !== null || context.source.reconstructed;
  if (
    !context.project &&
    !context.place &&
    context.clients.length === 0 &&
    context.otherParties.length === 0 &&
    !relationship &&
    !hasSource &&
    !context.recordedAt &&
    proof.length === 0
  ) {
    return null;
  }

  return (
    <dl
      className="flex flex-col gap-1.5 border-t border-border-subtle pt-2"
      data-testid="history-context"
      data-proof={proof.join(" ")}
      data-reconstructed={context.source.reconstructed ? "true" : "false"}
    >
      {context.project ? (
        <Row term={t("project")} testId="history-context-project">
          {context.project.name}
        </Row>
      ) : null}
      {context.place ? (
        <Row term={t("place")} testId="history-context-place">
          {context.place.name}
        </Row>
      ) : null}
      {context.clients.length > 0 ? (
        <Row term={t("client")} testId="history-context-client">
          {context.clients.map(party).join(" · ")}
        </Row>
      ) : null}
      {context.otherParties.length > 0 ? (
        <Row term={t("otherParties")} testId="history-context-parties">
          {context.otherParties.map(party).join(" · ")}
        </Row>
      ) : null}
      {relationship ? (
        <Row term={t("capacity")} testId="history-context-capacity">
          {relationship}
        </Row>
      ) : null}
      {hasSource ? (
        <Row term={t("source")} testId="history-context-source">
          {[
            supplier ? t("suppliedBy", { name: supplier }) : null,
            sourceKind,
            context.source.reconstructed ? t("reconstructed") : null,
          ]
            .filter((x): x is string => x !== null)
            .join(" · ")}
        </Row>
      ) : null}
      {context.recordedAt ? (
        <Row term={t("recordedAt")} testId="history-context-recorded">
          <span className="font-mono tabular-nums">{context.recordedAt}</span>
        </Row>
      ) : null}
      {proof.length > 0 ? (
        <Row term={t("proofTitle")} testId="history-context-proof">
          <ul className="flex flex-col gap-0.5">
            {proof.map((c) => (
              <li key={c} data-concept={c}>
                {t(`proof.${c}` as never)}
                {c === "EVIDENCE_SUPPORTED" && attestedAs
                  ? ` · ${t("attestedAs", { role: attestedAs })}`
                  : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-meta text-text-muted" data-testid="history-context-proof-note">
            {t("proofNote")}
          </p>
        </Row>
      ) : null}
    </dl>
  );
}
