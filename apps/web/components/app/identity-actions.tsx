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
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { type Role } from "@/lib/auth/actions";

/**
 * Visible identity / action workspace (v2 — marketplace IA cleanup 2026-06-25).
 *
 * The real model is TWO identities that meet in the shared marketplace layer:
 *   • Asmuo (person) — Mano CV / profile / find work / readiness; the shared
 *     layer (map signals + messages) lives in the primary nav.
 *   • Įmonė (company) — ONE compact commercial CHANNEL (needs / hire / buy /
 *     offer / projects grouped together), never a scatter of cheap peer tiles.
 *
 * Mano CV (`/dashboard/journal`) leads with the player-card/avatar identity, so
 * there is no separate "player card" action here. Account is settings-only, so
 * the full both-identities catalogue is no longer rendered there — the focused
 * dashboard overview is the home for these quick actions.
 */
type ActionDef = { key: string; href: string; icon: LucideIcon };

// Dashboard is a command center, NOT a second navigation menu. Map (Žemėlapis)
// and Messages (Žinutės) are top-nav tabs, so they are NOT duplicated here as
// generic dashboard tiles (IA cleanup). Only true person next-actions remain.
const PERSON_ACTIONS: readonly ActionDef[] = [
  { key: "profile", href: "/dashboard/profile", icon: IdCard },
  { key: "findWork", href: "/dashboard/opportunities", icon: Search },
  { key: "readiness", href: "/dashboard/documents", icon: FileCheck },
];

// One compact company / commercial channel. The shared layer (map + messages)
// lives in the primary nav, so it is NOT repeated as company tiles.
const COMMERCIAL_ACTIONS: readonly ActionDef[] = [
  { key: "need", href: "/dashboard/company", icon: ClipboardList },
  { key: "hire", href: "/dashboard/candidates", icon: Users },
  { key: "buy", href: "/dashboard/buyer", icon: ShoppingCart },
  { key: "offer", href: "/dashboard/agency", icon: Handshake },
  { key: "projects", href: "/dashboard/projects", icon: FolderKanban },
];

// Active-role focus subsets (overview clarity). Each role sees only its own
// primary actions on the first screen.
const FOCUS_PERSON: readonly string[] = ["profile", "findWork", "readiness"];
const FOCUS_COMMERCIAL: Record<"company" | "agency" | "customer", readonly string[]> = {
  company: ["need", "hire", "projects"],
  agency: ["offer", "hire"],
  customer: ["buy"],
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
      className={`flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-1 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${compact ? "p-3" : "p-4"}`}
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
        {compact ? null : (
          <span className="text-xs leading-relaxed text-text-secondary">{desc}</span>
        )}
      </span>
    </Link>
  );
}

/**
 * The single company / commercial channel — ONE card grouping the commercial
 * capabilities as compact links (not a grid of peer tiles). When no company
 * exists, one honest "create a company" CTA replaces the links.
 */
