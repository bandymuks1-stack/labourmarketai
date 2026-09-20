import React, { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ACTIVE_LOCALES, isPreviewTranslation } from "@labourmarket/client-core";

import type { ContextListData, ContextSwitchData } from "../../src/capability-shapes";
import { CONFIG } from "../../src/config";
import { useActorContext } from "../../src/context-provider";
import { useProfile } from "../../src/profile-provider";
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
 *
 * PRIVACY & ACCOUNT are links, not a second implementation. Data export and
 * account deletion are the web's self-service privacy requests
 * (`/<locale>/dashboard/privacy`, `lib/privacy/privacy-request-model.ts`,
 * kind `account_deletion`); the terms live at `/<locale>/legal/terms`. App
 * Store guideline 5.1.1(v) requires that a person can reach account deletion
 * from inside the app, and the honest way to meet it is to open the path that
 * already exists rather than fork the rule onto a phone. The links are built
 * on the SAME origin this build talks to (`CONFIG.apiBaseUrl`), so a preview
 * build reaches its own server and only a production build reaches
 * production. A link that cannot be opened says so — it never pretends.
 */

/** The one support address the platform publishes (legal notice, footer). */
const SUPPORT_EMAIL = "info@labourmarket.ai";
export default function Settings() {
  const { locale, setLocale, t } = useLocale();
  const { holdings } = useActorContext();
  const profile = useProfile();
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

  // `CONFIG` is null only on the misconfiguration screen at `_layout`, which
  // this screen cannot be reached from; the fallback is the public origin.
  const webOrigin = CONFIG === null ? "https://labourmarket.ai" : CONFIG.apiBaseUrl;
  const accountLinks = [
    {
      key: "privacy",
      label: t("account.privacy"),
      url: `${webOrigin}/${locale}/dashboard/privacy`,
    },
    { key: "terms", label: t("account.terms"), url: `${webOrigin}/${locale}/legal/terms` },
    { key: "support", label: t("account.support"), url: `mailto:${SUPPORT_EMAIL}` },
  ] as const;
  const [linkError, setLinkError] = useState<string | null>(null);
  const openLink = useCallback(
    async (url: string) => {
      setLinkError(null);
      try {
        await Linking.openURL(url);
      } catch {
        // No handler on this phone (no mail app, no browser). Nothing was
        // changed, and the sentence says so.
        setLinkError(t("account.openFailed"));
      }
    },
    [t],
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
              // `profiles.active_role` — real server state, not a local choice.
              // These rows REPORT; they are not pressable, because a selection
              // here reaches no request (see context-provider's note).
              const isActive =
                profile.state.status === "loaded" &&
                profile.state.data.profile.activeRole === context.mode;
              return (
                <View key={context.mode} testID={`context-${context.mode}`} style={styles.row}>
                  <Text style={styles.rowLabel}>{context.label}</Text>
                  {isActive ? <Text style={styles.tag}>{t("context.active")}</Text> : null}
                </View>
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

        <Title>{t("account.title")}</Title>
        <Body muted>{t("account.body")}</Body>
        <View style={styles.list}>
          {accountLinks.map((link) => (
            <Pressable
              key={link.key}
              testID={`account-${link.key}`}
              accessibilityRole="link"
              accessibilityLabel={link.label}
              onPress={() => void openLink(link.url)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={[styles.rowLabel, styles.rowLabelWrap]}>{link.label}</Text>
              <Text style={styles.tagMuted}>{t("account.external")}</Text>
            </Pressable>
          ))}
        </View>
        {linkError !== null ? <Body muted>{linkError}</Body> : null}

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
  // A link label is a sentence, not a name: let it wrap inside the row
  // instead of pushing the tag off the edge at large text sizes.
  rowLabelWrap: { flex: 1, paddingVertical: theme.space.sm, marginRight: theme.space.sm },
  tag: {
    color: theme.color.warning,
    fontSize: theme.font.small,
  },
  tagMuted: {
    color: theme.color.textMuted,
    fontSize: theme.font.small,
  },
});
