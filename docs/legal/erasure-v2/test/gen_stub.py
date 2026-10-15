"""Generate a minimal stub schema for the local PG16 erasure test.

Every table that carries an FK onto profiles/workers in production (from
../work/joined.txt, measured 2026-10-15) becomes a stub table with:
  id uuid pk + each FK column (same NOT NULL, same ON DELETE action).
extra.sql then adds the non-FK columns, intra-table FKs, CHECKs and guard
triggers the erasure logic depends on. Usage: python gen_stub.py > stub_base.sql
"""
import sys, pathlib, collections

here = pathlib.Path(__file__).resolve().parent
rows = [l.split("|") for l in (here.parent / "work" / "joined.txt").read_text().splitlines() if l.strip()]
act = {"a": "no action", "r": "restrict", "c": "cascade", "n": "set null"}
cols = collections.OrderedDict()
for t, c, ref, a, nn, _n, *_ in rows:
    if t in ("profiles",):
        continue
    cols.setdefault(t, []).append((c, ref, a, nn))

out = []
out.append("create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, email text, full_name text, updated_at timestamptz not null default now());")
out.append("create table public.workers (id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id) on delete cascade, display_name text, updated_at timestamptz not null default now());")
for t, cs in cols.items():
    if t == "workers":
        continue
    defs = ["id uuid primary key default gen_random_uuid()"]
    for c, ref, a, nn in cs:
        target = "public.workers(id)" if ref == "W" else "public.profiles(id)"
        defs.append(f"{c} uuid{' not null' if nn == 'NN' else ''} references {target} on delete {act[a]}")
    out.append(f"create table public.{t} ({', '.join(defs)});")
print("\n".join(out))
