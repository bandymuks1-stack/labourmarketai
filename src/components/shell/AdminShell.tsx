/**
 * AdminShell — operational console frame.
 *
 * A management shell only: an operational directory of entities and system
 * signals. It is intentionally NOT an approval queue and NOT a gatekeeping
 * surface — onboarding and matching stay automated and self-serve.
 */
import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { adminNav } from "@/config/site";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="arena min-h-screen">
      <header className="border-b border-line/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-4">
            <Wordmark />
            <span className="chip border-amber/30 text-amber">
              Operational console
            </span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            {adminNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-fg-dim transition hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/app"
              className="text-fg-mute transition hover:text-fg"
            >
              ← Workspace
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
