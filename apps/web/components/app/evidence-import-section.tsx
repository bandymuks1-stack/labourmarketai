import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";

import { createClient } from "@/lib/supabase/server";
import { locales } from "@/lib/i18n/config";
import type { DomainCaller } from "@/lib/domain/caller";
import {
  ATTESTATION_ROLES,
  SOURCE_KINDS,
  SUPPLIER_ROLES,
  buildPreview,
  listEvidenceRecords,
  listRosterPeople,
  type EvidenceImportFailure,
  type EvidenceRecordView,
  type ImportPreview,
  type PreviewRow,
  type RosterPersonView,
} from "@/lib/organization-evidence/import-core";
import {
  REPORTED_EVIDENCE_STATES,
  isSelfVouched,
} from "@/lib/organization-evidence/evidence-state";
import { mintCommitToken } from "@/lib/organization-evidence/commit-confirmation";
import { resolveEvidenceOrganization } from "@/lib/organization-evidence/evidence-org-context";
import {
  EvidenceAttestForm,
  EvidenceCommitForm,
  EvidenceRowResolve,
  EvidenceSourceForm,
  EvidenceWithdrawForm,
  type Option,
} from "@/components/app/evidence-import-forms";
import {
  attestEvidenceRecordAction,
  commitEvidenceImportAction,
  createEvidencePersonAction,
  resolveEvidenceRowAction,
  startEvidenceImportAction,
  withdrawEvidenceImportAction,
} from "@/lib/organization-evidence/import-actions";

/**
 * ORGANIZATION EVIDENCE IMPORT — the human face of the one import engine.
 *
 * ── WHY THIS IS A SECTION AND NOT A PAGE ───────────────────────────────────
 * It WAS a page (`/dashboard/company/evidence-import`) for exactly one CI run.
 * The Product Gate caught it: a new screen must answer the five World-State
 * questions, and four of my answers were honestly "no" — not on the map, not
 * AI-driven, not usable without leaving the workspace, and needing a new page.
 * The only way past that is a scoped OWNER waiver, and asking for one to bless
 * a page I had just invented — while the same window folded supply discovery
 * into the existing scouting page correctly — would have been asking the owner
 * to ratify my own inconsistency.
 *
 * So it lives inside the company workspace, like every other thing a manager
 * does there. Nothing about the engine changed: the same core, the same RLS,
 * the same commit gate, the same eleven capabilities. Only the container did.
 *
 * ── ORGANIZATION IS THE ROOT, COMPANY IS A ROLE ────────────────────────────
 * The page never asks "which company"; it asks which ORGANIZATION the caller
 * is acting for and in what capacity that organization is speaking. An
 * employer, a staffing agency, a subcontractor, a university, a vocational
 * school, a training provider, an assessor and a public body all reach the
 * SAME engine — what changes is the recorded `supplier_role`, and with it the
 * words on the screen. There is no second import for institutions.
 *
 * That is why an agency is never rendered as the end employer: the capacity is
 * a stored field on the session and travels onto every record, so a reader can
 * always tell who said this and as what.
 *
 * ── WHAT THIS PAGE MAY AND MAY NOT CLAIM ───────────────────────────────────
 * An import produces REPORTED evidence and nothing stronger — the commit
 * control offers no attested and no verified value, because the column's CHECK
 * has none. Attestation is a separate, later act with its own control; there is
 * no "verify" control at all, because independent verification belongs to a
 * party that is neither the supplier nor the subject.
 *
 * ── ONE ENGINE, TWO TRANSPORTS ─────────────────────────────────────────────
 * Every read here (`buildPreview`, `listRosterPeople`, `listEvidenceRecords`)
 * and every write behind the forms is the same function an authorized
 * assistant calls through `evidence.*` on `/api/mcp`, under the same RLS, with
 * the same commit gate. Nothing on this page is implemented twice.
 */

const SECTION = "flex flex-col gap-4";
const HEADING =
  "font-display text-lg font-bold tracking-tightest text-text-primary";

