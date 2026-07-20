/**
 * Isolated negative control for the confirmation-guard lock strength.
 * Runs the SAME soft-delete race twice: once with FOR KEY SHARE (the shape
 * Codex flagged) and once with FOR UPDATE (the fix). Nothing else touches the
 * function in between, unlike the full harness which re-applies the migration.
 */
import { Client } from "pg";

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const guard = (lock: string) => `
create or replace function public.journal_entry_confirmations_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_superseded uuid; v_deleted timestamptz;
begin
  select superseded_by, deleted_at into v_superseded, v_deleted
    from public.journal_entries where id = new.entry_id ${lock};
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if v_deleted is not null then raise exception 'entry_deleted' using errcode = '42P10'; end if;
  if v_superseded is not null then raise exception 'entry_superseded' using errcode = '55000'; end if;
  return new;
end $$;`;

async function main() {
  const a = new Client({ connectionString: DB_URL });
  await a.connect();

  // Minimal fixture.
  const { rows: u } = await a.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'neg-' || gen_random_uuid() || '@fixture.local', 'x', now(),
       '{"provider":"email"}', '{}', now(), now()) returning id`,
  );
  const pid = u[0].id as string;
  await a.query(
    `insert into public.profiles (id, active_role, full_name) values ($1,'worker','Neg Control') on conflict (id) do update set active_role='worker'`,
    [pid],
  );
  const { rows: w } = await a.query(
    `insert into public.workers (profile_id) values ($1) on conflict (profile_id) do update set profile_id=excluded.profile_id returning id`,
    [pid],
  );
  const { rows: ec } = await a.query(
    `insert into public.engagement_contexts (profile_id, relationship_slug, title, hash_self)
     values ($1::uuid,'freelancer','neg', md5($1 || clock_timestamp()::text)) returning id`,
    [pid],
  );

  for (const lock of ["for key share", "for update"]) {
    await a.query(guard(lock));

    const { rows: e } = await a.query(
      `insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug,
         original_text, original_language, hash_self, visibility_scope)
       values ($1,$2,'freeform','neg race','lt', md5(clock_timestamp()::text),'closed') returning id`,
      [w[0].id, ec[0].id],
    );
    const entry = e[0].id as string;

    // Session A: soft delete (bare non-key UPDATE -> FOR NO KEY UPDATE), open.
    const deleter = new Client({ connectionString: DB_URL });
    await deleter.connect();
    await deleter.query("begin");
    await deleter.query(
      `update public.journal_entries set deleted_at = now(), updated_at = now() where id = $1`,
      [entry],
    );

    // Session B: confirmation insert on its own connection.
    const confirmer = new Client({ connectionString: DB_URL });
    await confirmer.connect();
    const race = confirmer
      .query(
        `insert into public.journal_entry_confirmations
           (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
         values ($1,$2,$3,'manager','{"action":"confirm"}'::jsonb)`,
        [entry, pid, ec[0].id],
      )
      .then(() => "COMMITTED")
      .catch((err) => String((err as Error).message));

    await new Promise((r) => setTimeout(r, 500));
    const { rows: blocked } = await a.query(
      `select count(*)::int as n from pg_stat_activity
        where wait_event_type = 'Lock' and query like '%journal_entry_confirmations%'`,
    );
    await deleter.query("commit");
    const outcome = await race;
    const { rows: c } = await a.query(
      `select count(*)::int as n from public.journal_entry_confirmations where entry_id = $1`,
      [entry],
    );
    const corrupt = c[0].n > 0;
    console.log(
      `${lock.padEnd(14)} | blockedOnLock=${String(blocked[0].n >= 1).padEnd(5)} | outcome=${outcome.slice(0, 24).padEnd(26)} | confirmationsOnDeletedEntry=${c[0].n} ${corrupt ? "  <-- CORRUPTION" : ""}`,
    );
    await confirmer.end();
    await deleter.end();
  }
  await a.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
