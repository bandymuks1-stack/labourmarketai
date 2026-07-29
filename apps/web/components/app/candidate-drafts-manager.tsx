"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  CANDIDATE_DRAFT_STATUSES,
  type CandidateDraft,
  type CandidateDraftStatus,
} from "@/lib/candidates/candidate-draft-types";
import {
  createCandidateDraftAction,
  deleteCandidateDraftAction,
  updateCandidateDraftAction,
} from "@/lib/candidates/actions";

/**
 * Candidate / provider drafts manager (slice candidate-provider-draft-v1).
 *
 * Honest by construction: a draft is the manager's private working note about an
 * unregistered person/provider. It is clearly labelled NOT registered / NOT
 * verified / draft / can be linked later. Creating or editing a draft never
 * creates a user account, acceptance, consent, verification, or document, and a
 * draft cannot be assigned to a project until it is linked to a real account.
 */

export interface CandidateDraftsLabels {
  eyebrow: string;
  title: string;
  intro: string;
  honestyNote: string;
  labelNotRegistered: string;
  labelNotVerified: string;
  labelDraft: string;
  labelCanLinkLater: string;
  linkedNote: string;
  notAssignableNote: string;
  // create form
  createTitle: string;
  nameLabel: string;
  namePlaceholder: string;
  contactLabel: string;
  contactPlaceholder: string;
  professionLabel: string;
  professionPlaceholder: string;
  languageLabel: string;
  languagePlaceholder: string;
  skillsLabel: string;
  skillsPlaceholder: string;
  notesLabel: string;
  notesPlaceholder: string;
  statusLabel: string;
  create: string;
  creating: string;
  // list
  listTitle: string;
  empty: string;
  save: string;
  saving: string;
  delete: string;
  saved: string;
  saveError: string;
  needsMigration: string;
  statusLabels: Record<CandidateDraftStatus, string>;
}

function HonestChips({ labels, linked }: { labels: CandidateDraftsLabels; linked: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="draft-honesty-chips">
      <span className="rounded-full border border-ink-600 px-2 py-0.5 text-meta uppercase tracking-label text-text-muted">
        {labels.labelDraft}
      </span>
      <span className="rounded-full border border-ink-600 px-2 py-0.5 text-meta uppercase tracking-label text-text-muted">
        {labels.labelNotRegistered}
      </span>
      <span className="rounded-full border border-ink-600 px-2 py-0.5 text-meta uppercase tracking-label text-text-muted">
        {labels.labelNotVerified}
      </span>
      <span className="rounded-full border border-ink-600 px-2 py-0.5 text-meta uppercase tracking-label text-text-muted">
        {linked ? labels.linkedNote : labels.labelCanLinkLater}
      </span>
    </div>
  );
}

function CreateForm({ labels }: { labels: CandidateDraftsLabels }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    nameOrTitle: "",
    contact: "",
    professionService: "",
    language: "",
    skillsText: "",
    notes: "",
    status: "draft" as CandidateDraftStatus,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (form.nameOrTitle.trim() === "") return;
    setMsg(null);
    startTransition(async () => {
      const res = await createCandidateDraftAction(form);
      if (res.ok) {
        setForm({
          nameOrTitle: "",
          contact: "",
          professionService: "",
          language: "",
          skillsText: "",
          notes: "",
          status: "draft",
        });
        router.refresh();
      } else {
        setMsg(res.code === "needs_migration" ? labels.needsMigration : labels.saveError);
      }
    });
  };

  const field = "rounded-md border border-ink-600 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary";

  return (
    <section className="card-border flex flex-col gap-3 p-4" data-testid="candidate-draft-create">
      <h2 className="font-display text-lg font-semibold text-text-primary">{labels.createTitle}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-meta text-text-muted">
          {labels.nameLabel}
          <input className={field} value={form.nameOrTitle} onChange={set("nameOrTitle")} placeholder={labels.namePlaceholder} data-testid="draft-name-input" />
        </label>
        <label className="flex flex-col gap-1 text-meta text-text-muted">
          {labels.contactLabel}
          <input className={field} value={form.contact} onChange={set("contact")} placeholder={labels.contactPlaceholder} />
        </label>
        <label className="flex flex-col gap-1 text-meta text-text-muted">
          {labels.professionLabel}
          <input className={field} value={form.professionService} onChange={set("professionService")} placeholder={labels.professionPlaceholder} />
        </label>
        <label className="flex flex-col gap-1 text-meta text-text-muted">
          {labels.languageLabel}
          <input className={field} value={form.language} onChange={set("language")} placeholder={labels.languagePlaceholder} />
        </label>
        <label className="flex flex-col gap-1 text-meta text-text-muted sm:col-span-2">
          {labels.skillsLabel}
          <input className={field} value={form.skillsText} onChange={set("skillsText")} placeholder={labels.skillsPlaceholder} />
        </label>
        <label className="flex flex-col gap-1 text-meta text-text-muted sm:col-span-2">
          {labels.notesLabel}
          <textarea className={field} value={form.notes} onChange={set("notes")} placeholder={labels.notesPlaceholder} rows={2} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || form.nameOrTitle.trim() === ""}
          className="rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
          data-testid="draft-create-submit"
        >
          {pending ? labels.creating : labels.create}
        </button>
        {msg ? <span className="text-meta text-text-secondary">{msg}</span> : null}
      </div>
    </section>
  );
}

