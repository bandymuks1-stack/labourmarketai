import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { type Role } from "@/lib/auth/actions";
import {
  workerNextAction,
  managerNextAction,
  customerNextAction,
  type NextAction,
} from "@/lib/dashboard/next-action";
import {
  actionsForRoles,
  type ConversationActionDescriptor,
} from "@/lib/conversation/action-registry";
import {
  ConversationShell,
  type ShellAction,
} from "@/components/app/conversation/conversation-shell";
import type { CommandAudience } from "@/lib/navigation/command-registry";
import type { ActiveLocale } from "@/lib/i18n/config";

/**
 * Conversation-first control surface (foundation v1). A deterministic,
 * role-aware entry that reuses the canonical next-action engine + command
 * registry and routes to the existing Advanced-mode screens. No LLM, no new
 * data system, no migration. See docs/architecture/CONVERSATION_CONTROL_ARCHITECTURE_v1.md.
 */
export default async function AssistantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const session = await getSessionProfile();
  const activeRole = (session.profile?.active_role as Role | null) ?? "worker";

  // Held roles (catalogue) — RLS-scoped. Default to the active role on any read
  // issue so the surface still renders honestly.
  let heldRoles = new Set<Role>([activeRole]);
  try {
    const { data: rows } = await supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true);
    const set = new Set<Role>((rows ?? []).map((r) => r.role as Role));
    if (set.size > 0) heldRoles = set;
  } catch {
    /* keep the active-role default */
  }

  // Command-finder audiences derived from held roles (display-only filter).
  const audiences: CommandAudience[] = ["public"];
  if (heldRoles.has("worker")) audiences.push("worker");
  if (heldRoles.has("company") || heldRoles.has("agency")) audiences.push("company");

  // Canonical "continue where you left off" — derived, never a new store.
  const { href: continueHref, label: continueLabel } = await deriveContinue(
    supabase,
    user.id,
    activeRole,
  );

  // Suggested actions: role-filtered registry, active-role subject first, capped.
  const forRoles = actionsForRoles(heldRoles);
  const ordered = [...forRoles].sort(
    (a, b) => rank(a, activeRole) - rank(b, activeRole),
  );
  const suggested: ShellAction[] = ordered.slice(0, 8).map((a) => ({
    id: a.id,
    subject: a.subject,
    labelKey: a.labelKey,
    descriptionKey: a.descriptionKey,
    confirmation: a.confirmation,
    advancedRoute: a.advancedRoute,
  }));

  return (
    <ConversationShell
      locale={locale as ActiveLocale}
      audiences={audiences}
      suggested={suggested}
      continueHref={continueHref}
      continueLabel={continueLabel}
    />
  );
}

/** Sort key: the active role's own actions first, reads before writes within. */
function rank(a: ConversationActionDescriptor, active: Role): number {
  const subjectRank = a.subject === active ? 0 : 1;
  const tierRank =
    a.confirmation === "read" ? 0 : a.confirmation === "reversible_write" ? 1 : 2;
  return subjectRank * 10 + tierRank;
}

/** Best-effort derivation of the canonical next step. Everything is wrapped so a
 *  read failure degrades to "no continue card" rather than an error page. */
async function deriveContinue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  activeRole: Role,
): Promise<{ href: string | null; label: string | null }> {
  let action: NextAction | null = null;
  try {
    if (activeRole === "worker") {
      const { data: worker } = await supabase
        .from("workers")
        .select("id")
        .eq("profile_id", userId)
        .maybeSingle();
      const hasProfile = !!worker?.id;
      let entriesTotal = 0;
      if (worker?.id) {
        const { count } = await supabase
          .from("journal_entries")
          .select("id", { count: "exact", head: true })
          .eq("worker_id", worker.id);
        entriesTotal = count ?? 0;
      }
      // confirmedCount defaults to entriesTotal so we never falsely show a
      // "waiting for a human" step from this lightweight surface.
      action = workerNextAction({ hasProfile, entriesTotal, confirmedCount: entriesTotal });
    } else if (activeRole === "company" || activeRole === "agency") {
      action = managerNextAction(activeRole, 0);
    } else {
      action = customerNextAction();
    }
  } catch {
    return { href: null, label: null };
  }
  if (!action) return { href: null, label: null };
  try {
    const t = await getTranslations("auth.dashboard.nextAction");
    return { href: action.href, label: t(`${action.key}.title`) };
  } catch {
    return { href: action.href, label: null };
  }
}
