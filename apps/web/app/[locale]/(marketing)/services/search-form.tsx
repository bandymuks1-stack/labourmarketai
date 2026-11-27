"use client";

import { useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/** Enhance the native GET form with the same transition feedback as app actions. */
export function ServiceSearchForm({
  action,
  label,
  pendingLabel,
  children,
}: {
  action: string;
  label: string;
  pendingLabel: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const [name, value] of fields) {
      if (typeof value === "string") query.append(name, value);
    }
    startTransition(() => router.push(action + "?" + query.toString()));
  }

  return (
    <form
      method="get"
      action={action}
      onSubmit={submit}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]"
      role="search"
      aria-label={label}
    >
      {children}
      <Button type="submit" loading={pending} className="min-h-11 self-end">{label}</Button>
      <span role="status" className="sr-only">{pending ? pendingLabel : ""}</span>
    </form>
  );
}
