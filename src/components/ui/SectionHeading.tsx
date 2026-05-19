import { Eyebrow } from "./Eyebrow";

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div
      className={
        align === "center"
          ? "mx-auto max-w-2xl text-center"
          : "max-w-2xl"
      }
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="display mt-4 text-3xl sm:text-4xl">{title}</h2>
      {lead ? (
        <p className="mt-4 text-base leading-relaxed text-fg-dim">{lead}</p>
      ) : null}
    </div>
  );
}
