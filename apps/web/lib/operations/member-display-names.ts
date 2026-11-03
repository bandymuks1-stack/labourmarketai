import "server-only";

/**
 * THE ONE fallback for a member's name when the caller cannot read that
 * person's `profiles` row.
 *
 * An organization owner or manager cannot read another person's `profiles`
 * row (RLS), so a `profiles(full_name, email)` embed on an engagement comes
 * back empty and the person was shown as "—". The members panel fixed this in
 * 2026-09-28 by reading the worker row's own `display_name` — what the roster
 * on the same page shows. The lifecycle section on the SAME page read the
 * SAME engagement rows without it and still printed "—" for the employee
 * (local UX review 2026-10-24, row 3.23). Both now share this one read.
 *
 * Bounded: one `workers` read, only for the profiles whose name is missing,
 * and only when there is one. Never an e-mail, never a raw id.
 */
type WorkersReader = {
  from: (table: "workers") => {
    select: (cols: string) => {
      in: (
        col: string,
        values: readonly string[],
      ) => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

export async function workerDisplayNamesByProfile(
  supabase: unknown,
  profileIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (ids.length === 0) return out;
  try {
    const { data } = await (supabase as WorkersReader)
      .from("workers")
      .select("profile_id, display_name")
      .in("profile_id", ids);
    for (const w of (Array.isArray(data) ? data : []) as {
      profile_id: string | null;
      display_name: string | null;
    }[]) {
      const d = w.display_name?.trim();
      if (w.profile_id && d) out.set(w.profile_id, d);
    }
  } catch {
    // A failed fallback read leaves the honest "—"; it never invents a name.
  }
  return out;
}
