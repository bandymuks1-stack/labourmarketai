"use client";

import { useRef, useState, useTransition } from "react";

import { DISPLAYED_WORKSPACE_FIELD } from "@/lib/company/organization-switch";
import { useDisplayedWorkspaceId } from "@/components/app/workspace/displayed-workspace-field";
import { uploadEvidenceMediaAction } from "@/lib/organization-evidence/evidence-media-actions";
import {
  EVIDENCE_MEDIA_ACTION_MAX_BYTES,
  type PhotoAnchorChoice,
  type PhotoAnchorKind,
} from "@/lib/organization-evidence/evidence-media-model";

/**
 * HISTORICAL PHOTO IMPORT - the interactive shell only.
 *
 * It holds no domain rule: every file is sent, one per call, to
 * `uploadEvidenceMediaAction`, which resolves the organization server-side and
 * writes through `registerEvidenceMedia` under the caller's own RLS session.
 *
 * What the manager STATES, and nothing else, is stored:
 *   - ONE anchor (a record, a place, a person, or the organization itself);
 *   - the source system and an optional source reference;
 *   - optionally ONE date with the basis it came from, applied to every file
 *     of this batch. Left empty the date is stored as UNKNOWN.
 * The browser file-modified timestamp is never read and the file
 * name is never parsed for a date or an anchor: it is kept as provenance only.
 */

export interface HistoricalPhotoImportLabels {
  readonly anchorKind: string;
  readonly kinds: Readonly<Record<PhotoAnchorKind, string>>;
  readonly chooseAnchor: Readonly<Record<Exclude<PhotoAnchorKind, "organization">, string>>;
  readonly noChoices: Readonly<Record<Exclude<PhotoAnchorKind, "organization">, string>>;
  readonly truncated: string;
  readonly sourceSystem: string;
  readonly sourceSystemHint: string;
  readonly sourceReference: string;
  readonly files: string;
  readonly filesHint: string;
  readonly date: string;
  readonly dateHint: string;
  readonly basis: string;
  readonly bases: Readonly<Record<"organization_stated" | "source_metadata" | "exif", string>>;
  readonly caption: string;
  readonly submit: string;
  readonly working: string;
  readonly resultTitle: string;
  readonly registered: string;
  readonly duplicate: string;
  readonly refusals: Readonly<Record<string, string>>;
  readonly tooLarge: string;
  readonly dateNeedsBasis: string;
  readonly pickAnchor: string;
}

type Choices = Readonly<Record<Exclude<PhotoAnchorKind, "organization">, readonly PhotoAnchorChoice[]>>;

type Outcome = { readonly name: string; readonly status: string };

const field = "w-full rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary";
const labelText = "font-mono text-meta uppercase tracking-label text-text-muted";
const button =
  "rounded-md border border-brand-orange/50 bg-brand-orange/10 px-4 py-2 text-sm font-semibold text-brand-orange disabled:opacity-50";

const KINDS: readonly PhotoAnchorKind[] = ["record", "place", "person", "organization"];

