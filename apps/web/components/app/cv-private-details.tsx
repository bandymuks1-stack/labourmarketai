"use client";

import { useState } from "react";

/**
 * Per-export privacy toggle for the Verified CV (Full CV System v1).
 *
 * Salary expectation + availability are the worker's PRIVATE facts: they are
 * on the CV printout ONLY while this checkbox is ticked. Default OFF, state
 * is local-only (deliberately NOT persisted — the choice is per export/print,
 * not a saved setting). The checkbox row itself never prints (print:hidden);
 * the section prints only when the worker opted in.
 */

export interface CvPrivateDetailRow {
  label: string;
  value: string;
}

export function CvPrivateDetails({
  toggleLabel,
  title,
  rows,
}: {
  toggleLabel: string;
  title: string;
  /** Pre-localised label/value rows — only real saved facts (page filters). */
  rows: CvPrivateDetailRow[];
}) {
  const [include, setInclude] = useState(false);

  if (rows.length === 0) return null;

  return (
    <>
      {/* Screen-only control — never printed. */}
      <label
        className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 print:hidden"
        data-testid="cv-private-toggle"
      >
        <input
          type="checkbox"
          checked={include}
          onChange={(e) => setInclude(e.target.checked)}
        />
        {toggleLabel}
      </label>

      {include ? (
        <section
          className="flex flex-col gap-2"
          data-testid="cv-private-details"
        >
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-baseline gap-2">
                <dt className="text-xs text-zinc-500">{r.label}:</dt>
                <dd className="text-sm text-zinc-800">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </>
  );
}
