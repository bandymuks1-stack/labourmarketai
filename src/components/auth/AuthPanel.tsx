/**
 * AuthPanel — shared chrome for /login and /register.
 *
 * One auth surface, two modes. The form is structure only (not wired); the
 * honest provider state is rendered by ProviderButtons.
 */
import Link from "next/link";
import { ProviderButtons } from "@/components/auth/ProviderButtons";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Wordmark } from "@/components/ui/Wordmark";

type Mode = "login" | "register";

const COPY: Record<Mode, { title: string; lead: string; cta: string }> = {
  login: {
    title: "Welcome back",
    lead: "Sign in to your one profile and pick up where the board left off.",
    cta: "Sign in",
  },
  register: {
    title: "Create your profile",
    lead: "One profile. One player card. It follows you across the whole market.",
    cta: "Create profile",
  },
};

export function AuthPanel({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const isRegister = mode === "register";

  return (
    <div className="arena flex min-h-screen items-center justify-center px-6 py-16">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-line/60 lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between bg-ink-2 p-10 lg:flex">
          <Wordmark />
          <div>
            <Eyebrow>{isRegister ? "Join the board" : "Resume"}</Eyebrow>
            <p className="display mt-5 text-3xl">
              Every participant is a{" "}
              <span className="grad-text">player card.</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-fg-dim">
              Skills, signal and availability — projected once, reused across
              discovery, matching and hiring.
            </p>
          </div>
          <p className="text-[0.7rem] text-fg-mute">
            Authentication is structured here, not yet wired.
          </p>
        </div>

        <div className="bg-surface p-8 sm:p-10">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <h1 className="display mt-6 text-2xl lg:mt-0">{copy.title}</h1>
          <p className="mt-2 text-sm text-fg-dim">{copy.lead}</p>

          <div className="mt-7">
            <ProviderButtons />
          </div>

          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[0.7rem] uppercase tracking-wider text-fg-mute">
              or with email
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form className="space-y-3">
            {isRegister ? (
              <input
                disabled
                placeholder="Full name"
                className="lm-input"
              />
            ) : null}
            <input
              disabled
              type="email"
              placeholder="Email"
              className="lm-input"
            />
            <input
              disabled
              type="password"
              placeholder="Password"
              className="lm-input"
            />
            <button
              type="button"
              disabled
              className="cta cta-primary w-full justify-center opacity-60"
            >
              {copy.cta}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-fg-mute">
            {isRegister ? (
              <>
                Already have a profile?{" "}
                <Link href="/login" className="text-cyan">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link href="/register" className="text-cyan">
                  Create a profile
                </Link>
              </>
            )}
          </p>
          {isRegister ? (
            <p className="mt-3 text-center text-[0.7rem] text-fg-mute">
              Next step after sign-up:{" "}
              <Link href="/role" className="text-fg-dim underline">
                choose who you are
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
