"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Eye, EyeOff, Settings2 } from "lucide-react";

/**
 * S9 — saved screen layout (reorder / hide / show) for the command center.
 * Preferences live in THIS DEVICE's localStorage only (said honestly in the
 * UI) — no DB, no migration, no cross-device claim. Default order comes from
 * the server; the saved order is applied after mount. Hiding a section never
 * deletes anything — a hidden section returns with one tap.
 */

export interface PrefSection {
  readonly id: string;
  readonly label: string;
  readonly node: ReactNode;
}

interface Prefs {
  order: string[];
  hidden: string[];
}

function loadPrefs(key: string): Prefs | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Prefs;
    if (!Array.isArray(p.order) || !Array.isArray(p.hidden)) return null;
    return p;
  } catch {
    return null;
  }
}

export function SectionPrefs({
  storageKey,
  sections,
}: {
  storageKey: string;
  sections: readonly PrefSection[];
}) {
  const t = useTranslations("todayScreen.layout");
  const defaultOrder = sections.map((s) => s.id);
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const saved = loadPrefs(storageKey);
    if (!saved) return;
    // Unknown ids dropped, new sections appended — never lose a section.
    const known = saved.order.filter((id) => defaultOrder.includes(id));
    const added = defaultOrder.filter((id) => !known.includes(id));
    setOrder([...known, ...added]);
    setHidden(saved.hidden.filter((id) => defaultOrder.includes(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const save = (nextOrder: string[], nextHidden: string[]) => {
    setOrder(nextOrder);
    setHidden(nextHidden);
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ order: nextOrder, hidden: nextHidden }),
      );
    } catch {
      // storage unavailable — layout just stays per-render
    }
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = order.indexOf(id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    [next[idx], next[to]] = [next[to], next[idx]];
    save(next, hidden);
  };
  const toggleHidden = (id: string) =>
    save(
      order,
      hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id],
    );

  const byId = new Map(sections.map((s) => [s.id, s]));

  return (
    <div className="flex flex-col gap-4" data-testid="section-prefs">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-pressed={editing}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-text-muted transition-colors duration-fast hover:border-brand-blue hover:text-brand-blue"
          data-testid="layout-edit-toggle"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          {editing ? t("doneButton") : t("editButton")}
        </button>
      </div>
      {editing ? (
        <p className="text-[11px] leading-relaxed text-text-muted" data-testid="layout-device-note">
          {t("deviceNote")}
        </p>
      ) : null}

      {order.map((id) => {
        const s = byId.get(id);
        if (!s) return null;
        const isHidden = hidden.includes(id);
        if (isHidden && !editing) return null;
        return (
          <div key={id} className="flex flex-col gap-1.5">
            {editing ? (
              <div className="flex items-center gap-1.5">
                <span className="mr-auto font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {s.label}
                </span>
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  aria-label={`${s.label} ↑`}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-ink-500 text-text-muted hover:border-brand-blue hover:text-brand-blue"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  aria-label={`${s.label} ↓`}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-ink-500 text-text-muted hover:border-brand-blue hover:text-brand-blue"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => toggleHidden(id)}
                  aria-pressed={isHidden}
                  aria-label={s.label}
                  className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                    isHidden
                      ? "border-state-warning/50 text-state-warning"
                      : "border-ink-500 text-text-muted hover:border-brand-blue hover:text-brand-blue"
                  }`}
                  data-testid="layout-hide-toggle"
                >
                  {isHidden ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
            ) : null}
            {isHidden && editing ? (
              <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-[11px] text-text-muted">
                {t("hiddenNote", { section: s.label })}
              </p>
            ) : !isHidden ? (
              s.node
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
