# HUMAN GATE — activating Google Gemini as a live provider

State: `AWAITING_OWNER_DATA_TRANSFER_DECISION`

PR: gemini-provider-activation-v1 (registry pricing only — see "What already landed")

This gate exists because an operator asked for Gemini to be switched on, and the
answer turned out not to be a switch. Three separate things gate a live Gemini
run, they are owned by different people, and only one of them is an engineering
problem. This document says which is which so the remaining decision is small
and specific rather than "make the AI work".

---

## The short version

The credential is in place. The prices are verified. **No task in this product
can legally reach Gemini**, and no amount of further engineering changes that,
because the rule that blocks it is a data-transfer decision the owner has
already made in the other direction and has not revisited.

The smallest owner action that unblocks a first real run is **one grant row**,
reproduced verbatim in "The decision" below. It unlocks **two** of the ten AI
tasks. Everything else stays blocked, deliberately.

---

## What already landed (no owner decision needed)

**1. The credential.** `GEMINI_API_KEY` now exists in the labourmarket.ai Vercel
**Production** environment, marked Sensitive. It was copied from an existing
authorised configuration through the Vercel CLI; the value was never printed,
logged, committed, or written into this repo, and no new key was created. The
source credential was not rotated, altered or deleted.

Setting it activates nothing on its own: `config-core.ts` leaves the runtime
`disabled` unless `AI_PROVIDER_MODE` is `live`, and `AI_PROVIDER_MODE` is not
set in any labourmarket.ai environment.

**2. The price.** `model-registry.ts` now carries first-hand prices for the
three Gemini 2.5 models, read from `ai.google.dev/gemini-api/docs/pricing` on
2026-08-24, with the source and date recorded beside each figure. This closes
the `cost_unpriced` blocker permanently. The entries stay `enabled: false`, and
a guard pins that pricing them made nothing selectable.

**3. What could NOT be verified here.** A live call to the vendor — even a
zero-payload one — is refused by this environment's tooling when the request
carries the secret. So the credential is `PRESENT_UNVERIFIED`: it exists, it
came from a working configuration, and **nobody in this session has proven it
authenticates**. The first real run is what will prove it. Do not read any
statement in this repo as evidence that the key works.

---

## The blocker: the AI DATA BOUNDARY

`apps/web/lib/ai/runtime/data-egress.ts`, owner decision 2026-08-19:

> No external AI provider may receive labourmarket.ai internal, private or user
> information unless that transfer is explicitly permitted by this policy. By
> default NOTHING non-public leaves the project boundary. […] "€0 never grants
> permission to send data."

`AI_EGRESS_GRANTS` is an empty list. An external provider with no grant may
receive `PUBLIC` data only.

And — this is the part that makes it total — **no task in this product is
classed `PUBLIC`**. `TASK_SENSITIVITY` in `data-sensitivity.ts` records that as
a finding rather than an omission: every task this platform runs is about either
a business's own work or a specific person. The two least sensitive are
`LOW_RISK_PROJECT_DATA`; the rest are `PERSONAL` or above.

So today, with a valid key and a live runtime, **every single task would be
refused at the egress gate** with an honest error. That is the policy working,
not a bug, and it must not be worked around by reclassifying a task.

---

## The decision

Adding this row to `AI_EGRESS_GRANTS` is the whole unblock:

```ts
{
  provider: "gemini",
  maxSensitivity: "LOW_RISK_PROJECT_DATA",
  basis: "<owner states the basis here>",
  grantedOn: "2026-08-24",
},
```

**What it permits.** Exactly two tasks — `structure_future_work` and
`derive_workforce_requirements`. Both carry an employer's own operational text:
scope of work, headcount, timeframe, region. No natural person is described in
either payload.

**What it still refuses.** Everything at `PERSONAL` or above: CV extraction,
match explanations, work-scope normalisation from journal entries, follow-up
drafting, and message translation. Those stay blocked by the same row, because
a grant is a ceiling and not a list.

