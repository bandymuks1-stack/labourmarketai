/**
 * THE IDENTITY VIEW-MODELS — the neutral shapes the one identity family
 * (`components/app/identity/identity-family.tsx`) draws, for real routes and
 * the design-proof fixtures alike. They carry only what a mark needs:
 * an id (the deterministic tone), a name the reader supplied, and media the
 * SERVER already resolved to a URL.
 *
 * Privacy stays with the reader, never the mark: an anonymous subject is
 * passed with `anonymous: true` and NO photo, so there is nothing for the
 * view to leak (`getAvatarForVisibleWorker` and the shortlist-safe previews
 * decide what may be shown; this module only types the result).
 */

export type IdentityPhoto = {
  /** A URL the server already authorised (signed or public) — never a path. */
  readonly src: string;
  /** Focal point 0..1; centred when the reader does not know one. */
  readonly face?: { readonly x: number; readonly y: number };
};

export type PersonIdentity = {
  readonly id: string;
  readonly name: string;
  readonly photo?: IdentityPhoto | null;
  readonly anonymous?: boolean;
};

export type CompanyIdentity = {
  readonly id: string;
  readonly name: string;
  /** An authorised logo URL when the company has one. */
  readonly logoUrl?: string | null;
  /** Inline SVG mark (design-proof fixtures); a real logo is `logoUrl`. */
  readonly logo?: { readonly path: string; readonly viewBox?: string } | null;
};

export type ProjectIdentity = {
  readonly id: string;
  readonly name: string;
  readonly media?: { readonly src: string; readonly pos?: string } | null;
};
