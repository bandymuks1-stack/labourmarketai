"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  commitPeopleIngestAction,
  previewPeopleFileAction,
  type PeopleFilePreview,
} from "@/lib/organization-people/ingest-actions";
import type {
  IngestPlan,
  IngestRelationship,
  PersonSource,
  RowResolution,
} from "@/lib/organization-people/ingest-core";

/**
 * BRING YOUR PEOPLE IN — the human half of organization people ingestion.
 *
 * ── THE SHAPE, AND WHY IT IS THIS SHAPE ────────────────────────────────────
 * ATTACH → SEE WHAT WE UNDERSTOOD → ANSWER ANYTHING AMBIGUOUS → CONFIRM →
 * RECEIPT. The preview step is not decoration: nothing is written until a
 * human has seen the counts, and the confirm step re-plans server-side
 * against the roster as it is at that moment.
 *
 * ── WHAT IT REFUSES TO BE ──────────────────────────────────────────────────
 * A column mapper, a spreadsheet editor, or an administration console. It
 * asks one question a manager already knows the answer to ("who are these
 * people to you?"), shows what was read, and asks only about names it
 * genuinely cannot place. Thirteen technical relationship slugs are never
 * shown; six plain-language options are, and the one that fits the workspace
 * leads.
 *
 * ── WHAT IT SAYS OUT LOUD ──────────────────────────────────────────────────
 * The `willNot` line is not boilerplate. Uploading a list of people is the
 * moment a manager is most likely to assume more happened than did — that
 * accounts were made, that the platform now vouches for these people, that
 * they may be marketed. All four are false, and the panel says so before the
 * confirm button, not after.
 */

type Stage =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "preview"; preview: Extract<PeopleFilePreview, { kind: "ok" }> }
  | { kind: "done"; created: number; existing: number; skipped: number }
  | { kind: "error"; message: string };

/** Plain-language answers, mapped to truthful relationship slugs. */
const CHOICES: ReadonlyArray<{ readonly slug: IngestRelationship; readonly key: string }> = [
  { slug: "employee", key: "relEmployee" },
  { slug: "candidate", key: "relCandidate" },
  { slug: "agency_worker", key: "relAgencyWorker" },
  { slug: "student", key: "relStudent" },
  { slug: "trainee", key: "relTrainee" },
  { slug: "contractor", key: "relContractor" },
];