function CompanyChannel({
  title,
  subtitle,
  actionTitle,
  actions,
  showActions,
  createCta,
  compact,
}: {
  title: string;
  subtitle: string | null;
  actionTitle: (key: string) => string;
  actions: readonly ActionDef[];
  showActions: boolean;
  createCta: string;
  compact: boolean;
}) {
  const blockCls = `flex flex-col gap-3 rounded-card border border-border-subtle bg-ink-800/20 ${compact ? "p-4" : "p-5"}`;
  return (
    <div className={blockCls} data-testid="identity-company">
      <header className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-text-secondary" strokeWidth={1.75} aria-hidden />
        <div className="flex flex-col">
          <h2 className="font-display text-base font-semibold text-text-primary">
            {title}
          </h2>
          {subtitle ? <p className="text-xs text-text-secondary">{subtitle}</p> : null}
        </div>
      </header>
      {showActions ? (
        <div className="flex flex-wrap gap-2" data-testid="company-channel-actions">
          {actions.map((a) => (
            <Link
              key={a.key}
              href={a.href as "/dashboard"}
              data-testid={`identity-action-company-${a.key}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-1 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
            >
              <a.icon className="h-3.5 w-3.5 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
              {actionTitle(a.key)}
            </Link>
          ))}
        </div>
      ) : (
        <Link
          href={"/dashboard/start/company" as "/dashboard"}
          data-testid="identity-company-create"
          className={`flex items-start gap-3 rounded-xl border border-dashed border-brand-blue/50 bg-brand-blue/5 transition-colors hover:border-brand-blue ${compact ? "p-3" : "p-4"}`}
        >
          <Plus className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
          <span className="font-display text-sm font-semibold text-text-primary">
            {createCta}
          </span>
        </Link>
      )}
    </div>
  );
}

function ManageSpacesLink({ label }: { label: string }) {
  // Audit PR4: this promised "switch role / manage spaces" but landed on
  // /dashboard/account, where roles are a read-only list. /dashboard/start is
  // the actual spaces hub (per-space status + entry lanes), so the label and
  // the destination now agree. Role SWITCHING itself stays in the header
  // RoleSwitcher, which the start hub explains.
  return (
    <Link
      href={"/dashboard/start" as "/dashboard"}
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
  companyName,
  compact = false,
  focusRole,
}: {
  readonly hasCompany: boolean;
  /** The ACTIVE company's real name (owner smoke 2026-07-05: the card must
   *  say WHICH company it is — never a generic "Jūsų įmonė" when a real
   *  company exists). Null/undefined = no company or name unreadable. */
  readonly companyName?: string | null;
  /** Compact dashboard entry: tighter spacing, no subtitles/descriptions. */
  readonly compact?: boolean;
  /** When set (dashboard overview), render ONLY the active role's identity
   *  actions; the other identity stays reachable via Manage spaces. */
  readonly focusRole?: Role;
}) {
  const t = await getTranslations("identityActions");
  const blockCls = `flex flex-col gap-3 rounded-card border border-border-subtle bg-ink-800/20 ${compact ? "p-4" : "p-5"}`;
  // Real identity first: the card title IS the active company name; the
  // generic label survives only for the honest no-company state. With a real
  // name shown, the subtitle explains what the card is — even in compact
  // mode (mobile home), so actions are unambiguous about WHICH company.
  const companyTitle = companyName?.trim() || t("company.title");
  const companySubtitle = companyName?.trim()
    ? t("company.workspaceSubtitle")
    : compact
      ? null
      : t("company.subtitle");
  const companyActionTitle = (key: string) => t(`company.actions.${key}.title`);

  // ── FOCUSED: active-role overview — only the active role's actions. ──
  if (focusRole) {
    if (focusRole === "worker") {
      const acts = PERSON_ACTIONS.filter((a) => FOCUS_PERSON.includes(a.key));
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
    // Org roles (company / agency / customer) → ONE compact commercial channel.
    const keys = FOCUS_COMMERCIAL[focusRole as "company" | "agency" | "customer"];
    const acts = COMMERCIAL_ACTIONS.filter((a) => keys.includes(a.key));
    const showActions = hasCompany || focusRole === "customer";
    return (
      <section
        className="flex flex-col gap-3"
        data-testid="identity-actions"
        aria-label={t("ariaLabel")}
      >
        <CompanyChannel
          title={companyTitle}
          subtitle={companySubtitle}
          actionTitle={companyActionTitle}
          actions={acts}
          showActions={showActions}
          createCta={t("company.empty.cta")}
          compact={compact}
        />
        <ManageSpacesLink label={t("manageSpaces")} />
      </section>
    );
  }

  // ── FULL: person identity + the one company channel. ──
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* Įmonė — the one company / commercial channel */}
      <CompanyChannel
        title={companyTitle}
        subtitle={companySubtitle}
        actionTitle={companyActionTitle}
        actions={COMMERCIAL_ACTIONS}
        showActions={hasCompany}
        createCta={t("company.empty.cta")}
        compact={compact}
      />
    </section>
  );
}
