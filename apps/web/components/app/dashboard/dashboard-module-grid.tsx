"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  Coins,
  Compass,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  Handshake,
  Home,
  IdCard,
  ListChecks,
  MapPin,
  MessageSquare,
  NotebookPen,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Store,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ActionCard } from "@/components/app/action-card";
import type { ControlRoomModule } from "@/lib/dashboard/control-room-view-model";
import type { ModuleIconKey } from "@/lib/dashboard/dashboard-module-registry";

/**
 * Role-specific control-room grid (PR B → owner UX recovery v1). Renders the
 * module list the pure view model produced from the ONE dashboard module
 * registry — this component owns presentation only (icons + the shared
 * ActionCard pattern) and can never invent a destination, a label or a count.
 *
 * Owner UX recovery v1: the grid is now the user's own configurable
 * workspace. Cards can be reordered, hidden and restored ("Tvarkyti") —
 * preferences are display-only, stored per device in localStorage (ids only,
 * never query text or PII), and NEVER change which destinations exist: the
 * registry + view model stay the single truth for routes, labels and badges.
 * A hidden card hides a shortcut, never a capability — the destination stays
 * reachable through nav and search.
 *
 * Every card is fully clickable (ActionCard = a real Link to the module's
 * real route) and carries a badge ONLY when its notification-spine count is
 * > 0 — the same numbers the bell shows, never a parallel count. Mobile:
 * the same compact 2-column grid the owner-approved MyZone grid used
 * (2 → 3 → 5 columns, no horizontal overflow).
 *
 * Icons live here because lucide is a presentation concern; the registry
 * only carries icon ids (same split as BottomNav / DashboardTabs). One icon
 * per destination across the whole app (audit PR8): journal = NotebookPen,
 * messages = MessageSquare, map = MapPin, documents = FileText.
 */
const ICONS: Record<ModuleIconKey, LucideIcon> = {
  home: Home,
  store: Store,
  map: MapPin,
  idCard: IdCard,
  journal: NotebookPen,
  messages: MessageSquare,
  user: User,
  shield: Shield,
  network: Users,
  compass: Compass,
  calendar: CalendarDays,
  documents: FileText,
  building: Building2,
  search: Search,
  bell: Bell,
  checklist: ListChecks,
  handshake: Handshake,
  briefcase: Briefcase,
  coins: Coins,
  sparkles: Sparkles,
  chart: BarChart3,
  gauge: Gauge,
};

/** Device-local card preferences — ids only. Version-keyed so a future shape
 *  change can never misread stale data. */
const CARD_PREFS_STORAGE_KEY = "lm.dashboard.moduleCards.v1";

interface CardPrefs {
  readonly order: readonly string[];
  readonly hidden: readonly string[];
}

const EMPTY_PREFS: CardPrefs = { order: [], hidden: [] };

/** Defensive parse — anything that is not a string[] pair is discarded. */
function parseCardPrefs(rawJson: string | null): CardPrefs {
  if (!rawJson) return EMPTY_PREFS;
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_PREFS;
    const p = parsed as { order?: unknown; hidden?: unknown };
    const strings = (v: unknown): readonly string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    return { order: strings(p.order), hidden: strings(p.hidden) };
  } catch {
    return EMPTY_PREFS;
  }
}

/** Saved order first (unknown ids dropped), then the registry's default
 *  order for anything the user never touched — a new module always appears. */
function applyOrder(
  modules: readonly ControlRoomModule[],
  order: readonly string[],
): readonly ControlRoomModule[] {
  if (order.length === 0) return modules;
  const byId = new Map(modules.map((m) => [m.id as string, m]));
  const ordered: ControlRoomModule[] = [];
  for (const id of order) {
    const m = byId.get(id);
    if (m) {
      ordered.push(m);
      byId.delete(id);
    }
  }
  for (const m of modules) if (byId.has(m.id as string)) ordered.push(m);
  return ordered;
}

