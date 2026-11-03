"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Read again — re-runs the home's server readers (`router.refresh()`), so a
 * region whose read failed gets a second chance without reloading the page
 * or losing the conversation. Quiet by default (a text action inside a
 * region); `prominent` is the bordered button the availability notice uses.
 * Never gold: the gold action on the home is the next step, not a retry.
 */
export function HomeRetry({
  label,
  pendingLabel,
  testid,
  prominent = false,
}: {
  readonly label: string;
  readonly pendingLabel: string;
  readonly testid: string;
  readonly prominent?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      data-testid={testid}
      aria-busy={pending || undefined}
      disabled={pending}
      onClick={() => start(() => router.refresh())}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 text-support font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-60",
        prominent
          ? "rounded-control border border-ink-500 px-4 text-text-primary hover:border-text-muted max-md:w-full"
          : "self-start text-text-primary underline underline-offset-4 hover:text-text-secondary",
      )}
    >
      <svg aria-hidden viewBox="0 0 16 16" className={cn("h-4 w-4", pending && "animate-spin motion-reduce:animate-none")}>
        <path
          d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {pending ? pendingLabel : label}
    </button>
  );
}
