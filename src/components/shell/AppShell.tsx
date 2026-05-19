"use client";

/**
 * AppShell — the workspace frame for every /app surface.
 *
 * One shell, one nav. Each canonical concern has exactly one entry. The shell
 * never owns data; it only frames the active surface.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/ui/Wordmark";
import { appNav } from "@/config/site";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="arena min-h-screen">
      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-8">
        <aside className="sticky top-8 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col lg:flex">
          <Wordmark />
          <nav className="mt-10 flex-1 space-y-1">
            {appNav.map((item) => {
              const active =
                item.href === "/app"
                  ? pathname === "/app"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex flex-col rounded-xl px-3.5 py-2.5 transition ${
                    active
                      ? "bg-fg/[0.06] text-fg ring-1 ring-cyan/30"
                      : "text-fg-dim hover:bg-fg/[0.03] hover:text-fg"
                  }`}
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-[0.7rem] text-fg-mute">
                    {item.hint}
                  </span>
                </Link>
              );
            })}
          </nav>
          <Link
            href="/admin"
            className="mt-4 rounded-xl border border-line/60 px-3.5 py-2.5 text-sm text-fg-mute transition hover:text-fg"
          >
            Admin console →
          </Link>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
