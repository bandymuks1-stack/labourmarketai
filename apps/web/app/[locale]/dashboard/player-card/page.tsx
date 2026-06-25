import { redirect } from "next/navigation";

/**
 * Player-card merged into Mano CV (owner IA cleanup, 2026-06-25). The premium
 * player-card / avatar identity is now the visual layer that LEADS the Mano CV
 * surface (the work-records surface at `/dashboard/journal`), not a separate
 * competing identity page — so this route redirects to the one place the
 * marketplace identity lives.
 */
export default async function PlayerCardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard/journal`);
}
