# Placeholder Content Governance

The platform ships before real data, real customers, real partner logos, or
real testimonials exist. To stay honest *and* shippable, **every** fake value
that appears in the UI is registered, tagged, and promotable from one place.

This is a hard rule (brief: Placeholder Content Governance / Rule 5). It is not
a style preference — it is what keeps "looks finished" from quietly becoming
"makes false claims."

## The one rule

> A component **never** inlines a fake name, number, logo, or quote. It renders
> `<Placeholder id="..." />`, which reads from the single registry at
> `apps/web/content/placeholders.ts`.

If you find an inlined fake value anywhere else, that is a bug — move it into
the registry.

## Anatomy of a registered placeholder

Every entry in `apps/web/content/placeholders.ts` is fully typed
(`Placeholder`):

| Field               | Meaning                                                        |
| ------------------- | -------------------------------------------------------------- |
| `id`                | Stable dotted key used by `<Placeholder id="..." />`.          |
| `type`              | `person \| stat \| logo \| testimonial \| metric \| screenshot \| company \| project`. |
| `value`             | The displayed fake value (`{lt,en}`, `string`, `number`, or `{src,alt}`). |
| `description`       | What this represents in the UI. **Required** (CI-enforced).    |
| `replacementSource` | Exactly what real data replaces this and from where. **Required** (CI-enforced). |
| `status`            | `placeholder` → `pending-real` → `replaced`.                   |
| `addedIn`           | Milestone the placeholder was introduced (`M0`, `M1`, …).      |
| `consentRequired`   | `true` for persons, logos, testimonials (anything about a real human/brand). |
| `notes`             | Free text — e.g. `consented:false`.                            |

## Visibility marker

`<Placeholder>` wraps its content. When
`NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS === 'true'` (dev + Vercel preview) it
draws a subtle dotted outline and a corner `PLACEHOLDER` chip with the id and
description in the tooltip. In production the flag is `'false'`, so it renders
cleanly — **the value is still a placeholder until it is promoted**, the marker
is only a reviewer aid.

See every registered placeholder live at `/[locale]/design` (dev/preview only).

## CLI

Run from the repo root (delegates into `apps/web`):

| Command                              | Does                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `pnpm placeholders:list`             | Group every placeholder by status.                              |
| `pnpm placeholders:pending`          | Only those flagged `pending-real`.                              |
| `pnpm placeholders:check`            | CI gate — exits non-zero if any entry is missing `description` / `replacementSource`, or ids collide. |
| `pnpm placeholders:promote <id>`     | The **only** sanctioned way to swap a value (see below).        |

`placeholders:check` is wired into the same gate as `build` / `lint` /
`typecheck`; a placeholder with no `replacementSource` cannot reach `main`.

## Promotion (swapping a placeholder for real data)

Promotion is deliberately friction-ful. Real data about real people/brands
requires consent that the founder controls — code cannot self-authorize it.

1. Founder approves the specific promotion (and, if `consentRequired`, the
   consent is recorded in `docs/CONSENT_LOG.md`).
2. Run `pnpm placeholders:promote <id>`. It is interactive: it prints the
   entry's `description`, `replacementSource`, and `consentRequired`, then asks
   for confirmation. In non-interactive shells it refuses unless `--yes` is
   passed.
3. On confirmation it appends a dated line to `docs/CHANGELOG.md` recording the
   promotion and its source.
4. You then edit `apps/web/content/placeholders.ts`: set the real `value` and
   `status: 'replaced'` for that id.

Never add, edit, or promote a placeholder outside this flow. The M0 initial
fill is the only exemption (it seeds the registry; nothing is promoted).
