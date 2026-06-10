/**
 * Viewer-language resolution for user-authored messages — STUB INTERFACE.
 *
 * Doctrine §2: author content is stored as original text + original language;
 * translations happen on READ and are never stored. The real translation
 * pipeline is a later, owner-gated layer. THIS IS A CLEAN STUB: it NEVER
 * fabricates a translation — when no translation exists (always, today) the
 * viewer sees the ORIGINAL text, with a language badge when the message's
 * language is known and differs from the viewer's locale.
 *
 * Pure module — replacing the stub later means changing ONE function body
 * without touching any caller.
 */

export interface ViewerText {
  /** What to render — today ALWAYS the original text, never fake-translated. */
  readonly text: string;
  /** 'original' is the only kind the stub produces; a future pipeline adds
   *  'translated' WITH provenance. */
  readonly kind: "original";
  /** Show "original language" badge: language known and ≠ viewer locale. */
  readonly languageBadge: string | null;
}

export function resolveViewerText(args: {
  body: string;
  originalLanguage: string | null;
  viewerLocale: string;
}): ViewerText {
  const lang = args.originalLanguage?.trim().toLowerCase() || null;
  return {
    text: args.body,
    kind: "original",
    languageBadge: lang && lang !== args.viewerLocale.toLowerCase() ? lang : null,
  };
}
