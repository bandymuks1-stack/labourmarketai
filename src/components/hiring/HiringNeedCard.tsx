/**
 * HiringNeedCard — an open role, anchored to its company.
 *
 * Reuses the canonical CompanyPlayerCard for the company identity and renders
 * the need details around it. No separate company visual is created here.
 */
import { CompanyPlayerCard } from "@/components/company/CompanyPlayerCard";
import type { CompanyProfile, HiringNeed } from "@/lib/types";

const STATUS_STYLE: Record<HiringNeed["status"], string> = {
  draft: "text-fg-mute",
  open: "text-emerald",
  filled: "text-violet",
};

export function HiringNeedCard({
  need,
  company,
}: {
  need: HiringNeed;
  company: CompanyProfile;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,1.1fr)]">
      <CompanyPlayerCard company={company} />

      <div className="glass glass-hover flex flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold leading-tight">
              {need.roleTitle}
            </h3>
            <p className="mt-1 text-sm text-fg-dim">{need.location}</p>
          </div>
          <span
            className={`text-[0.7rem] font-semibold uppercase tracking-wider ${STATUS_STYLE[need.status]}`}
          >
            {need.status}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { label: "Engagement", value: need.engagement },
            { label: "Seats", value: String(need.seats) },
            { label: "Start", value: need.startWindow },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-line/60 bg-fg/[0.02] px-2 py-2"
            >
              <div className="text-sm font-medium capitalize">
                {item.value}
              </div>
              <div className="mt-0.5 text-[0.6rem] uppercase tracking-wider text-fg-mute">
                {item.label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-fg-mute">
            Must-have skills
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {need.mustHaveSkills.map((skill) => (
              <span key={skill} className="chip">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
