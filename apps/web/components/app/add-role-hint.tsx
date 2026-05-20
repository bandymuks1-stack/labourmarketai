"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";

/** Inline "add this role" CTA used by the Customer offer-section hint and
 *  similar prompts. Pure context call — no extra UI. */
export function AddRoleHint({
  label,
  role,
}: {
  label: string;
  role: Role;
}) {
  const { addRole } = useAuth();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => start(() => addRole(role))}
    >
      {label}
    </Button>
  );
}
