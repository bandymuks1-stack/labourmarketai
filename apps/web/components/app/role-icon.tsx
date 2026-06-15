import {
  HardHat,
  Building2,
  Handshake,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth/actions";

/**
 * Premium role icons — a single source of truth so every surface
 * (account page, role switcher, notification panel, onboarding) renders
 * the SAME professional outline icon per role instead of emoji.
 *
 * worker → hard hat · company → building · agency → handshake
 * (partnership/coordination, NOT a separate product) · customer →
 * shopping cart (a buying ACTION, not a silo).
 *
 * No 'use client' directive: it is a pure presentational component, so
 * both server and client components can import it.
 */
const ROLE_LUCIDE: Record<Role, LucideIcon> = {
  worker: HardHat,
  company: Building2,
  agency: Handshake,
  customer: ShoppingCart,
};

export function RoleIcon({
  role,
  className = "h-4 w-4",
}: {
  role: Role;
  className?: string;
}) {
  const Icon = ROLE_LUCIDE[role] ?? Building2;
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
