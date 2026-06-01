import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import type { Role } from "@/lib/auth/actions";

/**
 * Current-space header (room-based IA). Makes the space the user is currently
 * inside obvious and focused: space name + one short purpose sentence + a
 * compact "My spaces" entry to reach other spaces — WITHOUT loading other
 * spaces' content into this page. Read-only, copy-driven; no DB, no fake data.
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

export async function CurrentSpaceHeader({ role }: { role: Role }) {
  const t = await getTranslations("spaces");
  const key = ROLE_SPACE[role];

  return (
    <section
      className="card-border flex flex-col gap-2 p-4"
      data-testid="current-space-header"
      data-space={key}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("current")}
          </span>
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t(`${key}.name`)}
          </h2>
        </div>
        <Link
          href="/dashboard/account"
          className="shrink-0 rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/10"
          data-testid="my-spaces-link"
        >
          {t("mySpaces")} →
        </Link>
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">
        {t(`${key}.purpose`)}
      </p>
    </section>
  );
}