function DraftCard({ draft, labels }: { draft: CandidateDraft; labels: CandidateDraftsLabels }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<CandidateDraftStatus>(draft.status);
  const [msg, setMsg] = useState<string | null>(null);

  const onResult = (res: { ok: boolean; code?: string }) => {
    if (res.ok) {
      setMsg(labels.saved);
      router.refresh();
    } else {
      setMsg(res.code === "needs_migration" ? labels.needsMigration : labels.saveError);
    }
  };

  const saveStatus = (next: CandidateDraftStatus) => {
    setStatus(next);
    startTransition(async () => onResult(await updateCandidateDraftAction(draft.id, { status: next })));
  };
  const remove = () =>
    startTransition(async () => onResult(await deleteCandidateDraftAction(draft.id)));

  return (
    <article className="card-border flex flex-col gap-2 p-4" data-testid="candidate-draft-card">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-text-primary">{draft.nameOrTitle}</h3>
        <select
          aria-label={labels.statusLabel}
          value={status}
          disabled={pending}
          onChange={(e) => saveStatus(e.target.value as CandidateDraftStatus)}
          className="rounded-md border border-ink-600 bg-ink-800/40 px-2 py-1 text-xs text-text-primary"
          data-testid="draft-status-select"
        >
          {CANDIDATE_DRAFT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {labels.statusLabels[s]}
            </option>
          ))}
        </select>
      </header>
      <HonestChips labels={labels} linked={Boolean(draft.linkedProfileId)} />
      <dl className="grid grid-cols-1 gap-1 text-meta sm:grid-cols-2">
        {draft.professionService ? (
          <div>
            <dt className="text-text-muted">{labels.professionLabel}</dt>
            <dd className="text-text-primary">{draft.professionService}</dd>
          </div>
        ) : null}
        {draft.contact ? (
          <div>
            <dt className="text-text-muted">{labels.contactLabel}</dt>
            <dd className="text-text-primary">{draft.contact}</dd>
          </div>
        ) : null}
        {draft.language ? (
          <div>
            <dt className="text-text-muted">{labels.languageLabel}</dt>
            <dd className="text-text-primary">{draft.language}</dd>
          </div>
        ) : null}
        {draft.skillsText ? (
          <div className="sm:col-span-2">
            <dt className="text-text-muted">{labels.skillsLabel}</dt>
            <dd className="text-text-primary">{draft.skillsText}</dd>
          </div>
        ) : null}
        {draft.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-text-muted">{labels.notesLabel}</dt>
            <dd className="text-text-secondary">{draft.notes}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-meta leading-relaxed text-text-muted">{labels.notAssignableNote}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="text-meta text-text-secondary hover:text-state-danger disabled:opacity-50"
          data-testid="draft-delete"
        >
          {labels.delete}
        </button>
        {msg ? <span className="text-meta text-text-secondary">{msg}</span> : null}
      </div>
    </article>
  );
}

export function CandidateDraftsManager({
  drafts,
  labels,
  needsMigration,
}: {
  drafts: CandidateDraft[];
  labels: CandidateDraftsLabels;
  needsMigration: boolean;
}) {
  return (
    <div className="flex flex-col gap-6" data-testid="candidate-drafts-manager">
      <header className="flex flex-col gap-1">
        <span className="font-mono text-meta uppercase tracking-label text-brand-cyan">
          {labels.eyebrow}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {labels.title}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{labels.intro}</p>
        <p
          className="rounded-md border border-ink-600 bg-ink-800/40 p-3 text-meta leading-relaxed text-text-muted"
          data-testid="candidate-drafts-honesty"
        >
          {labels.honestyNote}
        </p>
      </header>

      {needsMigration ? (
        <p className="card-border p-4 text-sm text-text-secondary" data-testid="candidate-drafts-needs-migration">
          {labels.needsMigration}
        </p>
      ) : (
        <>
          <CreateForm labels={labels} />
          <section className="flex flex-col gap-3">
            <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
              {labels.listTitle}
            </h2>
            {drafts.length === 0 ? (
              <p className="card-border p-4 text-sm text-text-secondary" data-testid="candidate-drafts-empty">
                {labels.empty}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {drafts.map((d) => (
                  <DraftCard key={d.id} draft={d} labels={labels} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
