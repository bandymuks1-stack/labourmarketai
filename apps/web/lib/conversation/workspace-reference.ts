/**
 * IS THIS NAME ONE OF THE CALLER'S OWN WORKSPACES? Pure: no server-only
 * import, no IO, no env.
 *
 * Extracted from `startSwitchContext` in `conversation-chat.tsx`, unchanged in
 * behaviour, so that the two places that need to recognise an organisation by
 * name — "perjunk į Nonstop Group" (an explicit switch) and a bare
 * "Nonstop Group" (slice A: a name typed on its own) — cannot drift into two
 * different opinions about the same word.
 *
 * It resolves ONLY against the workspaces the caller already holds, which the
 * session has already read under their own RLS. It performs no lookup of its
 * own, and it never matches a company the person has no relationship with:
 * a name this returns nothing for is simply a name we do not recognise, which
 * is a question to ask, not a thing to create.
 */

export interface WorkspaceLike {
  readonly id: string;
  readonly name: string;
  readonly kind: "personal" | "organization";
}

/**
 * Candidate workspaces whose name appears in `text`.
 *
 * Full-name inclusion first; only if that finds nothing, a single name token
 * of four characters or more. Real entity names only — the four-character
 * floor is what keeps a workspace called "Hall A" or "A B" from matching every
 * sentence containing "a".
 *
 * Returns EVERY candidate. One is a resolution; several are an ambiguity the
 * caller must ask about; none is an unknown name. The caller decides — this
 * never picks for them.
 */
export function matchWorkspacesByName<T extends WorkspaceLike>(
  workspaces: readonly T[],
  text: string,
  fold: (s: string) => string,
): T[] {
  const folded = fold(text);
  const organizations = workspaces.filter(
    (w) => w.kind === "organization" && w.name.trim() !== "",
  );
  const byFullName = organizations.filter((w) => {
    const name = fold(w.name).trim();
    return name.length >= 3 && folded.includes(name);
  });
  if (byFullName.length > 0) return byFullName;
  return organizations.filter((w) =>
    fold(w.name)
      .split(/\s+/)
      .some((token) => token.length >= 4 && folded.includes(token)),
  );
}
