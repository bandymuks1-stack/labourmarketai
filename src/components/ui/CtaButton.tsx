import Link from "next/link";

export function CtaButton({
  href,
  children,
  kind = "primary",
}: {
  href: string;
  children: React.ReactNode;
  kind?: "primary" | "ghost";
}) {
  return (
    <Link
      href={href}
      className={`cta ${kind === "primary" ? "cta-primary" : "cta-ghost"}`}
    >
      {children}
      <span aria-hidden>→</span>
    </Link>
  );
}
