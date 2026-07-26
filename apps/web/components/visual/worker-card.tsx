import { CircleUserRound, ShieldCheck } from "lucide-react";

import { avatarMonogram } from "@/lib/visual/avatar-monogram";

/** Premium player-card-style worker tile — first surface in the
 *  Visual Dashboard OS direction (Agentai visual-sprint, 2026-05-
 *  28). Photo-first when consent is signalled, geometric monogram
 *  otherwise; never synthesises a face.
 *
 *  Pure presentational. Receives the entity through props; never
 *  fetches data itself. The page wiring (e.g. /dashboard/talent)
 *  maps domain rows → WorkerCardEntity before rendering. */
export interface WorkerCardEntity {
  readonly id: string;
  readonly displayName: string;
  readonly roleLabel: string;
  readonly region: string;
  /** At most 3 are rendered as chips. */
  readonly topSkills: readonly string[];
  readonly evidenceCount: number;
  readonly hasPhoto: boolean;
  readonly photoUrl?: string;
  readonly lastActiveBucket: "active" | "recent" | "dormant";
}

const ACTIVITY_DOT: Record<WorkerCardEntity["lastActiveBucket"], string> = {
  active: "bg-emerald-500",
  recent: "bg-amber-500",
  dormant: "bg-zinc-400",
};

export function WorkerCard({ worker }: { readonly worker: WorkerCardEntity }) {
  const skills = worker.topSkills.slice(0, 3);
  const monogram = avatarMonogram(worker.displayName);
  return (
    <article
      // Interaction contract (user-journey repair v1): this card is
      // presentational — no link/handler — so it must not advertise
      // interactivity via hover elevation that impersonates a button.
      className="group relative flex flex-col gap-3 rounded-card border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      data-testid={`worker-card-${worker.id}`}
    >
      <header className="flex items-center gap-3">
        {worker.hasPhoto && worker.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={worker.photoUrl}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-base font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            aria-hidden="true"
          >
            {monogram}
          </div>
        )}
        <div className="flex flex-1 flex-col">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {worker.displayName}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {worker.roleLabel} · {worker.region}
          </p>
        </div>
        <span
          className={`inline-block h-2 w-2 rounded-full ${ACTIVITY_DOT[worker.lastActiveBucket]}`}
          aria-label={`last-active ${worker.lastActiveBucket}`}
        />
      </header>

      <ul className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <li
            key={skill}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <CircleUserRound className="h-3 w-3" aria-hidden="true" />
            <span>{skill}</span>
          </li>
        ))}
      </ul>

      <footer className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          {worker.evidenceCount} evidence {worker.evidenceCount === 1 ? "item" : "items"}
        </span>
      </footer>
    </article>
  );
}
