import { Images } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";

/**
 * Company gallery entry (F13). NOT a second photo system: a compact list of
 * the company's own projects with their real photo counts (existing
 * journal-photo projection, same RLS), each opening the exact project
 * gallery. Honest empty state when there are no projects/photos yet.
 */
export interface CompanyGalleryLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly photosLabel: string;
  readonly openLabel: string;
  readonly empty: string;
}

export type CompanyGalleryProjectRow = {
  projectId: string;
  title: string | null;
  photoCount: number;
};

export function CompanyGallerySection({
  projects,
  labels,
}: {
  projects: readonly CompanyGalleryProjectRow[];
  labels: CompanyGalleryLabels;
}) {
  return (
    <section
      className="card-border flex flex-col gap-3 p-5"
      data-testid="company-gallery-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <Images className="h-4 w-4 text-brand-blue" aria-hidden />
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
      </header>
      {projects.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 px-3 py-3 text-xs leading-relaxed text-text-muted"
          data-testid="company-gallery-empty"
        >
          {labels.empty}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {projects.map((p) => (
            // `min-w-0` is LOAD-BEARING and its absence was measured, not
            // guessed: a grid item's default `min-width: auto` floors it at
            // max-content, so this <li> rendered 427px wide inside a 301px
            // grid at 375px and pushed `document.body.scrollWidth` to 464 —
            // 89px of horizontal overflow on the whole company page. The
            // `truncate` on the title below could never engage, because the
            // item it lives in never shrank. Same defect the dashboard nav row
            // documents at length; same one-class fix.
            <li key={p.projectId} className="min-w-0">
              <Link
                href={
                  `/dashboard/projects/${p.projectId}#project-gallery` as "/dashboard"
                }
                data-testid={`company-gallery-project-${p.projectId}`}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2.5 text-sm text-text-primary transition-colors hover:border-brand-blue"
              >
                <span className="truncate font-medium">{p.title ?? "—"}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-meta text-text-secondary">
                  <Images className="h-3.5 w-3.5" aria-hidden />
                  {p.photoCount} · {labels.openLabel} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
