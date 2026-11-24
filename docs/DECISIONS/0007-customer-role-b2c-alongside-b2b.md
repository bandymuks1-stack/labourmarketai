# ADR 0007 — Customer role: B2C alongside B2B

**Status:** Accepted · **Milestone:** role enum M1, marketplace M3 · **Vision:** PROJECT_VISION.md §7, §12

## Context
The platform is primarily B2B (workers, companies, agencies). But a
`customer`/užsakovas who orders a service and wants to see *who actually
provides it* is a real, distinct audience that reuses the same underlying
worker/skill/evidence data.

## Decision
`customer` is a first-class role in the `profiles.role` enum (added M1).
The B2C marketplace (`service_requests`, `service_bookings`) is a
**parallel layer over the same worker data**, delivered M3 — not a
separate product, not a data fork.

## Consequences
- One worker dataset powers both B2B matching and B2C ordering.
- `profiles.role` check constraint extended in M1 (`docs/DATA_MODEL.md`).
- No B2C UI in M0–M2; documented now so the schema reserves space.
