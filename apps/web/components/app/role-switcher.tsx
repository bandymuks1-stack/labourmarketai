"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { useAuth } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";
import {
  LABOUR_MARKET_ROLES,
  ROLE_BY_ID,
  isLiveRoleId,
  roleStatusChipKey,
  roleSwitcherTargetForRole,
  type LabourMarketRoleId,
} from "@/lib/config/roles";
import { usePopoverDismiss } from "@/lib/hooks/use-popover-dismiss";
import { cn } from "@/lib/utils";

// Role catalogue + icons read from the central role config so adding a
// future role is a one-file change. Icons stay in this client component
// because they are pure presentation.
const ROLE_ICON: Record<Role, string> = {
  worker: "🔨",
  company: "🏗️",
  agency: "🤝",
  customer: "🛒",
};

/** Authenticated-header role switcher. Always visible (even for users with
 *  one role) so adding a second role stays discoverable (PV §15).
 *  Non-worker roles route to the pilot cockpit today (not a full management
 *  surface) — we tag them honestly with "Ruošiama" so the user is not
 *  misled into expecting full feature parity. */
export function RoleSwitcher() {
  const t = useTranslations("auth");
  const tSwitcher = useTranslations("auth.roleSwitcher");
  const tAccount = useTranslations("auth.dashboard.account");
  const { roles, activeRole, isAdmin, adminUiHidden, switchRole, addRole } =
    useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Role | null>(null);

  // Same dismiss contract as the notification panel (owner smoke fix):
  // close on route change / outside click / Escape.
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  usePopoverDismiss(open, close, rootRef);

  // Renderable roles come from the central config. We still constrain the
  // pick / addRole branches to the LIVE role ids (`worker`/`company`/
  // `agency`/`customer`) because those are the values the auth backend
  // accepts today; preparing FUTURE roles (freelancer, team_lead, …) are
  // intentionally `availability: "hidden"` and never reach this list.
  const liveRoleIds = LABOUR_MARKET_ROLES.filter(
    (r) => r.availability !== "hidden" && isLiveRoleId(r.id),
  ).map((r) => r.id as Role);
  const missing = liveRoleIds.filter((r) => !roles.includes(r));

  async function pick(r: Role) {
    if (r === activeRole) {
      setOpen(false);
      return;
    }
    setPending(r);
    try {
      if (roles.includes(r)) await switchRole(r);
      else await addRole(r);
    } finally {
      setPending(null);
      setOpen(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Admin badge — rendered ONLY when the server resolved
          profiles.active_role === 'admin'. Lives OUTSIDE the workspace
          role switcher dropdown so the user never sees an admin chip
          mixed in with worker/company/agency/customer chips, and so
          the workspace switcher's user-facing UX is untouched.
          Clicking the badge navigates to the pilot panel. */}
      {isAdmin && !adminUiHidden && (
        <Link
          href="/dashboard/admin"
          aria-label={tSwitcher("adminPanelLink")}
          data-testid="role-switcher-admin-badge"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-brand-orange/40 bg-brand-orange/10 px-2 py-1.5 text-sm font-semibold text-brand-orange hover:border-brand-orange sm:px-3"
        >
          <span aria-hidden>⚙</span>
          <span className="hidden font-mono text-[11px] uppercase tracking-label sm:inline">
            {tSwitcher("adminMode")}
          </span>
        </Link>
      )}

      <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={tSwitcher("label")}
        className="inline-flex shrink-0 items-center gap-2 rounded-md border border-ink-500 bg-ink-800 px-2 py-1.5 text-sm text-text-primary hover:border-brand-blue sm:px-3"
      >
        <span aria-hidden>{activeRole ? ROLE_ICON[activeRole] : "•"}</span>
        <span className="hidden font-mono text-[11px] uppercase tracking-label text-text-secondary sm:inline">
          {activeRole ? t(`signup.role.${activeRole}`) : tSwitcher("label")}
        </span>
        <span aria-hidden className="text-text-muted">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-md border border-ink-500 bg-ink-900/95 p-2 shadow-card"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {tSwitcher("label")}
            </p>
            <button
              type="button"
              onClick={close}
              aria-label={tSwitcher("label")}
              data-testid="role-switcher-close"
              className="rounded-md border border-ink-500 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-secondary hover:border-brand-blue hover:text-text-primary"
            >
              ✕
            </button>
          </div>
          {/* Phase 6: honest non-locking framing right inside the menu so the
              user never wonders what RUOŠIAMA means. */}
          <p className="px-2 pb-2 text-[11px] leading-snug text-text-secondary">
            {tAccount("rolesIntro")}
          </p>
          {/* SR-2: pre-role-switch clarity — workspace view vs account
              identity; org-context expectation. */}
          <p className="px-2 pb-2 text-[11px] leading-snug text-text-muted">
            {tSwitcher("clarityNote")}
          </p>
          <ul className="flex flex-col gap-0.5">
            {roles.map((r) => {
              // Single source for "what chip belongs on this role?" — the
              // catalogue + the shared roleStatusChipKey helper. Keeps the
              // header dropdown and the dashboard catalogue card in
              // lock-step so they cannot disagree (PR #98 parity fix).
              const cfg = ROLE_BY_ID[r as LabourMarketRoleId];
              const chipKey = cfg ? roleStatusChipKey(cfg.availability) : null;
              const isHonestlyActive = chipKey === "roles.status.active";
              const chipTone = isHonestlyActive
                ? "border-state-success/40 text-state-success"
                : chipKey === "roles.status.start"
                  ? "border-brand-blue/40 text-brand-blue"
                  : "border-state-warning/40 text-state-warning";
              return (
                <li key={r}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    disabled={pending !== null}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-ink-700",
                      r === activeRole && "text-brand-blue",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden>{ROLE_ICON[r]}</span>
                      {t(`signup.role.${r}`)}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {chipKey && !isHonestlyActive && (
                        <span
                          className={cn(
                            "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label",
                            chipTone,
                          )}
                          data-testid={`role-switcher-chip-${r}`}
                        >
                          {chipKey === "roles.status.start"
                            ? tSwitcher("chip_start")
                            : chipKey === "roles.status.partial"
                              ? tSwitcher("chip_partial")
                              : tAccount("preview_workspace")}
                        </span>
                      )}
                      {r === activeRole && (
                        <span className="font-mono text-[10px] uppercase tracking-label text-state-live">
                          {tSwitcher("active_label")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {missing.length > 0 && (
            <>
              <hr className="my-2 border-ink-600" />
              <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
                {tSwitcher("add_role")}
              </p>
              <ul className="flex flex-col gap-0.5">
                {missing.map((r) => {
                  const cfg = ROLE_BY_ID[r as LabourMarketRoleId];
                  const chipKey = cfg
                    ? roleStatusChipKey(cfg.availability)
                    : null;
                  const isHonestlyActive = chipKey === "roles.status.active";
                  const chipTone = isHonestlyActive
                    ? "border-state-success/40 text-state-success"
                    : chipKey === "roles.status.start"
                      ? "border-brand-blue/40 text-brand-blue"
                      : "border-state-warning/40 text-state-warning";
                  const target = cfg
                    ? roleSwitcherTargetForRole(cfg, false)
                    : { kind: "switch" as const };
                  // PR #98 fix: clicking Įmonė / Agentūra / Pirkėjas no
                  // longer triggers addRole(r) with empty FormData (which
                  // previously inserted a row with legal_name=null — a
                  // half-baked entity). Instead we render a Link to the
                  // role's setupRoute so the user lands on the form and
                  // types the legal name there.
                  return (
                    <li key={r}>
                      {target.kind === "navigate" ? (
                        <Link
                          href={target.route as "/dashboard"}
                          onClick={() => setOpen(false)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-text-secondary hover:bg-ink-700"
                          data-testid={`role-switcher-missing-${r}-link`}
                        >
                          <span aria-hidden>{ROLE_ICON[r]}</span>
                          {t(`signup.role.${r}`)}
                          {chipKey && !isHonestlyActive && (
                            <span
                              className={cn(
                                "ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label",
                                chipTone,
                              )}
                              data-testid={`role-switcher-chip-missing-${r}`}
                            >
                              {chipKey === "roles.status.start"
                                ? tSwitcher("chip_start")
                                : chipKey === "roles.status.partial"
                                  ? tSwitcher("chip_partial")
                                  : tAccount("preview_workspace")}
                            </span>
                          )}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => pick(r)}
                          disabled={pending !== null}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-text-secondary hover:bg-ink-700"
                        >
                          <span aria-hidden>{ROLE_ICON[r]}</span>
                          {t(`signup.role.${r}`)}
                          {chipKey && !isHonestlyActive && (
                            <span
                              className={cn(
                                "ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label",
                                chipTone,
                              )}
                            >
                              {chipKey === "roles.status.start"
                                ? tSwitcher("chip_start")
                                : chipKey === "roles.status.partial"
                                  ? tSwitcher("chip_partial")
                                  : tAccount("preview_workspace")}
                            </span>
                          )}
                          {pending === r && (
                            <span className="ml-auto font-mono text-[10px] uppercase tracking-label text-text-muted">
                              {tSwitcher("switching")}
                            </span>
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
