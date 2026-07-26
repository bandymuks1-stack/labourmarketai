// Typography — TYPOGRAPHY DECISION LOCK (DI approved, research-backed,
// 2026-06-12; extends the TASK 07 lock of 2026-06-11). Four roles:
//
//   display — Bricolage Grotesque   headings / cards
//   body/UI — Inter                 body text + all UI controls
//   mono    — JetBrains Mono        numbers / labels
//   accent  — Instrument Serif      ACCENT ONLY: hero headlines, pull quotes,
//                                   founder-moment empty states; min size
//                                   ~28px; NEVER body or UI text.
//
// Why Inter stays as body: screen-legibility research (a low-vision review of
// 18 studies, dyslexia studies, eye-tracking) favors a dedicated UI sans for
// body text; Instrument Serif is a single-weight condensed display face
// designed for large sizes only and is unsuitable for body/UI text.
// Distinctiveness lives in Bricolage Grotesque (display) and the token
// system, not the body font.
//
// Font CSS vars are wired in app/[locale]/layout.tsx via next/font; swapping
// a font is a token swap there — components never name a typeface. Guarded by
// lib/guards/design-tokens.test.ts (raw typeface names outside this file +
// the layout wiring fail CI; Instrument Serif outside whitelisted accent
// contexts fails CI).
export const typography = {
  fontFamily: {
    // Cyrillic fallback (RU locale): Bricolage Grotesque has no cyrillic
    // subset, so the display stack falls back to Inter (var(--font-sans),
    // loaded with the cyrillic subset in layout.tsx) BEFORE any system face.
    // Per-glyph font matching makes this exact: latin glyphs render in
    // Bricolage, Cyrillic glyphs in Inter — never a browser-picked serif.
    display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
    sans: ["var(--font-sans)", "system-ui", "sans-serif"],
    mono: ["var(--font-mono)", "ui-monospace", "monospace"],
  },
  letterSpacing: {
    // hero/display headings
    tightest: "-0.02em",
    // mono small-caps labels
    label: "0.12em",
  },

  /**
   * SEMANTIC TYPE LADDER (UX 2.0).
   *
   * Before this, the conversation surface — the product's primary screen — had
   * no scale at all: its largest type was 14px, it carried six `10px` strings,
   * and it never once used the display face. Uniform small type is the visual
   * signature of admin software, which is why the screen read as a record
   * viewer instead of a conversation.
   *
   * Named by ROLE, not by size, so a component states what a string IS and the
   * ladder stays the single place sizes are decided — no hand-rolled
   * `text-[13px]` in components.
   *
   * Floor: 12px. Nothing smaller ships on a product surface.
   * Reference: ChatGPT / Claude set message bodies at ~16px.
   */
  fontSize: {
    /** 12px — timestamps and mono micro-labels. The absolute floor. */
    meta: ["0.75rem", { lineHeight: "1.5" }],
    /** 13px — the §19 basis / provenance line and card sub-facts. */
    basis: ["0.8125rem", { lineHeight: "1.55" }],
    /** 14px — supporting prose and secondary card copy. */
    support: ["0.875rem", { lineHeight: "1.6" }],
    /** 16px — conversation message body. The most-read size in the product. */
    body: ["1rem", { lineHeight: "1.6" }],
    /** 17px — structured card titles (display face, short strings only). */
    "card-title": ["1.0625rem", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
    /** 22px — the conversation greeting on phones. */
    title: ["1.375rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
    /** 28px — the conversation greeting from `sm:` up. */
    "title-lg": ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.022em" }],
  },
} as const;
