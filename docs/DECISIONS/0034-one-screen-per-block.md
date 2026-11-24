# 0034 — One screen per block; no long pages; chat says when a request belongs elsewhere (binding, owner rule 2026-11-24)

**Status:** binding and permanent. It applies to every agent, every future PR, every locale and every role.
It extends decision 0032 (no interface noise) and `docs/design/CAROUSEL_NAVIGATION_SPEC.md`.

## Rule 1: one screen per block

- A page shows only the information that is clear, specific and important for that moment or that function.
- When there is more, it is split into **clear blocks**. Each block is reached through its own link: a tab,
  a section route or a card. It is not appended below the previous block.
- No page may become a long scroll. A page where the person "gets tired of scrolling down" is a navigation
  and structure defect, not a styling issue. The worker Living CV (`/cv`) is the first known case
  (2026-11-24).
- Each block has its own address (a route or `?tab=`), so a link, a notification or the chat can open it
  directly.

## Rule 2: the visual standard everywhere

The quality of the Living CV reference (`docs/design/living-cv-reference-2026-11-24/`) is the minimum for
the whole product. The interface is simple and clear without explanations. A function that needs an
explanation to be understood is redesigned, not captioned (decision 0032).

## Rule 3: the chat says when a request belongs to another space

When a request does not belong to the active space or role (for example "my CV" while acting for an
organization), the assistant does not answer with a generic menu of that space. It either:

- says plainly that this belongs to the person's own space and offers one action that switches and opens it;
- or, if the intent is unclear, asks one short clarifying question that names the closest real options.

It never pretends that an unrelated menu answers the request.

## What stays

Decision 0032's list still applies: legal, consent, privacy, security and action-consequence texts. Every
existing function stays reachable: splitting a page into blocks moves content behind links and never
deletes it.