export function PeopleImportPanel({
  organizationName,
  /** The workspace's own shape decides which answer leads — never which are
   *  allowed. An agency still employs people; a school still hires. */
  suggested = "employee",
}: {
  readonly organizationName: string;
  readonly suggested?: IngestRelationship;
}) {
  const t = useTranslations("peopleImport");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [relationship, setRelationship] = useState<IngestRelationship>(suggested);
  const [resolutions, setResolutions] = useState<Record<number, RowResolution>>({});
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const sourcesRef = useRef<readonly PersonSource[]>([]);

  const failureText = (res: PeopleFilePreview, file: string): string => {
    switch (res.kind) {
      case "no-name-column":
        return t("errNoName");
      case "unsupported-file":
        return t("errUnsupported", { file: res.filename || file });
      case "file-too-large":
        return t("errTooLarge");
      case "too-many-rows":
        return t("errTooMany", { limit: res.limit });
      case "nothing-parsed":
        return t("errNothing");
      case "not-authorized":
      case "choice-required":
        return t("errNotAuthorized");
      case "needs-migration":
        return t("errNeedsMigration");
      default:
        return t("errFailed");
    }
  };

  function onFile(file: File) {
    setResolutions({});
    setStage({ kind: "reading" });
    const form = new FormData();
    form.set("file", file);
    form.set("relationship", relationship);
    start(async () => {
      const res = await previewPeopleFileAction(form);
      if (res.kind !== "ok") {
        setStage({ kind: "error", message: failureText(res, file.name) });
        return;
      }
      sourcesRef.current = res.sources;
      setStage({ kind: "preview", preview: res });
    });
  }

  function reprice(next: Record<number, RowResolution>) {
    setResolutions(next);
  }

  function confirm() {
    const sources = sourcesRef.current;
    start(async () => {
      const res = await commitPeopleIngestAction({
        sources,
        relationship,
        resolutions: Object.values(resolutions),
      });
      if (res.kind !== "ok") {
        setStage({
          kind: "error",
          message: res.kind === "needs-migration" ? t("errNeedsMigration") : t("errFailed"),
        });
        return;
      }
      setStage({
        kind: "done",
        created: res.created,
        existing: res.skippedExisting,
        skipped: res.skippedDuplicate + res.skippedUnusable,
      });
    });
  }

  const plan: IngestPlan | null = stage.kind === "preview" ? stage.preview.plan : null;
  const counts = plan?.kind === "plan" ? plan.counts : null;
  const ambiguous =
    plan?.kind === "plan"
      ? plan.rows.filter((r) => r.disposition.kind === "ambiguous")
      : [];
  const answered = ambiguous.every((r) => resolutions[r.index] !== undefined);

  return (
    <section
      id="people-import"
      data-testid="people-import"
      className="rounded-card border border-ink-600 bg-ink-800/60 p-4"
    >
      <h3 className="text-body font-medium text-text-primary">{t("title")}</h3>
      <p className="mt-1 text-meta text-text-secondary">{t("lead")}</p>

      <label className="mt-3 block text-meta text-text-secondary" htmlFor="people-import-rel">
        {t("relationship")}
      </label>
      <select
        id="people-import-rel"
        data-testid="people-import-relationship"
        value={relationship}
        onChange={(e) => setRelationship(e.target.value as IngestRelationship)}
        className="mt-1 w-full rounded-bubble border border-ink-500 bg-ink-800 px-3 py-2 text-body text-text-primary"
      >
        {CHOICES.map((c) => (
          <option key={c.slug} value={c.slug}>
            {t(c.key)}
          </option>
        ))}
      </select>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xlsm,.csv,.tsv,.txt"
        data-testid="people-import-file"
        className="mt-3 block w-full text-meta text-text-secondary"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />

      {stage.kind === "reading" ? (
        <p className="mt-3 text-meta text-text-secondary" role="status">
          {t("reading")}
        </p>
      ) : null}

      {stage.kind === "error" ? (
        <p className="mt-3 text-meta text-brand-champagne" role="status" data-testid="people-import-error">
          {stage.message}
        </p>
      ) : null}

      {stage.kind === "preview" && counts ? (
        <div className="mt-4 border-t border-ink-600 pt-3" data-testid="people-import-preview">
          <h4 className="text-body text-text-primary">{t("previewTitle")}</h4>
          <ul className="mt-2 space-y-1 text-meta text-text-secondary">
            <li>{t("detected", { count: counts.total, file: stage.preview.sourceLabel })}</li>
            <li>{t("willCreate", { count: counts.toCreate })}</li>
            {counts.alreadyOnRoster > 0 ? (
              <li>{t("alreadyThere", { count: counts.alreadyOnRoster })}</li>
            ) : null}
            {counts.duplicateInBatch > 0 ? (
              <li>{t("duplicates", { count: counts.duplicateInBatch })}</li>
            ) : null}
            {counts.unusable > 0 ? <li>{t("unusable", { count: counts.unusable })}</li> : null}
          </ul>

          {ambiguous.length > 0 ? (
            <div className="mt-3" data-testid="people-import-ambiguous">
              <h5 className="text-meta font-medium text-text-primary">{t("ambiguousTitle")}</h5>
              <p className="text-meta text-text-secondary">{t("ambiguousLead")}</p>
              {ambiguous.map((row) => {
                const d = row.disposition;
                if (d.kind !== "ambiguous") return null;
                return (
                  <fieldset key={row.index} className="mt-2 border-t border-ink-700 pt-2">
                    <legend className="text-meta text-text-primary">{row.source.name}</legend>
                    {d.candidates.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-meta text-text-secondary">
                        <input
                          type="radio"
                          name={`amb-${row.index}`}
                          checked={
                            resolutions[row.index]?.choice === "existing" &&
                            (resolutions[row.index] as { personId?: string }).personId === c.id
                          }
                          onChange={() =>
                            reprice({
                              ...resolutions,
                              [row.index]: { index: row.index, choice: "existing", personId: c.id },
                            })
                          }
                        />
                        {t("chooseExisting", { name: c.displayName })}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-meta text-text-secondary">
                      <input
                        type="radio"
                        name={`amb-${row.index}`}
                        checked={resolutions[row.index]?.choice === "new"}
                        onChange={() =>
                          reprice({
                            ...resolutions,
                            [row.index]: { index: row.index, choice: "new" },
                          })
                        }
                      />
                      {t("chooseNew")}
                    </label>
                  </fieldset>
                );
              })}
            </div>
          ) : null}

          <p className="mt-3 text-meta text-text-muted">{t("willNot")}</p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              data-testid="people-import-confirm"
              disabled={pending || !answered || counts.toCreate === 0}
              onClick={confirm}
              className="ua-press rounded-bubble bg-brand-champagne px-4 py-2 text-meta font-medium text-ink-900 disabled:opacity-50"
            >
              {pending ? t("committing") : t("confirm")}
            </button>
            <button
              type="button"
              data-testid="people-import-cancel"
              onClick={() => {
                // CANCEL WRITES NOTHING. The preview never wrote anything, so
                // there is nothing to undo — the state simply goes back.
                sourcesRef.current = [];
                setResolutions({});
                setStage({ kind: "idle" });
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="ua-press rounded-bubble border border-ink-500 px-4 py-2 text-meta text-text-secondary"
            >
              {t("cancel")}
            </button>
          </div>
          {counts.toCreate === 0 && ambiguous.length === 0 ? (
            <p className="mt-2 text-meta text-text-muted">{t("nothingToAdd")}</p>
          ) : null}
        </div>
      ) : null}

      {stage.kind === "done" ? (
        <div className="mt-4 border-t border-ink-600 pt-3" data-testid="people-import-receipt">
          <h4 className="text-body text-text-primary">{t("receiptTitle")}</h4>
          <p className="mt-1 text-meta text-text-secondary">
            {t("receipt", {
              created: stage.created,
              org: organizationName,
              existing: stage.existing,
              skipped: stage.skipped,
            })}
          </p>
        </div>
      ) : null}
    </section>
  );
}