const STATE_TONE: Record<string, string> = {
  ready: "border-state-success/40 bg-state-success/10 text-state-success",
  needs_review: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  duplicate: "border-ink-500 bg-ink-800/40 text-text-muted",
  conflict: "border-state-warning/40 bg-state-warning/10 text-state-warning",
};

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${tone}`}
    >
      {children}
    </span>
  );
}

/** A row's headline state, chosen by the same precedence the core uses: a
 *  conflict outranks a duplicate, which outranks "needs a person". */
function rowTone(row: PreviewRow): string {
  if (row.duplicateState === "conflict") return STATE_TONE.conflict;
  if (row.duplicateState === "duplicate") return STATE_TONE.duplicate;
  return row.ready ? STATE_TONE.ready : STATE_TONE.needs_review;
}

export async function EvidenceImportSection({
  locale,
  /** The staged source being reviewed, from the company page's own
   *  `?evidenceSession=` — a bookmarkable, shareable URL WITHOUT a route of
   *  its own, which is the whole point. */
  sessionId,
}: {
  locale: string;
  sessionId?: string;
}) {
  const t = await getTranslations("evidenceImport");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const header = (
    <header className="flex flex-col gap-1">
      <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
        {t("eyebrow")}
      </p>
      <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h2>
      <p className="text-sm leading-relaxed text-text-secondary">
        {t("intro")}
      </p>
    </header>
  );

  const shell = (children: React.ReactNode) => (
    <div
      className="flex w-full flex-col gap-6"
      data-testid="evidence-import-section"
      id="evidence-import"
    >
      {header}
      {children}
    </div>
  );

  /** The one honest refusal panel. The reason travels as `data-reason` so the
   *  states stay distinguishable without printing internals at the person. */
  const notice = (
    reason: string,
    options?: readonly { id: string; name: string }[],
  ) =>
    shell(
      <section
        data-testid="evidence-import-context-notice"
        data-reason={reason}
        className="flex flex-col gap-2 rounded-lg border border-state-warning/40 bg-state-warning/5 px-4 py-3"
      >
        <p className="text-sm leading-relaxed text-text-primary">
          {t(`context.${reason}` as never)}
        </p>
        {options && options.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-text-secondary">
            {options.map((o) => (
              <li key={o.id}>{o.name}</li>
            ))}
          </ul>
        )}
      </section>,
    );

  if (!user) return notice("unauthenticated");
  const caller: DomainCaller = { supabase, userId: user.id, locale };

  // ACTING CONTEXT FIRST — no read happens until the organization and the
  // authority to import for it are both established, so a personal workspace
  // can never be shown another organization's roster.
  const org = await resolveEvidenceOrganization(caller, null);
  if (!org.ok) {
    const reason =
      org.reason === "personal-workspace"
        ? "personalWorkspace"
        : org.reason === "no-organization"
          ? "noOrganization"
          : org.reason === "not-a-member"
            ? "notAMember"
            : org.reason === "choice-required"
              ? "chooseOrganization"
              : org.reason === "not-authorized"
                ? "notAuthorized"
                : org.reason === "needs-migration"
                  ? "needsMigration"
                  : "unavailable";
    return notice(reason, org.options);
  }

  // ── vocabularies, localized once ─────────────────────────────────────────
  const options = <T extends string>(
    values: readonly T[],
    ns: string,
  ): Option[] =>
    values.map((v) => ({
      value: v,
      label: t(`${ns}.${v}` as never) as string,
    }));

  const errors = Object.fromEntries(
    [
      "invalid",
      "not_found",
      "unavailable",
      "too_many_rows",
      "no_source_supplied",
      "file_too_large",
      "file_unreadable",
      "nothing_parsed",
      "confirmation_rejected",
      "confirmation_unavailable",
    ].map((k) => [k, t(`error.${k}` as never) as string]),
  );
  // Context refusals can also come back from an action (the workspace changed
  // in another tab), so they share the same message table.
  errors.not_authorized = t("context.notAuthorized");
  errors.needs_migration = t("context.needsMigration");
  errors.choice_required = t("context.chooseOrganization");
  errors.unauthenticated = t("context.unauthenticated");

  const RELATIONSHIP_KINDS = [
    "employee",
    "former_employee",
    "agency_worker",
    "subcontractor",
    "contractor",
    "student",
    "graduate",
    "trainee",
    "apprentice",
    "programme_participant",
    "volunteer",
    "other",
  ] as const;

  const sourceForm = (
    <Card compact>
      <section className={SECTION}>
        <h2 className={HEADING}>{t("form.title")}</h2>
        <p className="text-xs leading-relaxed text-text-muted">
          {t("nothingWrittenYet")}
        </p>
        <EvidenceSourceForm
          action={startEvidenceImportAction}
          labels={{
            supplierRole: t("form.supplierRole"),
            supplierRoleHint: t("form.supplierRoleHint"),
            sourceKind: t("form.sourceKind"),
            sourceLanguage: t("form.sourceLanguage"),
            filename: t("form.filename"),
            reference: t("form.reference"),
            referenceHint: t("form.referenceHint"),
            notes: t("form.notes"),
            paste: t("form.paste"),
            pasteHint: t("form.pasteHint"),
            file: t("form.file"),
            submit: t("form.submit"),
            submitting: t("form.submitting"),
            errors,
          }}
          supplierRoles={options(SUPPLIER_ROLES, "role")}
          sourceKinds={options(SOURCE_KINDS, "sourceKind")}
          // The source's own language, from THE canonical UI locale list — the
          // same set the column's CHECK carries.
          languages={locales.map((l) => ({ value: l, label: l.toUpperCase() }))}
          defaultLanguage={
            locales.includes(locale as (typeof locales)[number]) ? locale : "en"
          }
        />
      </section>
    </Card>
  );

  const actingFor = (
    <p
      className="text-xs text-text-muted"
      data-testid="evidence-import-acting-for"
    >
      {t("actingFor")}:{" "}
      <span className="text-text-secondary">{org.organizationName}</span>
    </p>
  );

  if (!sessionId)
    return shell(
      <>
        {actingFor}
        {sourceForm}
      </>,
    );

  // ── a staged source: preview, roster, records ────────────────────────────
  const [previewRes, rosterRes, recordsRes] = await Promise.all([
    buildPreview(caller, sessionId),
    listRosterPeople(caller, { limit: 500 }),
    listEvidenceRecords(caller, { sessionId, limit: 200 }),
  ]);

  /** A failed READ is never rendered as an empty organization (#1314). Each
   *  result is checked on its own so the narrowing survives and so the reason
   *  the person sees is the reason that actually occurred. */
  const readFailure = (f: EvidenceImportFailure) =>
    notice(
      f.kind === "needs-migration"
        ? "needsMigration"
        : f.kind === "not-authorized"
          ? "notAuthorized"
          : f.kind === "choice-required"
            ? "chooseOrganization"
            : "unavailable",
      f.kind === "choice-required" ? f.options : undefined,
    );
  if (previewRes.kind !== "ok") return readFailure(previewRes);
  if (rosterRes.kind !== "ok") return readFailure(rosterRes);
  if (recordsRes.kind !== "ok") return readFailure(recordsRes);

  const preview: ImportPreview = previewRes.preview;
  const roster: readonly RosterPersonView[] = rosterRes.people;
  const records: readonly EvidenceRecordView[] = recordsRes.records;
  const ready = preview.rows.filter((r) => r.ready);

  // The token binds to the rows shown BELOW. If anything changes before the
  // person approves, the commit is refused rather than quietly recording
  // something they never read.
  let commitToken: string | null = null;
  try {
    commitToken = mintCommitToken({
      sessionId,
      userId: caller.userId,
      readyRows: ready,
    });
  } catch {
    // No signing secret in this environment — the button is withheld and the
    // reason is said out loud, never silently committed without the gate.
    commitToken = null;
  }

  const rosterOptions: Option[] = roster.map((p) => ({
    value: p.id,
    label: p.externalRef
      ? `${p.displayName} · ${p.externalRef}`
      : p.displayName,
  }));

  const counts = (
    <dl
      className="grid grid-cols-2 gap-2 sm:grid-cols-6"
      data-testid="evidence-preview-counts"
    >
      {(
        [
          ["total", preview.counts.total],
          ["ready", preview.counts.ready],
          ["needsPerson", preview.counts.needsPerson],
          ["needsContext", preview.counts.needsContext],
          ["duplicates", preview.counts.duplicates],
          ["conflicts", preview.counts.conflicts],
        ] as const
      ).map(([key, value]) => (
        <div
          key={key}
          className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2"
        >
          <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t(`preview.counts.${key}` as never)}
          </dt>
          <dd className="text-lg font-semibold text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );

  return shell(
    <>
      {actingFor}
      {sourceForm}

      <Card compact>
        <section className={SECTION} data-testid="evidence-preview">
          <h2 className={HEADING}>{t("preview.title")}</h2>
          <p className="text-xs leading-relaxed text-state-amber">
            {t("preview.notPersisted")}
          </p>
          {counts}

          {preview.rows.length === 0 ? (
            <p className="text-sm text-text-muted">{t("preview.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-500 text-left">
                    {(
                      [
                        "row",
                        "person",
                        "date",
                        "hours",
                        "place",
                        "work",
                        "state",
                      ] as const
                    ).map((c) => (
                      <th
                        key={c}
                        className="px-2 py-2 font-mono text-meta uppercase tracking-label text-text-muted"
                      >
                        {t(`preview.column.${c}` as never)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => {
                    // FACT vs DERIVED, per field, straight from staging — an
                    // inference is never rendered as something the source said.
                    const derivedKeys = Object.keys(row.derived);
                    return (
                      <tr
                        key={row.id}
                        data-testid="evidence-preview-row"
                        data-ready={row.ready ? "true" : "false"}
                        data-duplicate-state={row.duplicateState}
                        data-person-state={row.personState}
                        className="border-b border-ink-500/50 align-top"
                      >
                        <td className="px-2 py-2 text-text-muted">
                          {row.rowIndex + 1}
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-text-primary">
                            {row.personName ?? row.personLabel ?? "—"}
                          </div>
                          <div className="text-xs text-text-muted">
                            {t(`personState.${row.personState}` as never)}
                            {row.personConfidence !== null
                              ? ` · ${Math.round(row.personConfidence * 100)}%`
                              : ""}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-text-secondary">
                          {row.activityDate ??
                            [row.periodStart, row.periodEnd]
                              .filter(Boolean)
                              .join(" – ") ??
                            "—"}
                        </td>
                        <td className="px-2 py-2 text-text-secondary">
                          {row.hours ?? "—"}
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-text-secondary">
                            {row.workObjectName ?? row.contextLabel ?? "—"}
                          </div>
                          <div className="text-xs text-text-muted">
                            {t(`contextState.${row.contextState}` as never)}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-text-secondary">
                          {row.activityText ?? "—"}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col items-start gap-1">
                            <Chip tone={rowTone(row)}>
                              {t(
                                `duplicateState.${row.duplicateState}` as never,
                              )}
                            </Chip>
                            {row.factFields.length > 0 && (
                              <span className="text-xs text-text-muted">
                                {t("preview.fact")}: {row.factFields.join(", ")}
                              </span>
                            )}
                            {derivedKeys.length > 0 && (
                              <span
                                className="text-xs text-state-amber"
                                data-testid="evidence-row-derived"
                              >
                                {t("preview.derived")}: {derivedKeys.join(", ")}
                              </span>
                            )}
                            {row.problem && (
                              <span className="text-xs text-text-secondary">
                                {t(`problem.${row.problem}` as never)}
                              </span>
                            )}
                          </div>
                          {!row.ready && row.duplicateState !== "duplicate" && (
                            <div className="mt-2">
                              <EvidenceRowResolve
                                resolveAction={resolveEvidenceRowAction}
                                createAction={createEvidencePersonAction}
                                sessionId={sessionId}
                                rowId={row.id}
                                suggestedName={row.personLabel ?? ""}
                                // Ambiguity offers exactly the real candidates;
                                // an unmatched name offers the whole roster.
                                people={
                                  row.personCandidates.length > 0
                                    ? row.personCandidates.map((c) => ({
                                        value: c.id,
                                        label: c.name,
                                      }))
                                    : rosterOptions
                                }
                                places={row.contextCandidates.map((c) => ({
                                  value: c.id,
                                  label: c.name,
                                }))}
                                relationships={options(
                                  RELATIONSHIP_KINDS,
                                  "relationship",
                                )}
                                labels={{
                                  choosePerson: t("resolve.choosePerson"),
                                  choosePlace: t("resolve.choosePlace"),
                                  save: t("resolve.save"),
                                  addPerson: t("resolve.addPerson"),
                                  displayName: t("resolve.displayName"),
                                  externalRef: t("resolve.externalRef"),
                                  relationship: t("resolve.relationship"),
                                  create: t("resolve.create"),
                                  unlinkedNote: t("resolve.unlinkedNote"),
                                  errors,
                                }}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Card>

      <Card compact>
        <section className={SECTION}>
          <h2 className={HEADING}>{t("commit.title")}</h2>
          {commitToken === null && (
            <p
              className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs text-text-secondary"
              data-testid="evidence-commit-unavailable"
            >
              {t("error.confirmation_unavailable")}
            </p>
          )}
          <EvidenceCommitForm
            action={commitEvidenceImportAction}
            sessionId={sessionId}
            confirmationToken={commitToken}
            readyCount={ready.length}
            evidenceStates={options(REPORTED_EVIDENCE_STATES, "evidenceState")}
            labels={{
              evidenceState: t("commit.evidenceState"),
              evidenceStateHint: t("commit.evidenceStateHint"),
              confirm: t("commit.confirm", { count: "{count}" }),
              confirmNone: t("commit.confirmNone"),
              confirming: t("commit.confirming"),
              readOnce: t("commit.readOnce"),
              written: t("result.written"),
              skipped: t("result.skipped"),
              notReady: t("result.notReady"),
              errors,
            }}
          />
        </section>
      </Card>

      <Card compact>
        <section className={SECTION} data-testid="evidence-records">
          <h2 className={HEADING}>{t("records.title")}</h2>
          {records.length === 0 ? (
            <p className="text-sm text-text-muted">{t("records.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {records.map((rec) => (
                <li
                  key={rec.id}
                  data-testid="evidence-record"
                  data-state={rec.state}
                  data-independently-verified={
                    rec.independentlyVerified ? "true" : "false"
                  }
                  className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-900 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">
                      {rec.personName ?? "—"}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {rec.activityDate ??
                        [rec.periodStart, rec.periodEnd]
                          .filter(Boolean)
                          .join(" – ")}
                    </span>
                    {rec.hours !== null && (
                      <span className="text-xs text-text-secondary">
                        {rec.hours} h
                      </span>
                    )}
                    <Chip
                      tone={
                        rec.withdrawn
                          ? STATE_TONE.duplicate
                          : isSelfVouched(rec.state as never)
                            ? STATE_TONE.needs_review
                            : STATE_TONE.ready
                      }
                    >
                      {rec.withdrawn
                        ? t("records.withdrawn")
                        : rec.attestation
                          ? rec.attestation.self
                            ? t("records.selfAttested")
                            : t("records.attested")
                          : t(`evidenceState.${rec.state}` as never)}
                    </Chip>
                    {/* The one trust claim this page ever makes about an import,
                      and it is always the same one. */}
                    <span className="text-xs text-text-muted">
                      {t("records.notIndependentlyVerified")}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary">{rec.text}</p>
                  <p className="text-xs text-text-muted">
                    {t("records.supplier")}:{" "}
                    {t(`role.${rec.supplierRole}` as never)} ·{" "}
                    {t("records.source")}:{" "}
                    {rec.sourceFilename ?? rec.sourceKind} ·{" "}
                    {t("records.importedAt")}: {rec.importedAt.slice(0, 10)}
                  </p>
                  {rec.attestation?.self && (
                    <p className="text-xs leading-relaxed text-state-amber">
                      {t("records.selfAttestedHint")}
                    </p>
                  )}
                  {!rec.attestation && !rec.withdrawn && (
                    <EvidenceAttestForm
                      action={attestEvidenceRecordAction}
                      recordId={rec.id}
                      sessionId={sessionId}
                      roles={options(ATTESTATION_ROLES, "role")}
                      defaultRole={rec.supplierRole}
                      labels={{
                        attest: t("records.attest"),
                        attestRole: t("records.attestRole"),
                        attestNote: t("records.attestNote"),
                        errors,
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      <Card compact>
        <section className={SECTION}>
          <h2 className={HEADING}>{t("withdraw.title")}</h2>
          <EvidenceWithdrawForm
            action={withdrawEvidenceImportAction}
            sessionId={sessionId}
            labels={{
              note: t("withdraw.note"),
              button: t("withdraw.button"),
              hint: t("withdraw.hint"),
              errors,
            }}
          />
        </section>
      </Card>
    </>,
  );
}
