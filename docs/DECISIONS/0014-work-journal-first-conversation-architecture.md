# ADR 0014 — Work-journal-first conversation architecture

**Status:** Accepted (owner canonical decision, 2026-07-25) ·
**Canonical text:** [`docs/owner-decisions/work-journal-conversation-architecture-v1.md`](../owner-decisions/work-journal-conversation-architecture-v1.md) ·
**Guard:** `apps/web/lib/guards/work-journal-first-architecture.test.ts`

## Context

The conversation-first work (PR #862 foundation, #863 worker journey, #864
chat UI) was being read in several incompatible ways at once — as navigation,
as an AI assistant layered over the existing screens, or as a dashboard
redesign. In parallel the work journal was treated as one module among many,
CV as a manual form, and job / candidate search as standalone filter boards.
That reading produces a second, parallel architecture next to the canonical
domain, which is exactly what the platform cannot afford.

The owner issued a canonical directive that fixes the product idea, the UX,
the data-truth model and the technical layering in one document.

## Decision

The conversation window **is the primary work journal**, not a navigation or
assistant layer. Everything else in the product is downstream of it:

```
POKALBIS / DARBO ŽURNALAS → DARBO ĮVYKIAI → ĮRODYMAI IR PATVIRTINIMAI
 → PROFESINĖ ISTORIJA → CV + ĮGŪDŽIAI + PATIKIMUMAS → REALUS PROFESINIS PROFILIS
 → DARBO / DARBUOTOJŲ PAIEŠKA → VEIKSMAI, KOMUNIKACIJA IR PLANAVIMAS
```

Five invariants govern every later slice:

| Invariant | Meaning |
|---|---|
| `CONVERSATION_IS_PRIMARY_WORK_JOURNAL` | the chat surface is where work is recorded, not where screens are opened |
| `JOURNAL_ROUTE_IS_STRUCTURED_PROJECTION` | the journal route shows what the conversation created; it is not a second primary journal |
| `CV_IS_WORK_HISTORY_PROJECTION` | CV is a projection of professional history; manual editing is a correction path, not the data-creation path |
| `CONVERSATION_AND_UI_SHARE_DOMAIN_USE_CASES` | no separate "chat logic" bypassing canonical domain use-cases |
| `DEEP_SURFACES_ARE_NOT_PRIMARY_ENTRY_POINTS` | advanced/deep screens are complex-management surfaces, opened from a conversation result |

The canonical document also fixes: the six provenance classes (raw input →
extracted claim → user-confirmed fact → externally verified fact → derived
signal → published projection), transcript persistence as business data linked
to domain events, the target layering (`UI → use case → domain service →
authz/validation/state transition → repository → RPC/DB`), the P0–P3 priority
rules, the audit table, the implementation stages A–H, and the DRAFT-capability
decisions (Company Locations `DEFER`, Agency Clients `DEFER`, Multi-Source
Talent `DEFER AND SPLIT`, Worker Opportunity Seen `BUILD NOW`).

## Consequences

- Any slice that adds a second primary entry point, a parallel chat-only data
  path, or a screen that duplicates the conversation entry must be stopped and
  escalated to the owner rather than silently reinterpreted.
- Work is sequenced A → H. Nothing decorative or secondary outranks completing
  the conversation → journal → profile → search loop.
- This ADR supersedes any earlier reading of ADR 0013 or the roadmap that
  treated the journal, the CV form, the opportunity board or the candidate
  filter as independent primary product centres. The marketplace *patterns* of
  ADR 0013 remain valid as structured secondary surfaces.
- The guard test protects the principle, not the current file names — it never
  pins components or routes.
