# Living CV: owner visual reference (2026-11-24)

The owner provided two reference images for the worker Living CV, on desktop and phone:
`owner-reference-1.webp` and `owner-reference-2.webp`. They are the target look for `/[locale]/cv`. The
organization Living CV follows the same card language. This is binding owner direction, owner P0 2026-11-24.
It extends `docs/design/premium-design-map-v1.md` and `docs/design/player-identity-adaptation-plan.md`, and
does not replace them.

The images are **mock-ups with invented people and numbers**. They define layout and quality, not data.
Every value on the real page comes from the platform, or the element is not shown (decision 0023, decision
0025, doctrine §7).

## Layout (desktop 1440)

1. **Identity card (left):** a premium collectible-style portrait card with a dark surface and a gold frame.
   It shows the person's consented photo (else the monogram), the display name, the main profession, the
   country flag, and a short row of real facts.
2. **Header (right of the card):** the name, profession and specialisation, the availability status, the
   languages as chips, and the evidence badge. Actions on the right: **Download CV**, **Contact** and
   **Invite to project**, all reusing the existing actions.
3. **Fact strip:** years of experience, projects, hours worked. All three come from
   `lib/journal/professional-experience.ts`; UNKNOWN is shown as unknown, never as 0.
4. **Three panels:** competencies (evidenced skills), languages + qualifications, and a recommendation (only
   a real, confirmed review; otherwise the panel is not rendered).
5. **Tabs:** Overview · Experience · Projects · Photos · Documents · Reviews. These are the page's existing
   sections, reached by tabs; nothing is duplicated.
6. **Recent projects:** a carousel of project cards with a real evidence photo, title, country and period.
7. **Experience timeline (right):** organizations with period, hours and role, from the one history reader.
   Each hour is counted once.
8. **Confirmed vs unconfirmed:** a clear split, such as the reference's ring "confirmed 85% / unconfirmed
   15%", computed from the evidence states.

## Phone (390 / 375)

The card comes first, then the fact tiles, then **Invite to project** and **Contact**, then tabs and
sections stacked in the same order. Bottom navigation as on the rest of the app. No sideways scroll.

## Data rules (binding)

- **No invented scores.** The reference's card rating ("86"), attribute scores (PAT/KOM/ATK/KOK), skill
  percentages and star ratings are placeholders. Show a number only if the platform already computes it
  from evidence by a documented rule (for example the confirmed share of hours, or a skill's evidence count).
  Otherwise show the skill without a percentage. Never fabricate a rating.
- **Reviews and recommendations:** only real, confirmed ones. With none, the element is absent.
- **Photos and video:** only evidence media the person consented to show.
- **No helper text** (decision 0032): no explanatory captions, no "what the user sees" or "why this format"
  panels. Those panels in the reference are the owner's notes to us, not page content.
- **De-identified screenshots** use "Darbuotojas Nr. 1", "Darbuotojas Nr. 2" and so on, rewritten at render
  time only. The source data never changes.
- Every locale; 1440, 390 and 375 px.
