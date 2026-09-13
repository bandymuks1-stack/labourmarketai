import { redirect } from "next/navigation";

/**
 * Alias only. "Mano veikla skaičiais" is a VIEW of the journal route
 * (`/dashboard/journal?view=numbers`, see `../work-in-numbers-station.tsx`)
 * — the Product Constitution (A-01) reserves a new page to an owner ruling.
 * Links that name this path keep working; the query is carried over.
 */
export default async function WorkInNumbersAliasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = (await searchParams) ?? {};
  const q = new URLSearchParams({ view: "numbers" });
  for (const k of ["period", "from", "to"] as const) {
    const v = sp[k];
    if (typeof v === "string" && v.length > 0) q.set(k, v);
  }
  redirect(`/${locale}/dashboard/journal?${q.toString()}`);
}
