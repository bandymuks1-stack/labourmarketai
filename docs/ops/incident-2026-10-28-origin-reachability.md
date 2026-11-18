# Incident 2026-10-28 — intermittent origin reachability (register D-10)

Status: **open** · cause: **probable provider-side inbound loss to the origin — not proven** ·
user impact: not shown for browser users; production walks and one deploy attempt failed.

Public summary only. Infrastructure measurements, configuration details and the provider-ticket text are
kept in the owner's private project workspace (AGENTS.md: infrastructure and security detail stays private).

## Path

`browser / GitHub runner → Cloudflare edge → origin`. Deploys reach the origin directly, not through Cloudflare.

## Timeline (UTC)

| Time | What failed | Evidence |
|---|---|---|
| 06:20–06:31 | deploy connection timed out (retry green); walk pre-check got no answer | Deploy to VPS 40643260305; prod-qa-walk 40644640672 |
| ≈06:59 | company-governance T-3 navigation timeout | prod-qa-walk 40645817271 |
| 07:57 | walk pre-check got no answer | prod-qa-walk 40653379023 |
| 10:05 | admin-console worker navigation timeout | prod-qa-walk 40668817886 |
| 11:13–11:17 | company-governance D-1: a freshly deployed script chunk timed out (Cloudflare had to fetch it from the origin) | prod-qa-walk 40678088257 |

## Findings

- The origin host was healthy throughout (not stalled, no local blocking); in the first window almost no inbound
  traffic reached it.
- Deploys are not the cause.
- **Cloudflare is not blocking GitHub runners:** `reachability-probe.yml` run 40685944430 — 172/172 HTTP 200,
  no mitigations, chunks served from cache.
- A client `ChunkLoadError` alone is **not** proof of a provider fault.

## Next steps

1. Owner: submit the provider ticket (text in the private workspace).
2. Coordinator: dispatch `reachability-probe.yml` during the next failure and re-run the failed walks after it.
3. Owner decision only: better origin-side logging for the next diagnosis. No infrastructure change without approval.
