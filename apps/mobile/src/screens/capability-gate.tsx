import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";

import { failureKey, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import { Body, Button, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import type { CapabilityState } from "../use-capability";

/**
 * WHAT A SCREEN SHOWS AROUND A CAPABILITY READ.
 *
 * The successor to the pre-gate NotConnectedScreen, carrying the same three
 * refusals forward now that real reads exist:
 *
 *   - It does not render an empty list for a failed read. An empty list means
 *     "you have nothing recorded", and a failure means "we could not ask".
 *     Only a screen holding a LOADED, genuinely empty answer may say "nothing
 *     recorded yet" — and that sentence is the screen's, not this component's.
 *   - It does not show sample content. Doctrine §18: nothing unmarked may look
 *     like platform data.
 *   - It does not spin forever. The spinner here has a real request behind it,
 *     and every outcome of that request resolves to content or to a sentence.
 *
 * Failures render the catalogue sentence for the failure kind (localized),
 * the server's own words as muted detail when it said any, and a retry.
 * `refusalText` lets a screen translate a KNOWN capability code (for example
 * `no_worker_profile`) into its own honest, localized sentence.
 */
export function CapabilityGate<T>({
  state,
  reload,
  refusalText,
  children,
}: {
  state: CapabilityState<T>;
  reload: () => void;
  refusalText?: (code: string) => string | null;
  children: (data: T) => React.ReactNode;
}) {
  const { t } = useLocale();

  if (state.status === "loading") {
    return (
      <View style={styles.loading} accessibilityLabel={t("domain.loading")}>
        <ActivityIndicator color={theme.color.accent} />
        <Body muted>{t("domain.loading")}</Body>
      </View>
    );
  }

  if (state.status === "failed") {
    const known = knownRefusal(state.failure, refusalText);
    if (known !== null) {
      // A refusal the screen can name in the person's language — a finding,
      // not an error, so no retry button pretending it might change.
      return <NotAvailable title={t("domain.failedTitle")} body={known} />;
    }
    return (
      <NotAvailable
        title={t("domain.failedTitle")}
        body={t(failureKey(state.failure))}
      >
        {detailOf(state.failure) !== null ? (
          <Body muted>{detailOf(state.failure)}</Body>
        ) : null}
        <Button
          variant="quiet"
          testID="capability-retry"
          label={t("domain.retry")}
          onPress={reload}
        />
      </NotAvailable>
    );
  }

  return <>{children(state.data)}</>;
}

function knownRefusal(
  failure: DomainFailure,
  refusalText: ((code: string) => string | null) | undefined,
): string | null {
  if (failure.kind !== "capability_refused" || refusalText === undefined) {
    return null;
  }
  return refusalText(failure.code);
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

const styles = StyleSheet.create({
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    minHeight: theme.minTouchTarget,
  },
});
