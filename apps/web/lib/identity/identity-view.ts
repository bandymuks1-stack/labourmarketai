/**
 * THE IDENTITY VIEW-MODELS — the neutral shapes the one identity family
 * (`components/app/identity/identity-family.tsx`) draws. They carry only what
 * a mark needs: an id (the deterministic plate tone), a name the reader
 * supplied, and media the SERVER already resolved to a URL.
 *
 * Privacy stays with the reader, never the mark: another person's photo
 * reaches a view only through `getAvatarForVisibleWorker` (decision D1,
 * 2026-09-30 — the database decides, under the viewer's own session) or the
 * viewer's own `getOwnAvatar`. An anonymous subject is passed with
 * `anonymous: true`, and the family draws it with NO photo whatever the
 * caller passes, so there is nothing for the view to leak.
 *
 * Ported from the owner-frozen design class (branch
 * `feat/cc/visual-language-proof`, e5413f896) — D2, 2026-10-14.
 */

export type IdentityPhoto = {
  /** A URL the server already authorised (signed or public) — never a path. */
  readonly src: string;
  /** Focal point 0..1; centred-high when the reader does not know one. */
  readonly face?: { readonly x: number; readonly y: number };
};

export type PersonIdentity = {
  /** Stable id (worker / profile / row id). Picks the plate tone only. */
  readonly id: string;
  /** The display name the reader resolved. Empty = no name (neutral "•"). */
  readonly name: string;
  readonly photo?: IdentityPhoto | null;
  readonly anonymous?: boolean;
};

export type CompanyIdentity = {
  readonly id: string;
  readonly name: string;
  /** An authorised logo URL when the company has one. */
  readonly logoUrl?: string | null;
};

export type ProjectIdentity = {
  readonly id: string;
  readonly name: string;
  /** A real site photograph the server authorised; never generated. */
  readonly media?: { readonly src: string; readonly pos?: string } | null;
};
