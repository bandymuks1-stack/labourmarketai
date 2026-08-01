"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, ExternalLink } from "lucide-react";

import { setBusinessPublicProfileAction } from "@/lib/company/public-profile";
import { saveOrganizationDescriptionAction } from "@/lib/company/description-actions";
import {
  isValidBusinessSlug,
  publicBusinessPath,
  type BusinessPublicSettings,
} from "@/lib/company/public-profile-model";

/**
 * Public business profile publication panel (Wagon 13 slice 2). Owner/manager
 * surface on the company workspace: opt IN to a public showcase profile, set the
 * public slug + explicitly-public tagline/contact, or turn it back off. Default
 * is PRIVATE — nothing is public until the owner enables it here. The write is
 * re-gated server-side inside the RPC. Honest `needs-migration` state.
 */
export function BusinessPublicProfilePanel({
  orgId,
  needsMigration,
  settings,
  locale,
}: {
  orgId: string;
  needsMigration: boolean;
  settings: BusinessPublicSettings | null;
  locale: string;
}) {
  const t = useTranslations("businessProfile");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [slug, setSlug] = useState(settings?.slug ?? "");
  const [tagline, setTagline] = useState(settings?.tagline ?? "");
  const [description, setDescription] = useState(settings?.description ?? "");
  const [email, setEmail] = useState(settings?.contactEmail ?? "");
  const [phone, setPhone] = useState(settings?.contactPhone ?? "");
  const [notice, setNotice] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  const publishedSlug = settings?.enabled ? settings.slug : null;

  function save() {
    setNotice(null);
    const s = slug.trim().toLowerCase();
    if (enabled && !isValidBusinessSlug(s)) {
      setNotice(t("errorSlug"));
      return;
    }
    startTransition(async () => {
      const res = await setBusinessPublicProfileAction({
        orgId,
        enabled,
        slug: s || null,
        tagline: tagline || null,
        contactEmail: email || null,
        contactPhone: phone || null,
      });
      // ONE save button: the description travels with the same click.
      // (Separate write path — owner's companies row + mirror trigger, see
      // description-actions.ts; a description failure must not mask the
      // publication result, so it degrades to its own notice.)
      const descRes =
        res.kind === "ok" && description !== (settings?.description ?? "")
          ? await saveOrganizationDescriptionAction(description, locale)
          : ({ kind: "ok" } as const);
      if (res.kind === "ok" && descRes.kind !== "ok" && descRes.kind !== "no-company") {
        setNotice(t("errorDescription"));
        router.refresh();
      } else if (res.kind === "ok") {
        setNotice(t("saved"));
        router.refresh();
      } else if (res.kind === "slug-taken") setNotice(t("errorSlugTaken"));
      else if (res.kind === "invalid") setNotice(t("errorSlug"));
      else if (res.kind === "not-authorized") setNotice(t("errorNotAuthorized"));
      else if (res.kind === "needs-migration") setNotice(t("notAvailable"));
      else setNotice(t("errorGeneric"));
    });
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-ink-800/10 p-4"
      data-testid="business-public-profile-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-text-primary">
            <Globe aria-hidden className="h-4 w-4 text-brand-blue" />
            {t("panelTitle")}
          </h2>
          <p className="text-sm text-text-secondary">{t("panelIntro")}</p>
        </div>
        {publishedSlug && (
          <a
            href={publicBusinessPath(publishedSlug)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="view-public-profile-link"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ink-500 px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          >
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            {t("viewPublic")}
          </a>
        )}
      </div>

      {needsMigration ? (
        <p className="rounded-md border border-ink-500 bg-ink-800/40 p-3 text-sm text-text-muted">
          {t("notAvailable")}
        </p>
      ) : (
        <>
          {notice && (
            <p role="status" className="rounded-md border border-brand-blue/40 bg-brand-blue/5 p-2 text-sm text-text-secondary">
              {notice}
            </p>
          )}

          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-ink-500"
            />
            {t("enableLabel")}
          </label>
          <p className="text-xs text-text-muted">{t("enableHint")}</p>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">{t("slugLabel")}</span>
            <span className="flex items-center gap-1">
              <span className="text-xs text-text-muted">/business/</span>
              <input
                className={inputCls}
                value={slug}
                maxLength={50}
                placeholder={t("slugPlaceholder")}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">{t("taglineLabel")}</span>
            <input
              className={inputCls}
              value={tagline}
              maxLength={160}
              placeholder={t("taglinePlaceholder")}
              onChange={(e) => setTagline(e.target.value)}
            />
          </label>

          {/* W4: the public page's main content block finally gets its write
              path — it rendered publicly but nothing in the product could
              fill it. */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">{t("descriptionLabel")}</span>
            <textarea
              className={`${inputCls} min-h-24 resize-y`}
              value={description}
              maxLength={2000}
              rows={4}
              placeholder={t("descriptionPlaceholder")}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="business-description-input"
            />
            <span className="text-xs text-text-muted">{t("descriptionHint")}</span>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">{t("emailLabel")}</span>
              <input
                className={inputCls}
                value={email}
                maxLength={200}
                placeholder={t("emailPlaceholder")}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">{t("phoneLabel")}</span>
              <input
                className={inputCls}
                value={phone}
                maxLength={40}
                placeholder={t("phonePlaceholder")}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs text-text-muted">{t("contactHint")}</p>

          <div>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-md border border-brand-blue bg-brand-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? t("saving") : t("save")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
