import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/**
 * Layout wrappers for the project-invoicing surfaces. They paint through the
 * canonical `Card` primitive (visual contract v1), so the invoicing pages carry
 * no hand-typed `card-border`. Pure server components; no state, no copy.
 */
export function InvoicePanel({
  id,
  testId,
  gap = 3,
  children,
}: {
  id?: string;
  testId?: string;
  gap?: 1 | 2 | 3 | 4;
  children: React.ReactNode;
}) {
  const gapClass = { 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4" }[gap];
  return (
    <section id={id} data-testid={testId}>
      <Card compact>
        <div className={cn("flex flex-col", gapClass)}>{children}</div>
      </Card>
    </section>
  );
}

/** A one-paragraph card: notices, disclaimers and honest states. */
export function InvoiceNote({
  className,
  testId,
  role,
  children,
}: {
  className?: string;
  testId?: string;
  role?: "status";
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId} role={role}>
      <Card compact>
        <p className={className}>{children}</p>
      </Card>
    </div>
  );
}