export function DashboardModuleGrid({
  modules,
}: {
  modules: readonly ControlRoomModule[];
}) {
  const t = useTranslations();
  const tGrid = useTranslations("auth.dashboard.moduleGrid");
  const [prefs, setPrefs] = useState<CardPrefs>(EMPTY_PREFS);
  const [managing, setManaging] = useState(false);

  // Prefs are device-local display state; load after mount (SSR renders the
  // registry default so the grid is never empty / never hydration-broken).
  useEffect(() => {
    try {
      setPrefs(parseCardPrefs(window.localStorage.getItem(CARD_PREFS_STORAGE_KEY)));
    } catch {
      // storage unavailable (private mode) — the grid works without prefs
    }
  }, []);

  const persist = (next: CardPrefs) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(CARD_PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — display-only feature, nothing breaks
    }
  };

  const ordered = useMemo(() => applyOrder(modules, prefs.order), [modules, prefs.order]);
  const hiddenSet = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const visible = ordered.filter((m) => !hiddenSet.has(m.id as string));
  const hiddenModules = ordered.filter((m) => hiddenSet.has(m.id as string));

  const move = (id: string, delta: -1 | 1) => {
    const ids = ordered.map((m) => m.id as string);
    const idx = ids.indexOf(id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= ids.length) return;
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    persist({ order: ids, hidden: prefs.hidden });
  };

  const setHidden = (id: string, hide: boolean) => {
    const hidden = hide
      ? [...prefs.hidden.filter((x) => x !== id), id]
      : prefs.hidden.filter((x) => x !== id);
    persist({ order: prefs.order, hidden });
  };

  if (modules.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" data-testid="dashboard-module-grid">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight text-text-primary">
          {t("auth.dashboard.myZone.actionsHeading")}
        </h2>
        <button
          type="button"
          onClick={() => setManaging((v) => !v)}
          aria-pressed={managing}
          data-testid="module-grid-manage-toggle"
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-500 px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          <Settings2 aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
          {managing ? tGrid("done") : tGrid("manage")}
        </button>
      </div>

      {!managing ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((m) => (
            <ActionCard
              key={m.id}
              href={m.route}
              testid={`dashboard-module-${m.id}`}
              icon={ICONS[m.iconKey]}
              badgeCount={m.badgeCount}
              title={t(m.labelKey)}
              description={t(m.descriptionKey)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {visible.map((m, i) => {
              const Icon = ICONS[m.iconKey];
              const title = t(m.labelKey);
              return (
                <div
                  key={m.id}
                  data-testid={`dashboard-module-manage-${m.id}`}
                  className="flex min-h-11 flex-col gap-1.5 rounded-xl border border-brand-blue/40 bg-surface-1 p-3"
                >
                  <span className="flex items-start justify-between gap-2">
                    <Icon aria-hidden className="h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} />
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(m.id as string, -1)}
                        disabled={i === 0}
                        aria-label={`${tGrid("moveUp")}: ${title}`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue disabled:opacity-30"
                      >
                        <ArrowUp aria-hidden className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(m.id as string, 1)}
                        disabled={i === visible.length - 1}
                        aria-label={`${tGrid("moveDown")}: ${title}`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue disabled:opacity-30"
                      >
                        <ArrowDown aria-hidden className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setHidden(m.id as string, true)}
                        aria-label={`${tGrid("hide")}: ${title}`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-ink-500 text-text-secondary transition-colors hover:border-brand-orange"
                      >
                        <EyeOff aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </span>
                  <span className="font-display text-sm font-semibold leading-snug text-text-primary">
                    {title}
                  </span>
                </div>
              );
            })}
          </div>

          {hiddenModules.length > 0 && (
            <div className="flex flex-col gap-1.5" data-testid="module-grid-hidden">
              <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {tGrid("hiddenTitle")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {hiddenModules.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setHidden(m.id as string, false)}
                    data-testid={`dashboard-module-restore-${m.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800/40 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
                  >
                    <Eye aria-hidden className="h-3.5 w-3.5" />
                    {t(m.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
