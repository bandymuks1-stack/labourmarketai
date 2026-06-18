import { getTranslations } from "next-intl/server";
import {
  IdCard,
  Search,
  FileCheck,
  ClipboardList,
  Users,
  ShoppingCart,
  Handshake,
  FolderKanban,
  Building2,
  Plus,
  User,
  Trophy,
  MessageSquare,
  Map as MapIcon,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { type Role } from "@/lib/auth/actions";

/**
 * Visible identity / action workspace (v1).
 *
 * Shows the real model — TWO legal identities, each with ACTIONS (capabilities),
 * never "agency / buyer / worker" as separate systems:
 *   • Asmuo (person) — always available actions.
 *   • Įmonė (company) — actions if a company exists, else one honest
 *     "create a company" CTA (no fake company data).
 *
 * Two render modes:
 *   • FULL (no `focusRole`) — both identities, used on /dashboard/account
 *     ("Mano erdvės / My spaces"), the cross-space catalogue surface.
 *   • FOCUSED (`focusRole` set) — active-role clarity on the /dashboard overview:
 *     only the active role's own actions show on the first screen; the other
 *     identity stays one tap away via "Switch role / Manage spaces"
 *     (/dashboard/account). Nothing is removed permanently.
 *
 * Every action links to a REAL existing route. Copy lives in the
 * `identityActions` i18n namespace (en/lt/ru). No schema / role-key change.
 */
type ActionDef = { key: string; href: string; icon: LucideIcon };

const PERSON_ACTIONS: readonly ActionDef[] = [
  { key: "profile", href: "/dashboard/profile", icon: IdCard },
  { key: "playerCard", href: "/dashboard/player-card", icon: Trophy },
  { key: "findWork", href: "/dashboard/opportunities", icon: Search },
  { key: "marketMap", href: "/dashboard/market-map", icon: MapIcon },
  { key: "readiness", href: "/dashboard/documents", icon: FileCheck },
  { key: "communication", href: "/dashboard/communication", icon: MessageSquare },
];

const COMPANY_ACTIONS: readonly ActionDef[] = [
  { key: "need", href: "/dashboard/company", icon: ClipboardList },
  { key: "hire", href: "/dashboard/candidates", icon: Users },
  { key: "marketMap", href: "/dashboard/market-map", icon: MapIcon },
  { key: "buy", href: "/dashboard/buyer", icon: ShoppingCart },
  { key: "offer", href: "/dashboard/agency", icon: Handshake },
  { key: "projects", href: "/dashboard/projects", icon: FolderKanban },
  { key: "communication", href: "/dashboard/communication", icon: MessageSquare },
];

// Active-role focus subsets (active-role overview clarity v1). Each role sees
// only its own primary actions on the first screen — a worker is never shown
// company machinery, a buyer is never shown hire/offer/projects. The non-active
// identity stays reachable through "Switch role / Manage spaces".
const FOCUS_KEYS: Record<Role, readonly string[]> = {
  worker: ["profile", "playerCard", "findWork", "readiness", "communication"],
  company: ["need", "hire", "projects", "communication"],
  agency: ["offer", "hire", "communication"],
  customer: ["buy", "communication"],
};

function ActionCard({
  icon: Icon,
  title,
  desc,
  href,
  testid,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  href: string;
  testid: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href as "/dashboard"}
      data-testid={testid}
      className={`flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-1 transition-colors hover:border-brand-blue ${compact ? "p-3" : "p-4"}`}
    >
      <Icon
        className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-sm font-semibold text-text-primary">
          {title}
        </span>
        {/* Compact entry (dashboard) drops the descriptions — it is a quick
            action launcher, not the full account explainer. */}
        {compact ? null : (
          <span className="text-xs leading-relaxed text-text-secondary">{desc}</span>
        )}
      </span>
    </Link>
  );
}

function ManageSpacesLink({ label }: { label: string }) {
  return (
    <Link
      href={"/dashboard/account" as "/dashboard"}
      data-testid="identity-manage-spaces"
      className="inline-flex w-fit items-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
    >
      <ArrowLeftRight className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
      {label}
    </Link>
  );
}

