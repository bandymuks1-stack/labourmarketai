import type { Metadata } from "next";
import { AdminShell } from "@/components/shell/AdminShell";
import {
  SAMPLE_NOTICE,
  sampleCompanies,
  sampleHiringNeeds,
  sampleProfiles,
} from "@/lib/sample-data";

export const metadata: Metadata = { title: "Admin console" };

/**
 * /admin — operational management shell.
 *
 * An operational directory of entities and system signals only. By design it
 * is NOT an approval queue and NOT a gatekeeping surface: onboarding and
 * matching are automated and self-serve.
 */
export default function AdminPage() {
  const verifiedPeople = sampleProfiles.filter((p) => p.verified).length;
  const openNeeds = sampleHiringNeeds.filter(
    (n) => n.status === "open",
  ).length;

  const metrics = [
    { label: "People", value: sampleProfiles.length },
    { label: "Companies", value: sampleCompanies.length },
    { label: "Open needs", value: openNeeds },
    { label: "Verified people", value: verifiedPeople },
  ];

  return (
    <AdminShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl">Operational directory</h1>
          <p className="mt-2 max-w-2xl text-sm text-fg-dim">
            Visibility into entities and signals. No gatekeeping queues —
            onboarding and matching run automatically and self-serve.
          </p>
        </div>
        <span className="chip">{SAMPLE_NOTICE}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="glass p-6">
            <div className="text-3xl font-bold grad-text">{m.value}</div>
            <div className="mt-2 text-[0.7rem] uppercase tracking-wider text-fg-mute">
              {m.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 glass overflow-hidden">
        <div className="border-b border-line/60 px-6 py-4">
          <h2 className="text-lg font-semibold">Entity directory</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-[0.7rem] uppercase tracking-wider text-fg-mute">
            <tr className="border-b border-line/60">
              <th className="px-6 py-3 font-medium">Entity</th>
              <th className="px-6 py-3 font-medium">Kind</th>
              <th className="px-6 py-3 font-medium">Signal</th>
              <th className="px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sampleProfiles.map((p) => (
              <tr
                key={p.id}
                className="border-b border-line/40 last:border-0"
              >
                <td className="px-6 py-3 font-medium">{p.displayName}</td>
                <td className="px-6 py-3 capitalize text-fg-dim">
                  {p.role}
                </td>
                <td className="px-6 py-3 tabular-nums text-cyan">
                  {p.signalScore}
                </td>
                <td className="px-6 py-3 text-fg-dim">
                  {p.verified ? "Verified" : "Self-serve"}
                </td>
              </tr>
            ))}
            {sampleCompanies.map((c) => (
              <tr
                key={c.id}
                className="border-b border-line/40 last:border-0"
              >
                <td className="px-6 py-3 font-medium">{c.name}</td>
                <td className="px-6 py-3 text-fg-dim">company</td>
                <td className="px-6 py-3 tabular-nums text-cyan">
                  {c.signalScore}
                </td>
                <td className="px-6 py-3 text-fg-dim">
                  {c.hiring ? "Hiring" : "Idle"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