export function HistoricalPhotoImportForm({
  labels,
  choices,
  truncated,
}: {
  labels: HistoricalPhotoImportLabels;
  choices: Choices;
  truncated: Readonly<Record<Exclude<PhotoAnchorKind, "organization">, boolean>>;
}) {
  const workspaceId = useDisplayedWorkspaceId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<PhotoAnchorKind>("place");
  const [anchorId, setAnchorId] = useState("");
  const [source, setSource] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [basis, setBasis] = useState("organization_stated");
  const [caption, setCaption] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<readonly Outcome[]>([]);
  const [pending, startTransition] = useTransition();

  const list = kind === "organization" ? [] : choices[kind];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setOutcomes([]);
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return;
    if (kind !== "organization" && !anchorId) {
      setMessage(labels.pickAnchor);
      return;
    }
    if (!source.trim()) {
      setMessage(labels.refusals.invalid ?? labels.refusals.error);
      return;
    }
    // A date is accepted only together with its basis; empty stays unknown.
    if (date && !basis) {
      setMessage(labels.dateNeedsBasis);
      return;
    }
    startTransition(async () => {
      const done: Outcome[] = [];
      for (const file of files) {
        if (file.size > EVIDENCE_MEDIA_ACTION_MAX_BYTES) {
          done.push({ name: file.name, status: labels.tooLarge });
          continue;
        }
        const fd = new FormData();
        if (workspaceId) fd.append(DISPLAYED_WORKSPACE_FIELD, workspaceId);
        fd.append("file", file);
        fd.append("anchorKind", kind);
        if (kind !== "organization") fd.append("anchorId", anchorId);
        fd.append("sourceSystem", source.trim());
        if (reference.trim()) fd.append("sourceReference", reference.trim());
        if (date) {
          fd.append("originalTakenAt", date);
          fd.append("takenAtBasis", basis);
        }
        if (caption.trim()) fd.append("caption", caption.trim());
        let status: string;
        try {
          const res = await uploadEvidenceMediaAction(fd);
          status = res.ok
            ? res.outcome === "registered"
              ? labels.registered
              : labels.duplicate
            : (labels.refusals[res.code] ?? labels.refusals.error);
        } catch {
          status = labels.refusals.error;
        }
        done.push({ name: file.name, status });
        setOutcomes([...done]);
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="historical-photo-import-form">
      <fieldset className="flex flex-col gap-2">
        <legend className={labelText}>{labels.anchorKind}</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <label
              key={k}
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${
                kind === k ? "border-brand-blue bg-brand-blue/10 text-text-primary" : "border-ink-600 text-text-secondary"
              }`}
            >
              <input
                type="radio"
                name="anchorKind"
                value={k}
                checked={kind === k}
                onChange={() => {
                  setKind(k);
                  setAnchorId("");
                }}
                className="sr-only"
                data-testid={`historical-photo-kind-${k}`}
              />
              {labels.kinds[k]}
            </label>
          ))}
        </div>
      </fieldset>

      {kind !== "organization" ? (
        list.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="historical-photo-no-choices">
            {labels.noChoices[kind]}
          </p>
        ) : (
          <label className="flex flex-col gap-1">
            <span className={labelText}>{labels.chooseAnchor[kind]}</span>
            <select
              className={field}
              value={anchorId}
              onChange={(e) => setAnchorId(e.target.value)}
              required
              data-testid="historical-photo-anchor"
            >
              <option value="" />
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {truncated[kind] ? <span className="text-xs text-text-muted">{labels.truncated}</span> : null}
          </label>
        )
      ) : null}

      <label className="flex flex-col gap-1">
        <span className={labelText}>{labels.sourceSystem}</span>
        <input
          className={field}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          maxLength={80}
          required
          data-testid="historical-photo-source"
        />
        <span className="text-xs text-text-muted">{labels.sourceSystemHint}</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelText}>{labels.sourceReference}</span>
        <input className={field} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={500} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelText}>{labels.date}</span>
          <input
            type="date"
            className={field}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="historical-photo-date"
          />
          <span className="text-xs text-text-muted">{labels.dateHint}</span>
        </label>
        {date ? (
          <label className="flex flex-col gap-1">
            <span className={labelText}>{labels.basis}</span>
            <select
              className={field}
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              data-testid="historical-photo-basis"
            >
              {(["organization_stated", "source_metadata", "exif"] as const).map((b) => (
                <option key={b} value={b}>
                  {labels.bases[b]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelText}>{labels.caption}</span>
        <input className={field} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={1000} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelText}>{labels.files}</span>
        <input
          ref={fileRef}
          type="file"
          multiple
          required
          accept="image/jpeg,image/png,image/webp,image/heic"
          className={field}
          data-testid="historical-photo-files"
        />
        <span className="text-xs text-text-muted">{labels.filesHint}</span>
      </label>

      <div>
        <button type="submit" className={button} disabled={pending} data-testid="historical-photo-submit">
          {pending ? labels.working : labels.submit}
        </button>
      </div>

      <p role="alert" className={message ? "text-xs text-state-warning" : "sr-only"} data-testid="historical-photo-message">
        {message}
      </p>

      {outcomes.length > 0 ? (
        <section aria-label={labels.resultTitle} data-testid="historical-photo-results">
          <h3 className={labelText}>{labels.resultTitle}</h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {outcomes.map((o, i) => (
              <li key={`${o.name}-${i}`} className="flex flex-wrap gap-x-2">
                <span className="min-w-0 truncate font-medium text-text-primary">{o.name}</span>
                <span className="text-text-secondary">{o.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </form>
  );
}