**What the owner is actually agreeing to.** The same vendor page the prices came
from states that on the **free tier**, content **is** used to improve Google's
products; on the **paid tier** it is **not**. If this deployment's key is on the
free allowance, then granting the row means: *an employer's scope-of-work text
may be used by Google to improve their products.* That is a commercially
confidential business text, not personal data — which is why the code permits
this class for a free tier at all and caps it there
(`MAX_GRANTABLE_FOR_FREE_TIER`). It is still a real disclosure and it is the
owner's call, not an engineering default.

### Question the repo cannot answer

**Is this key on the free allowance or on a billed Google Cloud project?**

Nothing in this repository can observe that, and it changes two things:

- *Free* → the training term above applies, and the honest chain profile for
  Gemini is `free_tier`, not the `paid` it currently claims.
- *Billed* → content is not used for training, and a higher grant ceiling
  becomes arguable (a separate decision; not proposed here).

That question is **already open and already recorded** — it is decision **D8**
in `value-train-2-owner-decisions-v1.md`, which reached the same conclusion
independently: `AI_PROVIDER_PROFILES` classes Gemini `paid` while the registry
marks its models `freeTier: true`, the free-tier privacy cap keys off
`costClass`, and *"which is correct depends on the actual billing arrangement,
which is an owner fact, not derivable in code"*. D8 already states the decision
as (a) confirm the paid arrangement and leave the profile `paid`, or
(b) reclassify it `free_tier` so the cap binds.

This document does not re-open D8; it records that D8 is now **on the critical
path** rather than latent. Two things changed: the credential is in place, and
the price is verified — so D8 and the grant row are the only things left.

Worth stating plainly for whoever answers it: at the ceiling proposed here the
two branches of D8 make **no difference**, because `LOW_RISK_PROJECT_DATA` is
the cap either way. So D8 is not a reason to delay this grant. It becomes
load-bearing only if a later grant tries to raise Gemini above that class, and
two guard tests are written to go red the moment someone reclassifies the
profile, precisely so the promotion is conscious.

---

## After the grant — the remaining steps, in order

None of these needs a further decision once the row is in.

1. Enable **one** model in `model-registry.ts` — `gemini-2.5-flash-lite`, the
   cheapest, whose ceiling is already priced. Flip `enabled: true`.
2. If the owner confirmed the free tier: change the Gemini profile's `costClass`
   to `free_tier` and update the two tripwire tests, recording this document as
   the source for the promotion.
3. Set in Vercel Production: `AI_GEMINI_ENABLED=true`, `AI_PROVIDER=gemini`,
   `AI_PROVIDER_MODE=live`.
   **Sequence matters.** `AI_PROVIDER_MODE=live` before the grant lands would
   move the runtime from `disabled` to live-and-refusing — every task erroring
   at the egress gate instead of degrading quietly. Set it last.
4. Run `structure_future_work` through the canonical runtime
   (`runAiCompletion` → `run-core` dispatch → the Gemini adapter). Not a direct
   API script: the proof has to exercise the router, the sensitivity gate, the
   cost ceiling and the `ai_runs` audit write, or it proves only that a key
   exists.
5. Read the resulting `ai_runs` row for the real evidence: `provider`, `model_id`,
   `input_tokens`, `output_tokens`, `actual_cost_usd`, `latency_ms`,
   `blocked_reason IS NULL`.

Note on that cost figure: the registry prices Gemini at the **metered** rate. If
the run is served by the free allowance, `actual_cost_usd` will be the standard
rate rather than the €0 actually charged — an over-statement, chosen because a
ceiling that under-estimates is the one that fails open.

---

## What must not happen

- Do not add a `PUBLIC` task, or reclassify an existing task downward, to get a
  payload past the gate. The classification is derived from the fields a task's
  policy admits.
- Do not grant Gemini `PERSONAL` while the key may be on a tier whose published
  terms permit training on the content.
- Do not set `AI_PROVIDER_MODE=live` before the grant row exists.
- Do not treat a passing test suite as proof the credential authenticates. Only
  step 4 is that proof.
