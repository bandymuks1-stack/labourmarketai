/**
 * ProviderButtons — honest provider state.
 *
 * Google is "prepared" (UI + config structure exist; credentials not wired —
 * it does not sign anyone in). Facebook and Instagram are disabled
 * coming-soon placeholders. Nothing here claims a provider works before it is.
 */
import { AUTH_PROVIDERS } from "@/lib/auth-providers";

const GLYPH: Record<string, string> = {
  google: "G",
  facebook: "f",
  instagram: "◎",
};

export function ProviderButtons() {
  return (
    <div className="space-y-2.5">
      {AUTH_PROVIDERS.map((provider) => {
        const prepared = provider.status === "prepared";
        return (
          <div key={provider.id}>
            <button
              type="button"
              disabled
              title={provider.note}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                prepared
                  ? "border-cyan/40 bg-cyan/[0.06] text-fg"
                  : "border-line/60 bg-fg/[0.02] text-fg-mute"
              }`}
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${
                  prepared ? "bg-cyan text-ink" : "bg-fg/10 text-fg-mute"
                }`}
              >
                {GLYPH[provider.id]}
              </span>
              <span className="flex-1 text-left font-medium">
                {provider.label}
              </span>
              <span
                className={`text-[0.62rem] uppercase tracking-wider ${
                  prepared ? "text-cyan" : "text-fg-mute"
                }`}
              >
                {prepared ? "Prepared" : "Coming soon"}
              </span>
            </button>
            <p className="mt-1 px-1 text-[0.68rem] leading-snug text-fg-mute">
              {provider.note}
            </p>
          </div>
        );
      })}
    </div>
  );
}
