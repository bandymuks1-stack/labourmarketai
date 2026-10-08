import { getTranslations } from "next-intl/server";
import { Images } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import {
  readEvidenceMedia,
  readEvidenceMediaForProject,
  type EvidenceMediaRead,
  type EvidenceMediaView,
} from "@/lib/organization-evidence/evidence-media-read";
import { signEvidenceMediaUrls } from "@/lib/organization-evidence/evidence-media-serve";

/**
 * HISTORICAL PHOTOS, BY THEIR STATED ANCHOR.
 *
 * Shows the photos an organization supplied from its own records, attached to
 * ONE project (through its work objects) or ONE roster person. Read through the
 * viewer's own RLS session; previews are short-lived signed URLs minted under
 * the same session. Nothing here matches a photo by date proximity or guesses
 * a relationship.
 *
 * Honest states, never conflated:
 *   unprovisioned  the table does not exist in this environment -> renders nothing
 *   unavailable    a failed read -> an ERROR state (never "no photos")
 *   empty          a real read that found none -> an honest empty line
 *   ready          the photos, each with its ORIGINAL date + the basis it came
 *                  from ("unknown" stays "unknown"), the source system, and the
 *                  fixed "reported, not verified" label
 * A photo whose preview cannot be minted says "preview unavailable"; it is
 * never a broken image and never rendered as missing from the record.
 */

const SHOWN = 24;

export type EvidenceMediaStripAnchor =
  | { readonly kind: "project"; readonly projectId: string }
  | { readonly kind: "person"; readonly organizationPersonId: string };

export async function EvidenceMediaStrip({
  locale,
  anchor,
}: {
  locale: string;
  anchor: EvidenceMediaStripAnchor;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const caller = { supabase, userId: user.id, locale };

  const read: EvidenceMediaRead =
    anchor.kind === "project"
      ? await readEvidenceMediaForProject(caller, anchor.projectId)
      : await readEvidenceMedia(caller, { organizationPersonId: anchor.organizationPersonId });
  if (read.kind === "unprovisioned") return null;

  const t = await getTranslations("evidenceMedia");

  const heading = (suffix = "") => (
    <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
      <Images className="h-3.5 w-3.5" aria-hidden />
      {t("title")}
      {suffix}
    </h2>
  );

  if (read.kind === "unavailable") {
    return (
      <section className="flex flex-col gap-3" data-testid="evidence-media" data-status="unavailable">
        {heading()}
        <Card variant="error" compact>
          <p className="text-sm text-text-secondary" data-testid="evidence-media-unavailable">
            {t("unavailable")}
          </p>
        </Card>
      </section>
    );
  }

  if (read.media.length === 0) {
    return (
      <section className="flex flex-col gap-3" data-testid="evidence-media" data-status="empty">
        {heading()}
        <p
          className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted"
          data-testid="evidence-media-empty"
        >
          {anchor.kind === "project" ? t("emptyProject") : t("emptyPerson")}
        </p>
      </section>
    );
  }

  const shown = read.media.slice(0, SHOWN);
  const urls = await signEvidenceMediaUrls(
    caller,
    shown.map((m) => m.id),
  );
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });

  const when = (m: EvidenceMediaView): string => {
    if (!m.originalTakenAt) return t("takenUnknown");
    const d = new Date(m.originalTakenAt);
    return Number.isNaN(d.getTime()) ? t("takenUnknown") : t("taken", { date: dateFmt.format(d) });
  };

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="evidence-media"
      data-status="ready"
      data-count={read.media.length}
    >
      {heading(` · ${read.media.length}`)}
      <p className="text-xs leading-relaxed text-text-secondary" data-testid="evidence-media-provenance">
        {t("provenance")}
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((m) => {
          const url = urls.get(m.id);
          return (
            <li
              key={m.id}
              className="card-border flex flex-col gap-2 overflow-hidden"
              data-testid="evidence-media-photo"
              data-taken-at-basis={m.takenAtBasis}
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={m.caption ?? t("photoAlt")}
                  className="aspect-[4/3] w-full bg-ink-800 object-cover"
                  loading="lazy"
                />
              ) : (
                <div
                  className="flex aspect-[4/3] w-full items-center justify-center bg-ink-800 px-3 text-center text-meta leading-relaxed text-text-muted"
                  data-testid="evidence-media-no-preview"
                >
                  {t("previewUnavailable")}
                </div>
              )}
              <div className="flex flex-col gap-1 px-3 pb-3">
                {m.caption ? <p className="text-sm text-text-secondary">{m.caption}</p> : null}
                <p className="font-mono text-meta text-text-secondary" data-testid="evidence-media-date">
                  {when(m)}
                  {m.originalTakenAt ? (
                    <span className="text-text-muted"> · {t(`basis.${m.takenAtBasis}` as never)}</span>
                  ) : null}
                </p>
                <p className="text-meta text-text-muted" data-testid="evidence-media-source">
                  {t("source", { system: m.sourceSystem })}
                </p>
                <p
                  className="font-mono text-meta uppercase tracking-label text-text-muted"
                  data-testid="evidence-media-reported"
                >
                  {t("reported")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {read.media.length > shown.length ? (
        <p className="text-meta text-text-muted" data-testid="evidence-media-more">
          {t("more", { n: read.media.length - shown.length })}
        </p>
      ) : null}
    </section>
  );
}
