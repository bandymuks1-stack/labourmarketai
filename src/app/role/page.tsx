import type { Metadata } from "next";
import { RoleSelector } from "@/components/role/RoleSelector";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Wordmark } from "@/components/ui/Wordmark";

export const metadata: Metadata = { title: "Who are you?" };

export default function RolePage() {
  return (
    <div className="arena flex min-h-screen flex-col px-6 py-10">
      <Wordmark />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-12">
        <div className="rise text-center">
          <Eyebrow>One question</Eyebrow>
          <h1 className="display mx-auto mt-5 max-w-2xl text-4xl sm:text-5xl">
            Who are <span className="grad-text">you?</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-fg-dim">
            This sets up your one profile and player card. We don&apos;t ask
            what you&apos;re looking for — the board shows you that.
          </p>
        </div>
        <div className="mt-12">
          <RoleSelector />
        </div>
      </div>
    </div>
  );
}
