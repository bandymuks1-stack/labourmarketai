# Handoff — wire PR #864's chat window to the canonical marketplace use case

**Required at #864 merge time.** Written during the PR #868 (Stage B) runtime
review. #864 was **not modified** by #868.

- **#864 head checked:** `b69f18a7` (updated 2026-07-25T09:30Z) — unchanged
  since the Stage B PR was opened, so the instruction below is current.
- **Canonical use case:** `apps/web/lib/marketplace/worker-opportunities.ts`
- **Owner decision:** `docs/owner-decisions/work-journal-conversation-architecture-v1.md`
  (invariant `CONVERSATION_AND_UI_SHARE_DOMAIN_USE_CASES`)

## What #864 does today

`apps/web/lib/conversation/find-work.ts` → `findWorkForChat()`, called from
`apps/web/components/app/conversation/chat/conversation-chat.tsx:176`.

Four concrete divergences from the canonical path:

| # | Current | Why it must change |
|---|---|---|
| 1 | calls `loadWorkerOpportunities()` directly | bypasses the use case; the chat becomes a second marketplace entry |
| 2 | re-sorts with `compareMatches(...)` then `.slice(0, 3)` | a **second ranking**. `lib/conversation/**` is not under the guard's UI roots, so this is NOT caught automatically |
| 3 | emits `ChatEmployerMatch.id = \`${i}\`` — a **list index**, not the demand id | the chat literally cannot report which opportunities it showed |
| 4 | never marks shown | the conversation's seen state stays permanently out of sync with the board |

Explainability is a **third wording variant**: `conversation.findWork.skillBasis`
= "Atitinka {pct}% šio darbo įgūdžių: {matched} iš {total}, iš jų {confirmed}
patvirtinti". It is §19-compatible (a percentage never travels without its
counts) but differs from the board ("Atitinka 1 iš 1 reikalingų įgūdžių (0
patvirtinti vadovo)") and from the canonical compact form
`opportunities.recommendations.basisCompact` ("1 iš 1 įgūdžių, 0 patvirtinti").

## The replacement

Delete the bespoke load/rank/explain in `find-work.ts` and delegate:

```ts
// apps/web/lib/conversation/find-work.ts
import { loadWorkerOpportunityMatches } from "@/lib/marketplace/worker-opportunities";

const view = await loadWorkerOpportunityMatches({
  surface: "conversation",   // ← the required surface tag
  limit: 3,
});
if (view.kind !== "ready") return { kind: "blocked", message: t("blockedNoWorker") };
if (!view.capabilities.boardAvailable) return { kind: "blocked", message: t("blockedNoAccess") };
if (view.matches.length === 0) return { kind: "empty", message: t("emptyState") };
// view.matches is ALREADY ranked and explained — no compareMatches, no slice.
```

Then, in the chat:

1. **Carry the real id.** `ChatEmployerMatch.id` must become the
   `requestId` from `JobRecommendation`, not a list index.
2. **Report what the chat rendered**, using the same component every other
   surface uses:

```tsx
import { OpportunitiesShownMarker } from "@/components/app/marketplace/opportunities-shown-marker";

<OpportunitiesShownMarker
  surface="conversation"
  requestIds={renderedMatches.map((m) => m.requestId)}  // the DISPLAYED cards only
/>
```

3. **Use one explainability form.** Replace `conversation.findWork.skillBasis`
   with `opportunities.recommendations.basisCompact` so the chat, the dashboard
   card and the journal block read identically. Keep the board's fuller line
   (it additionally names the requirement provenance).

### Provenance identifiers

`conversationId` / `messageId` / `actionId` are **NOT needed for this merge**.
`MarkShownInput` is an object precisely so they can be added in Stage C without
touching any surface; until the transcript tables exist there is nothing to
reference. Do not invent placeholder ids.

### Do NOT

- do not re-implement ranking, filtering or explanation inside
  `lib/conversation/**`;
- do not add a second `seen`/`shown` path;
- do not pass the loaded set to the marker — only the rendered cards.

## Test to add at merge time

A guard case asserting the conversation layer does not run the marketplace
engine itself — the Stage B guard covers `app/**` and `components/**`, so
`lib/conversation/**` needs its own line:

```ts
it("the conversation layer never ranks or derives marketplace results itself", () => {
  for (const f of walk(join(APP_ROOT, "lib", "conversation"))) {
    const code = stripComments(read(f));
    expect(code, rel(f)).not.toMatch(/\b(compareMatches|matchWorkerToNeed|deriveJobRecommendations)\s*\(/);
    expect(code, rel(f)).not.toMatch(/loadWorkerOpportunities\s*\(/);
  }
});
```

Plus a behaviour case in the style of
`apps/web/lib/marketplace/shown-subset-integration.test.ts`: the chat renders 3
of N recommendations and reports exactly those 3 request ids.
