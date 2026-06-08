"use client";

import { useState } from "react";

/**
 * "Taip jus galėtų matyti darbdavys" — a calm, read-only preview of how the
 * worker's OWN saved work-card data would read to an employer browsing the
 * directory (slice employer-preview-v1).
 *
 * Honest by construction: it renders ONLY real, already-saved values passed in
 * from the work card. It is NOT a match, NOT a score, NOT a claim that any
 * employer is looking — it simply mirrors the worker's data back to them so the
 * value of completing the card is tangible ("why is this useful to me"). Rows
 * with no saved value are shown as a muted "not set yet", never fabricated.
 *
 * Secondary by design: a collapsed toggle, never a primary CTA.
 */

export interface EmployerPreviewRow {
  label: string;
  value: string | null;
}

export interface EmployerPreviewLabels {
  toggle: string;
  title: string;
  intro: string;
  notSet: string;
  unverifiedNote: string;
}

export function EmployerPreview({
  rows,
  labels,
}: {
  rows: EmployerPreviewRow[];
  labels: EmployerPreviewLabels;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div data-testid="employer-preview">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue"
        data-testid="employer-preview-toggle"
      >
        {labels.toggle}
      </button>

      {open && (
        <div
          className="mt-3 flex flex-col gap-3 rounded-md border border-brand-blue/30 bg-brand-blue/5 p-4"
          data-testid="employer-preview-panel"
        >
          <div className="flex flex-col gap-1">
            <p className="font-display text-sm font-semibold text-text-primary">
              {labels.title}
            </p>
            <p className="text-xs leading-relaxed text-text-secondary">
              {labels.intro}
            </p>
          </div>

          <dl className="flex flex-col divide-y divide-ink-600/60">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex items-start justify-between gap-3 py-2"
              >
                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {r.label}
                </dt>
                <dd
                  className={
                    r.value
                      ? "text-right text-sm text-text-primary"
                      : "text-right text-sm text-text-muted"
                  }
                >
                  {r.value ?? labels.notSet}
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-[11px] leading-relaxed text-text-muted">
            {labels.unverifiedNote}
          </p>
        </div>
      )}
    </div>
  );
}
