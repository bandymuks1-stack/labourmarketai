# Incident 2026-10-28 — intermittent origin reachability (register D-10)

Status: **open** · cause: **probable provider-side inbound loss to the origin VPS — not proven** ·
user impact: not shown for browser users; production walks and one deploy failed.

## Path

`browser / GitHub runner → Cloudflare edge (DNS proxied) → origin VPS (nginx → app container)`.
Deploys use SSH **directly** to the origin, not through Cloudflare.

## Timeline (UTC) and evidence

| Time | What failed | Evidence |
|---|---|---|
| 06:20–06:31 | deploy SSH `connect … port 22: Connection timed out` (06:26:08); walk health check "no answer" (06:35:46) | Deploy to VPS run 40643260305 (attempt 1; attempt 2 green); prod-qa-walk 40644640672 brake (a) |
| same window, origin side | NIC received ≈8 packets/s (normal 50–150), CPU 86 % idle, load 0.12; sshd logged **no** connection attempts 06:15–06:31 (every minute before/after); journal written every minute; app kept calling its database at the normal rate | sysstat `sar -n DEV` / `sar -u` / `sar -q` on the origin; `journalctl -u ssh`; Supabase edge logs |
| ≈06:59 | company-governance T-3 `page.goto … net::ERR_TIMED_OUT` | prod-qa-walk 40645817271 |
| 07:57:35 | walk health check "no answer" | prod-qa-walk 40653379023 brake (a) |
| 10:05 | admin-console: worker → `/lt/dashboard/admin` navigation timeout (45 s) | prod-qa-walk 40668817886 |
| 11:13–11:17 | company-governance D-1: workspace chip never rendered (178 s); app log records a client `ChunkLoadError … (timeout)` on `/lt/dashboard/company/people`, build `0e3bd1c87` deployed 11:03 (its chunks were new → Cloudflare cache MISS → origin fetch) | prod-qa-walk 40678088257; origin app log |

## What was ruled out (read-only checks)

- **Local blocking on the origin:** fail2ban 0 bans in all jails; conntrack 94 / 65 536; firewall drops = unrelated IPv6 port scans only; no kernel network errors.
- **The app or the host stalling:** CPU idle, journal continuous, app log shows dashboard renders of 0.4–0.7 s in the 11:13 window.
- **Deploys causing it:** a deploy sampled every 3 s (07:16) swapped with 0 errors and no latency rise; the 06:20 window began before the deploy reached the origin.
- **Cloudflare blocking GitHub runners:** reachability probe from a GitHub-hosted runner (workflow `reachability-probe.yml`, run 40685944430, 12:0x UTC, edge LAX): 172/172 HTTP 200, `cf-mitigated` 0, chunks 85 HIT / 1 MISS, health avg 0.51 s, max 1.79 s.
- **Not concluded:** that Hostinger is at fault. A `ChunkLoadError` alone is not proof; the 06:20–06:31 origin-side packet drop is the strongest evidence.

## Gaps

- nginx access logging is off on the origin (`access_log off`), so inbound HTTP per minute cannot be reconstructed.
- sysstat samples every 10 minutes; short drops (≈1–5 min) are averaged away.

## Provider ticket (text — owner submits it in hPanel → Help → support)

> Subject: Intermittent inbound connectivity loss to our VPS on 2026-10-28 (UTC)
>
> Hello, inbound connections to our VPS failed several times on 2026-10-28 (UTC). Please check your network /
> DDoS-protection logs for: **06:20–06:31** (SSH to port 22 timed out at 06:26:08; HTTPS from Cloudflare to our
> origin not answered at about 06:35:46), **about 06:59**, **about 07:57:35**, **about 10:05**, and **11:13–11:17**.
> On the VM (read-only): for 06:20–06:30 eth0 received about 8 packets/s against 50–150 normally, CPU 86 % idle;
> sshd logged no connection attempts 06:15–06:31; the system journal and our application's outbound calls continued
> every minute; fail2ban had no bans, conntrack was nearly empty, the firewall dropped only unrelated IPv6 scans.
> Our site is proxied by Cloudflare; Cloudflare-to-origin and direct SSH both failed in the first window.
> Questions: (1) any network incident, maintenance or DDoS/rate-limit filtering affecting this VPS in these windows?
> (2) any filtering of Cloudflare or Microsoft Azure source ranges? (3) flow/packet statistics for the VPS public
> interface for 06:15–06:35 and 11:10–11:20 UTC? Thank you.

## Next steps

1. Owner: submit the ticket (above).
2. Coordinator: re-run `reachability-probe.yml` (workflow_dispatch) during the next failure, so runner-side data
   covers an actual drop; re-run the failed walks after each drop.
3. Owner decision only: turn nginx access logging on for the labourmarket vhost (log rotation, no bodies), or
   a 1-minute sysstat interval — both improve the next diagnosis. No infrastructure change without approval.
