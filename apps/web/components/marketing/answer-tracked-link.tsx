"use client";
/**
 * A link that fires a bounded answer-engine analytics event on click. Payload is
 * PII-free (surface + entity_type=category only). Internal links use the i18n
 * Link; external source links use a plain anchor with rel="noopener".
 */
import { Link } from "@/lib/i18n/navigation";
import { recordEvent } from "@/lib/telemetry/task";

type Ev =
  | "answer_related_question_opened"
  | "answer_product_cta_clicked"
  | "answer_source_opened"
  | "answer_language_switched";

export function AnswerTrackedLink({
  href,
  event,
  category,
  external = false,
  className,
  children,
}: {
  href: string;
  event: Ev;
  category: string;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const onClick = () =>
    recordEvent(event, { surface: "answer_page", entity_type: category });
  if (external) {
    return (
      <a href={href} className={className} rel="noopener noreferrer" target="_blank" onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
