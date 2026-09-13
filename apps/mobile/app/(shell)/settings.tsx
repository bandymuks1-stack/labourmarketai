import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ACTIVE_LOCALES, isPreviewTranslation } from "@labourmarket/client-core";

import type { ContextListData, ContextSwitchData } from "../../src/capability-shapes";
import { useActorContext } from "../../src/context-provider";
import { useAuth } from "../../src/auth-context";
import { capability } from "../../src/domain";
import { useCapability } from "../../src/use-capability";
import { useLocale } from "../../src/i18n/locale-context";
import { LANGUAGE_NAMES } from "../../src/i18n/messages";
import { Body, Button, Divider, NotAvailable, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";

/**
 * SETTINGS — language, WORKSPACE, participation context, sign-out.
 *
 * Language and sign-out need nothing from the canonical domain, so they are
 * real.
 *
 * ACTING FOR is real too, as of `context.list`: which organization this person
 * is currently acting for, and a way to change it. Switching writes the
 * DURABLE pointer through `context.switch`, the same core the web switcher
 * runs, so the device and the server cannot hold different answers.
 *
 * WHAT THIS POINTER DOES NOT DO, because the first version of this screen
 * claimed it did: it does NOT decide where a Work Journal entry lands. A
 * journal draft resolves its engagement context from `engagement_contexts` by
 * its own rule hierarchy and asks when that is ambiguous — it never consults
 * `profiles.active_organization_id`. So a person can be acting for
 * organization A while an entry is drafted against their engagement at B, and
 * that is correct: belonging to an organization and having a live work
 * engagement there are different facts. The composer already shows and asks
 * for the work context; this section must not imply it decides one.
 *
 * PARTICIPATION CONTEXT is a DIFFERENT AXIS, and it is real now too. A
 * workspace is an organization the person belongs to; a participation mode is
 * how they take part (worker / company / agency / customer). A company-type
 * organization does not make its employee an employer, so the workspace list
 * could never supply the mode — the modes come from the account's own held
 * roles, carried on `profile.get` and mapped by `holdingsFromHeldRoles`.
 *
 * Four states, and the distinctions between them are the point: still asking,
 * a read that could not answer, an answer of NOTHING, and a real list. The
 * middle two look identical if you are careless, and rendering a failure as
 * "you hold nothing" is the defect that was live on the web shell in August.
 *
 * Every active language is offered, and the ones that are AI-seeded and
 * awaiting human review are labelled as previews (doctrine §7.4) — the same
 * honesty the web selector applies. A person choosing Russian should know it
 * has not been read by a Russian speaker yet.
 */
export default function Settings() {
  const { locale, setLocale, t } = useLocale();
  const { holdings, active, switchTo } = useActorContext();
  const { signOut, busy, state, accessToken } = useAuth();

  const workspaces = useCapability<ContextListData>("context.list");
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // Bound once: narrowing a property access does not survive into the map
  // callback below.
  const listed = workspaces.state.status === "loaded" ? workspaces.state.data : null;
  const canSwitch = listed !== null && listed.pointerAvailable;

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      setSwitchError(null);
      setSwitching(workspaceId);
      const result = await capability<ContextSwitchData>({
        name: "context.switch",
        args: { workspace: workspaceId },
        accessToken,
        locale,
      });
      setSwitching(null);
      if (!result.ok) {
        setSwitchError(t("workspace.switchFailed"));
        return;
      }
      if (result.data.status !== "switched") {
        // The server could not resolve the id to exactly one workspace. It
        // switched NOTHING, so the list is re-read rather than a local guess
        // being painted over the truth.
        setSwitchError(t("workspace.switchFailed"));
      }
      workspaces.reload();
    },
    [accessToken, locale, t, workspaces],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("language.title")}</Title>
        <View style={styles.list}>
          {ACTIVE_LOCALES.map((code) => {
            const selected = code === locale;
            return (
              <Pressable
                key={code}
                testID={`language-${code}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={LANGUAGE_NAMES[code]}
                onPress={() => void setLocale(code)}
                style={({ pressed }) => [
                  styles.row,
                  selected && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={styles.rowLabel}>{LANGUAGE_NAMES[code]}</Text>
                {isPreviewTranslation(code) ? (
                  <Text style={styles.tag}>{t("language.preview")}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Divider />

        <Title>{t("workspace.title")}</Title>
        {workspaces.state.status === "loading" ? (
          <Body muted>{t("workspace.loading")}</Body>
        ) : workspaces.state.status === "failed" ? (
          // A failed read is a failure, never an empty list: "you belong to no
          // organization" is a different and false statement.
          <NotAvailable
            title={t("workspace.failed.title")}
            body={t("workspace.failed.body")}
          />
        ) : listed === null ? null : (
          <>
            <View style={styles.list}>
              {listed.workspaces.map((w) => {
                const selected = w.id === listed.activeWorkspaceId;
                return (
                  <Pressable
                    key={w.id}
                    testID={`workspace-${w.id}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: !canSwitch }}
                    accessibilityLabel={w.label}
                    disabled={!canSwitch || switching !== null}
                    onPress={() => void switchWorkspace(w.id)}
                    style={({ pressed }) => [
                      styles.row,
                      selected && styles.rowSelected,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <Text style={styles.rowLabel}>{w.label}</Text>
                    {switching === w.id ? (
                      <Text style={styles.tag}>{t("workspace.switching")}</Text>
                    ) : selected ? (
                      <Text style={styles.tag}>{t("workspace.active")}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            {/* The pointer migration is not applied here: what is shown is the
                resolver's default, not a stored choice, and a switch would be
                refused. Say it rather than offer a control that cannot work. */}
            {!canSwitch ? <Body muted>{t("workspace.pointerUnavailable")}</Body> : null}
            {switchError !== null ? <Body muted>{switchError}</Body> : null}
          </>
        )}

        <Divider />

        <Title>{t("context.title")}</Title>
        {holdings.status === "unknown" ? (
          <Body muted>{t("context.loading")}</Body>
        ) : holdings.status === "known" && holdings.contexts.length === 0 ? (
          // The read ANSWERED and this account holds no participation role.
          // That is a fact about the account, not a failure, and it must not
          // render as a bare heading over nothing.
          <Body muted>{t("context.none")}</Body>
        ) : holdings.status === "known" ? (
          <View style={styles.list}>
            {holdings.contexts.map((context) => {
              const selected = active !== null && active.mode === context.mode;
              return (
                <Pressable
                  key={context.mode}
                  testID={`context-${context.mode}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={context.label}
                  onPress={() => switchTo(context)}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelected,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Text style={styles.rowLabel}>{context.label}</Text>
                  {selected ? <Text style={styles.tag}>{t("context.active")}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <NotAvailable
            title={t("context.unavailable.title")}
            body={t("context.unavailable.body")}
          />
        )}

        <Divider />

        {state.status === "signed_in" ? (
          // The account's own identifier, not a name we could only have got by
          // reading a profile we cannot read. Showing the wrong person's name
          // would be worse than showing none.
          <Body muted>{state.session.userId}</Body>
        ) : null}
        <Button
          testID="sign-out"
          variant="quiet"
          busy={busy}
          label={t("auth.signOut")}
          onPress={() => void signOut()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  list: { gap: theme.space.sm },
  row: {
    minHeight: theme.minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  rowSelected: {
    borderColor: theme.color.accent,
    backgroundColor: theme.color.surfaceRaised,
  },
  rowPressed: { opacity: 0.75 },
  rowLabel: { color: theme.color.text, fontSize: theme.font.body },
  tag: {
    color: theme.color.warning,
    fontSize: theme.font.small,
  },
});
