import { getTranslations } from "next-intl/server";
import {
  MATRIX_ROLES,
  MESSAGING_RULES,
  PERMISSION_MATRIX,
  type MatrixAccess,
} from "@/lib/legal/permission-matrix";

/**
 * Role × surface permission matrix (CR train WAGON 7, audit area 12).
 *
 * Renders EXCLUSIVELY from `lib/legal/permission-matrix.ts` — no hardcoded
 * rows live here (guard-pinned), so the rendered table can never drift from
 * the source-backed data module. All user-facing wording comes from the
 * `legal.dataAccess.matrix` i18n namespace (en/lt/ru); the source pointers
 * stay technical on purpose (they are audit references, secondary line).
 */

function accessTone(a: MatrixAccess): string {
  switch (a) {
    case "yes":
      return "text-text-primary";
    case "own":
    case "limited":
      return "text-text-secondary";
    case "no":
      return "text-text-muted";
  }
}

export async function PermissionMatrixSection() {
  const t = await getTranslations("legal.dataAccess.matrix");

  return (
    <section id="matrix" data-testid="permission-matrix" className="mt-12">
      <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-text-secondary">{t("intro")}</p>

      <div className="mt-6 overflow-x-auto rounded-md border border-border-subtle">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="border-b border-border-subtle bg-surface-1">
              <th scope="col" className="px-4 py-3 font-medium text-text-primary">
                {t("surfaceHeader")}
              </th>
              {MATRIX_ROLES.map((role) => (
                <th scope="col" key={role} className="px-4 py-3 font-medium text-text-primary">
                  {t(`roles.${role}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MATRIX.map((row) => (
              <tr key={row.key} className="border-b border-border-subtle last:border-b-0 align-top">
                <th scope="row" className="max-w-xs px-4 py-3 font-normal">
                  <span className="block font-medium text-text-primary">
                    {t(`rows.${row.key}.surface`)}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                    {t(`rows.${row.key}.seeNote`)}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                    {t(`rows.${row.key}.editNote`)}
                  </span>
                  <span className="mt-2 block break-all font-mono text-meta leading-relaxed text-text-muted">
                    {t("sourceLabel")}: {row.sources.join(" · ")}
                  </span>
                </th>
                {MATRIX_ROLES.map((role) => (
                  <td key={role} className="whitespace-nowrap px-4 py-3">
                    <span className={`block text-xs ${accessTone(row.see[role])}`}>
                      {t("seeLabel")}: {t(`levels.${row.see[role]}`)}
                    </span>
                    <span className={`mt-1 block text-xs ${accessTone(row.edit[role])}`}>
                      {t("editLabel")}: {t(`levels.${row.edit[role]}`)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-muted">{t("sourceNote")}</p>

      <div className="mt-8" data-testid="permission-matrix-messaging">
        <h3 className="font-display text-xl font-bold tracking-tightest text-text-primary">
          {t("messaging.heading")}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">{t("messaging.intro")}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {MESSAGING_RULES.map((rule) => (
            <li
              key={rule.key}
              className="rounded-md border border-border-subtle bg-surface-1 px-4 py-3"
            >
              <span className="block text-sm leading-relaxed text-text-secondary">
                {t(`messaging.rules.${rule.key}`)}
              </span>
              <span className="mt-1 block break-all font-mono text-meta leading-relaxed text-text-muted">
                {t("sourceLabel")}: {rule.sources.join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
