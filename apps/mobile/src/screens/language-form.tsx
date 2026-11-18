import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type { WorkerActionData } from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import { Body, Button } from "../ui/primitives";
import { theme } from "../ui/theme";
import {
  WORKER_LANGUAGES,
  WORKER_LANGUAGE_LEVELS,
  languageName,
  type WorkerLanguageCode,
  type WorkerLanguageLevel,
} from "../worker-languages";
import { CapabilityFailureNotice } from "./capability-failure";

type Flow =
  | { readonly kind: "writing"; readonly missing: boolean }
  | { readonly kind: "saving" }
  | { readonly kind: "failed"; readonly failure: DomainFailure };

/**
 * ADD A LANGUAGE — `worker.add-language`, the one-step action the web chat
 * runs. Choosing a language already stated replaces its level (the action is
 * an upsert), exactly as on the web. Only the closed sets the server accepts
 * are offered (`worker-languages.ts`).
 */
export function LanguageForm({ onDone }: { onDone: () => void }) {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const [lang, setLang] = useState<WorkerLanguageCode | null>(null);
  const [level, setLevel] = useState<WorkerLanguageLevel | null>(null);
  const [flow, setFlow] = useState<Flow>({ kind: "writing", missing: false });

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const save = useCallback(async () => {
    if (lang === null || level === null) {
      setFlow({ kind: "writing", missing: true });
      return;
    }
    setFlow({ kind: "saving" });
    const result = await capability<WorkerActionData>({
      name: "worker.add-language",
      args: { lang, level },
      accessToken,
      locale,
    });
    if (!live.current) return;
    if (!result.ok) {
      setFlow({ kind: "failed", failure: result.failure });
      return;
    }
    onDone();
  }, [accessToken, lang, level, locale, onDone]);

  const busy = flow.kind === "saving";
  return (
    <View style={styles.stack} testID="cv-language-form">
      <Body muted>{t("cv.language.languageLabel")}</Body>
      <View style={styles.choices}>
        {WORKER_LANGUAGES.map((code) => (
          <Button
            key={code}
            variant={lang === code ? "primary" : "quiet"}
            testID={`cv-language-${code}`}
            label={languageName(code)}
            disabled={busy}
            onPress={() => setLang(code)}
          />
        ))}
      </View>
      <Body muted>{t("cv.language.levelLabel")}</Body>
      <View style={styles.choices}>
        {WORKER_LANGUAGE_LEVELS.map((value) => (
          <Button
            key={value}
            variant={level === value ? "primary" : "quiet"}
            testID={`cv-level-${value}`}
            label={value === "native" ? t("cv.levelNative") : value}
            disabled={busy}
            onPress={() => setLevel(value)}
          />
        ))}
      </View>
      {flow.kind === "writing" && flow.missing ? (
        <View testID="cv-language-local-error">
          <Body>{t("cv.language.chooseBoth")}</Body>
        </View>
      ) : null}
      {flow.kind === "failed" ? (
        <CapabilityFailureNotice
          failure={flow.failure}
          title="cv.saveFailedTitle"
          retry={() => void save()}
          testID="cv-language-failure"
        />
      ) : null}
      <Button testID="cv-language-save" label={t("cv.save")} busy={busy} onPress={() => void save()} />
      <Button variant="quiet" testID="cv-language-cancel" label={t("cv.cancel")} disabled={busy} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  choices: { gap: theme.space.sm },
});