export async function IdentityActions({
  hasCompany,
  compact = false,
  focusRole,
}: {
  readonly hasCompany: boolean;
  /** Compact dashboard entry: tighter spacing, no subtitles/descriptions. The
   *  full explainer view lives on /dashboard/account. */
  readonly compact?: boolean;
  /** When set (dashboard overview), render ONLY the active role's identity
   *  actions; the other identity stays reachable via Manage spaces. Omit for
   *  the full both-identities catalogue (/dashboard/account). */
  readonly focusRole?: Role;
}) {
  const t = await getTranslations("identityActions");
  const blockCls = `flex flex-col gap-3 rounded-2xl border border-border-subtle bg-ink-800/20 ${compact ? "p-4" : "p-5"}`;

  // ── FOCUSED: active-role overview — only the active role's actions. ──
  if (focusRole) {
    const keys = FOCUS_KEYS[focusRole];
    if (focusRole === "worker") {
      const acts = PERSON_ACTIONS.filter((a) => keys.includes(a.key));
      return (
        <section
          className="flex flex-col gap-3"
          data-testid="identity-actions"
          aria-label={t("ariaLabel")}
        >
          <div className={blockCls} data-testid="identity-person">
            <div className="grid gap-3 sm:grid-cols-2">
              {acts.map((a) => (
                <ActionCard
                  key={a.key}
                  icon={a.icon}
                  href={a.href}
                  title={t(`person.actions.${a.key}.title`)}
                  desc={t(`person.actions.${a.key}.desc`)}
                  testid={`identity-action-person-${a.key}`}
                  compact
                />
              ))}
            </div>
          </div>
          <ManageSpacesLink label={t("manageSpaces")} />
        </section>
      );
    }
    // Org roles (company / agency / customer) → company identity, focused subset.
    // A buyer (customer) needs no company row to create requests, so its actions
    // always render; company/agency without a company get the honest create path.
    const acts = COMPANY_ACTIONS.filter((a) => keys.includes(a.key));
    const showActions = hasCompany || focusRole === "customer";
    return (
      <section
        className="flex flex-col gap-3"
        data-testid="identity-actions"
        aria-label={t("ariaLabel")}
      >
        <div className={blockCls} data-testid="identity-company">
          {showActions ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {acts.map((a) => (
                <ActionCard
                  key={a.key}
                  icon={a.icon}
                  href={a.href}
                  title={t(`company.actions.${a.key}.title`)}
                  desc={t(`company.actions.${a.key}.desc`)}
                  testid={`identity-action-company-${a.key}`}
                  compact
                />
              ))}
            </div>
          ) : (
            <Link
              href={"/dashboard/start/company" as "/dashboard"}
              data-testid="identity-company-create"
              className={`flex items-start gap-3 rounded-xl border border-dashed border-brand-blue/50 bg-brand-blue/5 transition-colors hover:border-brand-blue ${compact ? "p-3" : "p-4"}`}
            >
              <Plus className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="font-display text-sm font-semibold text-text-primary">
                  {t("company.empty.cta")}
                </span>
              </span>
            </Link>
          )}
        </div>
        <ManageSpacesLink label={t("manageSpaces")} />
      </section>
    );
  }

  // ── FULL: both identities (the /dashboard/account catalogue). Unchanged. ──
  return (
    <section
      className={compact ? "flex flex-col gap-3" : "flex flex-col gap-5"}
      data-testid="identity-actions"
      aria-label={t("ariaLabel")}
    >
      {/* Asmuo — person identity */}
      <div className={blockCls} data-testid="identity-person">
        <header className="flex items-center gap-2">
          <User className="h-5 w-5 text-text-secondary" strokeWidth={1.75} aria-hidden />
          <div className="flex flex-col">
            <h2 className="font-display text-base font-semibold text-text-primary">
              {t("person.title")}
            </h2>
            {compact ? null : (
              <p className="text-xs text-text-secondary">{t("person.subtitle")}</p>
            )}
          </div>
        </header>
        <div className="grid gap-3 sm:grid-cols-3">
          {PERSON_ACTIONS.map((a) => (
            <ActionCard
              key={a.key}
              icon={a.icon}
              href={a.href}
              title={t(`person.actions.${a.key}.title`)}
              desc={t(`person.actions.${a.key}.desc`)}
              testid={`identity-action-person-${a.key}`}
              compact={compact}
            />
          ))}
        </div>
      </div>

      {/* Įmonė — company identity */}
      <div className={blockCls} data-testid="identity-company">
        <header className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-text-secondary" strokeWidth={1.75} aria-hidden />
          <div className="flex flex-col">
            <h2 className="font-display text-base font-semibold text-text-primary">
              {t("company.title")}
            </h2>
            {compact ? null : (
              <p className="text-xs text-text-secondary">{t("company.subtitle")}</p>
            )}
          </div>
        </header>
        {hasCompany ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMPANY_ACTIONS.map((a) => (
              <ActionCard
                key={a.key}
                icon={a.icon}
                href={a.href}
                title={t(`company.actions.${a.key}.title`)}
                desc={t(`company.actions.${a.key}.desc`)}
                testid={`identity-action-company-${a.key}`}
                compact={compact}
              />
            ))}
          </div>
        ) : (
          <Link
            href={"/dashboard/start/company" as "/dashboard"}
            data-testid="identity-company-create"
            className={`flex items-start gap-3 rounded-xl border border-dashed border-brand-blue/50 bg-brand-blue/5 transition-colors hover:border-brand-blue ${compact ? "p-3" : "p-4"}`}
          >
            <Plus className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
            <span className="flex flex-col gap-0.5">
              <span className="font-display text-sm font-semibold text-text-primary">
                {t("company.empty.cta")}
              </span>
              {compact ? null : (
                <span className="text-xs leading-relaxed text-text-secondary">
                  {t("company.empty.desc")}
                </span>
              )}
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}