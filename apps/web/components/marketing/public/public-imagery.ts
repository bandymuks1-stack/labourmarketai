/**
 * PUBLIC IMAGERY REGISTRY — the single list of every photograph the public
 * acquisition surfaces (/, /for-workers, /for-companies) may show, with its
 * honest status. A public image that is not listed here is a bug (guarded by
 * `lib/guards/public-imagery-registry.test.ts`).
 *
 * STATUS
 *   sample_fixture   Synthetic persona photograph from the living-worker-hero
 *                    set (`scripts/hero/generate-living-worker-hero.mjs`,
 *                    manifest `lib/marketing/living-worker-hero.manifest.json`).
 *                    The person is FICTIONAL. Every use renders the "Example"
 *                    mark and never presents the person as a real user.
 *                    NEEDS REPLACEMENT with real or licensed marketing
 *                    photography before paid acquisition traffic; swapping is
 *                    a one-line change here (src/width/height) — nothing else
 *                    in the pages names a file.
 *   marketing_photo  Licensed / commissioned public marketing photography.
 *   real_portrait    A real user's portrait (consented; product surfaces only).
 *
 * FALLBACK. The UI never depends on imagery: `ProfessionalPortrait` renders a
 * premium initials mark when no portrait exists, and the hero keeps its full
 * composition (type + CTA) with the photo slot collapsed.
 */
export type ImageryStatus = "sample_fixture" | "marketing_photo" | "real_portrait";

export type PublicImage = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly status: ImageryStatus;
  readonly altKey: "tomasAlt" | "rasaAlt";
  readonly captionKey: "tomasCaption" | "rasaCaption";
  /** Horizontal focus of the person in the frame (0–100), for object-position. */
  readonly focusX: number;
};

export const PUBLIC_IMAGERY = {
  /** A scaffolder on a facade scaffold — the construction example. */
  site: {
    src: "/hero/tomas/02-site-lt-960.webp",
    width: 960,
    height: 644,
    status: "sample_fixture",
    altKey: "tomasAlt",
    captionKey: "tomasCaption",
    focusX: 50,
  },
  /** A cook at the pass — the hospitality example (not construction-only). */
  kitchen: {
    src: "/hero/rasa/02-kitchen-lt-960.webp",
    width: 960,
    height: 644,
    status: "sample_fixture",
    altKey: "rasaAlt",
    captionKey: "rasaCaption",
    focusX: 50,
  },
} as const satisfies Record<string, PublicImage>;

export type PublicImageKey = keyof typeof PUBLIC_IMAGERY;
