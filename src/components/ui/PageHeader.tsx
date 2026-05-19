import { Eyebrow } from "./Eyebrow";

export function PageHeader({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rise mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-line/60 pb-7">
      <div className="max-w-2xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="display mt-3 text-3xl sm:text-4xl">{title}</h1>
        {lead ? (
          <p className="mt-3 text-sm leading-relaxed text-fg-dim">{lead}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
