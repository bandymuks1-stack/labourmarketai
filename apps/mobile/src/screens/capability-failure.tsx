import React from "react";

import { failureKey, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { Body, Button, NotAvailable } from "../ui/primitives";

/**
 * HOW A FAILURE IS SHOWN — once, for reads and for writes alike.
 *
 * Extracted from `CapabilityGate` when the journal composer needed the same
 * rules for a failed WRITE. The rules were worth exactly one implementation:
 *
 *   - A failure the screen can NAME in the person's language is a finding, so
 *     it gets no retry button pretending it might change on a second try.
 *   - Any other failure gets the catalogue sentence for its kind, the
 *     SERVER'S OWN words as muted detail when it said any, and a retry.
 *   - Nothing here invents a reason. `detailOf` returns only text the server
 *     or the transport actually produced.
 *
 * `title` differs between reads and writes ("we could not load this" is a lie
 * on a save), so it is a parameter rather than a constant.
 */
export function CapabilityFailureNotice({
  failure,
  title = "domain.failedTitle",
  refusalText,
  retry,
  tone,
  testID,
}: {
  failure: DomainFailure;
  title?: MessageKey;
  /** Translate a KNOWN capability code into this screen's own sentence. */
  refusalText?: (code: string) => string | null;
  /** Omitted when a retry cannot honestly help. */
  retry?: () => void;
  tone?: "info" | "warning";
  testID?: string;
}) {
  const { t } = useLocale();
  const known =
    failure.kind === "capability_refused" && refusalText !== undefined
      ? refusalText(failure.code)
      : null;

  if (known !== null) {
    return (
      <NotAvailable testID={testID} tone={tone} title={t(title)} body={known} />
    );
  }

  const detail = detailOf(failure);
  return (
    <NotAvailable testID={testID} tone={tone} title={t(title)} body={t(failureKey(failure))}>
      {detail !== null ? <Body muted>{detail}</Body> : null}
      {retry !== undefined ? (
        <Button
          variant="quiet"
          testID="capability-retry"
          label={t("domain.retry")}
          onPress={retry}
        />
      ) : null}
    </NotAvailable>
  );
}

/** The server's own words, when it said any — shown muted, never invented. */
function detailOf(failure: DomainFailure): string | null {
  switch (failure.kind) {
    case "capability_refused":
      return failure.message;
    case "unreachable":
      return failure.detail;
    case "transport_unavailable":
      return failure.because;
    default:
      return null;
  }
}
