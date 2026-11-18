"use client";

import { useState, useTransition } from "react";
import { saveWorkerPublicSummary } from "@/lib/worker/public-summary-actions";

const HEADLINE_MAX = 120;
const BIO_MAX = 1000;

/**
 * The person's employer-facing summary (PER-2). Who reads it is said above the
 * fields, before anything is typed; saving is explicit; nothing is mirrored from
 * the private profile text.
 */
export function WorkerPublicSummaryEditor({
  initialHeadline,
  initialBio,
  labels,
}: {
  initialHeadline: string;
  initialBio: string;
  labels: {
    title: string;
    audience: string;
    headline: string;
    headlinePlaceholder: string;
    bio: string;
    bioPlaceholder: string;
    save: string;
    saved: string;
    tooLong: string;
    error: string;
  };
}) {
  const [headline, setHeadline] = useState(initialHeadline);
  const [bio, setBio] = useState(initialBio);
  // what the server holds now — moves on every successful save
  const [saved, setSaved] = useState({ headline: initialHeadline, bio: initialBio });
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | "too-long" | "error">("idle");
  const dirty = headline.trim() !== saved.headline || bio.trim() !== saved.bio;

  return (
    <section id="profile-public-summary" className="flex scroll-mt-20 flex-col gap-3" data-testid="profile-public-summary">
      <div>
        <p className="text-sm font-medium text-text-primary">{labels.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{labels.audience}</p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await saveWorkerPublicSummary({ headline, bio });
            if (res.kind === "saved") setSaved({ headline: headline.trim(), bio: bio.trim() });
            setState(res.kind === "saved" ? "saved" : res.kind === "too-long" ? "too-long" : "error");
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {labels.headline}
          <input
            value={headline}
            onChange={(e) => {
              setHeadline(e.target.value);
              setState("idle");
            }}
            maxLength={HEADLINE_MAX}
            placeholder={labels.headlinePlaceholder}
            data-testid="profile-public-headline"
            className="min-h-11 rounded-md border border-ink-500 bg-ink-800/40 px-3 text-sm text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {labels.bio}
          <textarea
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              setState("idle");
            }}
            maxLength={BIO_MAX}
            rows={4}
            placeholder={labels.bioPlaceholder}
            data-testid="profile-public-bio"
            className="rounded-md border border-ink-500 bg-ink-800/40 p-3 text-sm text-text-primary"
          />
          <span className="self-end font-mono text-meta text-text-muted">
            {bio.length}/{BIO_MAX}
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !dirty}
            data-testid="profile-public-summary-save"
            className="inline-flex min-h-11 items-center rounded-md border border-brand-blue/50 px-4 text-sm font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
          >
            {labels.save}
          </button>
          {state === "saved" && !dirty ? (
            <span role="status" className="text-xs text-state-success" data-testid="profile-public-summary-saved">
              {labels.saved}
            </span>
          ) : null}
          {state === "too-long" || state === "error" ? (
            <span role="alert" className="text-xs text-state-warning" data-testid="profile-public-summary-error">
              {state === "too-long" ? labels.tooLong : labels.error}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
