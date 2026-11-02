/**
 * Find a production auth user by email through the Admin API — used by the
 * owner-run provision script and by the session mint (which must REFUSE a
 * fresh identity the owner has not created yet, so a walk can never create an
 * account). The Admin API has no direct get-by-email, and a wrong-user match
 * here would be the worst possible bug, so the comparison is exact and
 * case-normalised.
 */
export interface AdminUserLister {
  auth: {
    admin: {
      listUsers: (o: { page: number; perPage: number }) => Promise<{
        data: { users: { id: string; email?: string | null }[] } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export async function findAuthUserByEmail(
  admin: AdminUserLister,
  email: string,
): Promise<{ id: string } | null> {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").trim().toLowerCase() === wanted);
    if (hit) return { id: hit.id };
    if (users.length < 200) return null;
  }
  return null;
}
