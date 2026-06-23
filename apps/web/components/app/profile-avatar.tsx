"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { compressImageFile } from "@/lib/browser/image-compress";
import { uploadProfileAvatar, isValidAvatar } from "@/lib/profile/avatar-upload";
import { removeProfileAvatar } from "@/lib/profile/avatar-actions";
import { AvatarDisplay } from "@/components/app/avatar-display";

/**
 * Profile avatar control — upload / change / remove the signed-in user's own
 * profile photo. Normal phone photos are accepted and auto-resized/compressed
 * (PR #484 compressor) before upload. Honest progress + error copy; no fake
 * success; no raw storage/API errors; initials monogram fallback when no photo.
 */
type Busy = "idle" | "preparing" | "uploading" | "removing";

export function ProfileAvatar({
  signedUrl,
  displayName,
}: {
  signedUrl: string | null;
  displayName: string;
}) {
  const t = useTranslations("profileAvatar");
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    setDone(false);
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      setError(t("invalidFile"));
      return;
    }
    setBusy("preparing");
    const { file: prepared } = await compressImageFile(f);
    if (!isValidAvatar(prepared)) {
      setBusy("idle");
      setError(t("tooLarge"));
      return;
    }
    setBusy("uploading");
    const r = await uploadProfileAvatar(prepared);
    setBusy("idle");
    if (r === "uploaded") {
      setDone(true);
      router.refresh();
    } else if (r === "invalid") {
      setError(t("invalidFile"));
    } else if (r === "not-ready") {
      setError(t("notReady"));
    } else {
      setError(t("uploadFailed"));
    }
  }

  async function onRemove() {
    setBusy("removing");
    setError(null);
    setDone(false);
    const r = await removeProfileAvatar();
    setBusy("idle");
    if (r.ok) router.refresh();
    else setError(t("uploadFailed"));
  }

  const working = busy === "preparing" || busy === "uploading";

  return (
    <div className="flex items-center gap-4" data-testid="profile-avatar">
      <AvatarDisplay signedUrl={signedUrl} displayName={displayName} alt={t("alt")} size="lg" />
      <div className="flex flex-col gap-1.5">
        <label
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-brand-blue/40 bg-brand-blue/10 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/20"
          data-testid="profile-avatar-label"
        >
          {working ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Camera className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          )}
          {signedUrl ? t("change") : t("upload")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            data-testid="profile-avatar-input"
            onChange={onPick}
            disabled={busy !== "idle"}
          />
        </label>
        {signedUrl && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy !== "idle"}
            data-testid="profile-avatar-remove"
            className="inline-flex w-fit items-center gap-1 text-xs text-text-muted transition-colors hover:text-state-danger disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {busy === "removing" ? t("removing") : t("remove")}
          </button>
        )}
        {busy === "preparing" && (
          <p className="text-xs text-text-secondary" role="status">{t("preparing")}</p>
        )}
        {busy === "uploading" && (
          <p className="text-xs text-text-secondary" role="status">{t("uploading")}</p>
        )}
        {done && busy === "idle" && (
          <p className="text-xs text-state-success" role="status" data-testid="profile-avatar-done">
            {t("uploaded")}
          </p>
        )}
        {error && (
          <p className="text-xs text-state-danger" role="alert" data-testid="profile-avatar-error">
            {error}
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-text-muted">{t("hint")}</p>
      </div>
    </div>
  );
}