import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import type { Role } from "@/lib/auth/actions";

/**
 * Current-space header (room-based IA). Makes the space the user is currently
 * inside obvious and focused: space name + one short purpose sentence + a
 * compact chip that OPENS the active space's own hub. Read-only, copy-driven;
 * no DB, no fake data.
 *
 * Owner P0 (2026-07-02): the chip must NOT route to /dashboard/account —
 * account is SETTINGS-ONLY since the 2026-06-25 IA cleanup, so the old
 * "Mano erdvės" → account link landed users on "Nustatymai" instead of their
 * workspace. Space SWITCHING lives in the header <RoleSwitcher/>; settings
 * stays reachable via the avatar <AccountMenu/> ("Nustatymai"). This chip
 * opens the active space's hub (worker → profile/player-card/CV hub).
 *
 * Maps the account's active role to its space:
 *   worker → personal profile, company → company workspace,
 *   agency → agency space, customer → buyer space.
 * (Company-as-buyer is a sub-mode of the company space and is not a separate
 *  role yet — see the owner-review note.)
 */
const ROLE_SPACE: Record<Role, "profile" | "company" | "agency" | "buyer"> = {
  worker: "profile",
  company: "company",
  agency: "agency",
  customer: "buyer",
};

/** Each space's hub route — the workspace the chip opens. No new routes,
 *  and NO stub hops (rebuild W5): the agency room is a REDIRECT_STUB and the
 *  buyer room is DUPLICATE_DRIFT in the route truth map, so both spaces link
 *  the canonical company workspace directly instead of bouncing through a
 *  drifting route. The worker hub (/dashboard/profile) already links onward
 *  to the CV at /cv. */
const SPACE_ROUTE = {
  profile: "/dashboard/profile",
  company: "/dashboard/company",
  agency: "/dashboard/company",
  buyer: "/dashboard/company",
} as const satisfies Record<(typeof ROLE_SPACE)[Role], string>;

export async function CurrentSpaceHeader({ role }: { role: Role }) {
  const t = await getTranslations("spaces");
  const key = ROLE_SPACE[role];

  // Owner UX recovery v1: ONE compact line, not a card — the space name and
  // the open-space link. The purpose sentence moved out of the layout flow
  // into a native tooltip (title) so the chip explains itself on demand
  // without spending a paragraph of screen on every visit.
  return (
    <section
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-ink-800/20 px-3 py-2"
      data-testid="current-space-header"
      data-space={key}
      title={t(`${key}.purpose`)}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("current")}
        </span>
        <h2 className="truncate font-display text-sm font-semibold text-text-primary">
          {t(`${key}.name`)}
        </h2>
      </div>
      <Link
        href={SPACE_ROUTE[key]}
        className="shrink-0 rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/10"
        data-testid="open-space-link"
        aria-label={`${t("openSpace")}: ${t(`${key}.name`)}`}
      >
        {t("openSpace")} →
      </Link>
    </section>
  );
}
