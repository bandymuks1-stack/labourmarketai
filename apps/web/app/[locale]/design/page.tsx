import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { ConstellationBg } from "@/components/decor/constellation-bg";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { LiveDot } from "@/components/ui/LiveDot";
import { Select } from "@/components/ui/Select";
import { Sparkline } from "@/components/ui/Sparkline";
import { Stat } from "@/components/ui/Stat";
import { Placeholder } from "@/components/ui/Placeholder";
import { placeholders } from "@/content/placeholders";
import { designGalleryEnabled } from "@/lib/env";

// Dev-gated (brief §10.3): designGalleryEnabled is hard-false in every
// production build (PR15 hardening — the old marker-flag gate defaulted to
// "true", which left this dev gallery publicly reachable in production).
// NOTE: Next App Router treats _-prefixed folders as private/non-routable,
// so the brief's /_design is implemented as /design (ADR 0005).
export default async function DesignPreview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!designGalleryEnabled) {
    notFound();
  }

  return (
    <div className="relative min-h-screen">
      <AmbientGlow />
      <main className="relative mx-auto max-w-container px-6 py-16 sm:px-12">
        <Label>Design system preview — dev only</Label>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tightest">
          Industrial{" "}
          <span className="text-gradient-accent">Intelligence</span>
        </h1>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <Card label="Worker profile" live>
            <p className="text-sm text-text-secondary">
              Card primitive — gradient border, radial inner glow, mono
              small-caps label, pulsing live dot.
            </p>
          </Card>
          <Card label="Buttons">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="primary" size="sm">
                Small
              </Button>
            </div>
          </Card>
        </section>

        <section className="relative mt-6 overflow-hidden card-border p-8">
          <ConstellationBg />
          <div className="relative grid gap-8 sm:grid-cols-3">
            <Stat value="320K+" label="Active workers" />
            <Stat value="18K+" label="Live projects" />
            <Stat value="92%" label="Success rate" />
          </div>
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-3">
          <Card label="Signals">
            <div className="flex flex-col gap-4">
              <LiveDot label="Live system" />
              <div className="flex gap-2">
                <Badge tone="brand">Business</Badge>
                <Badge tone="live">Available</Badge>
                <Badge tone="warning">Pending</Badge>
              </div>
            </div>
          </Card>
          <Card label="Market trend">
            <Sparkline points={[4, 7, 5, 9, 8, 12, 10, 15]} />
          </Card>
          <Card label="Identity">
            <div className="flex items-center gap-4">
              <Avatar alt="Worker" initials="TJ" size={56} glow />
              <div>
                <p className="font-display font-semibold">Tomas J.</p>
                <Label>Site supervisor</Label>
              </div>
            </div>
          </Card>
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <Card label="Form inputs">
            <div className="flex flex-col gap-3">
              <Input placeholder="Full name" />
              <Select defaultValue="">
                <option value="" disabled>
                  Select a role
                </option>
                <option value="worker">Worker</option>
                <option value="company">Company</option>
                <option value="agency">Agency</option>
              </Select>
            </div>
          </Card>
          <Card label="Typography">
            <p className="font-display text-2xl font-bold tracking-tightest">
              Display — Geist
            </p>
            <p className="mt-2 text-text-secondary">Body — Inter</p>
            <p className="mt-2 font-mono text-xs uppercase tracking-label text-text-muted">
              Mono small-caps label
            </p>
          </Card>
        </section>

        <section className="mt-12">
          <Label>Placeholder registry — {placeholders.length} entries</Label>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tightest">
            Governed placeholders
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Every fake value below is registered in{" "}
            <code className="font-mono text-xs text-text-muted">
              content/placeholders.ts
            </code>{" "}
            and rendered via{" "}
            <code className="font-mono text-xs text-text-muted">
              &lt;Placeholder /&gt;
            </code>
            . The dotted outline + corner chip is the dev/preview marker; it is
            hidden in production. Nothing here is real data.
          </p>
          <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {placeholders.map((p) => (
              <div key={p.id} className="flex flex-col gap-3">
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {p.id} · {p.type}
                </span>
                <div className="text-sm text-text-secondary">
                  <Placeholder id={p.id} />
                </div>
                <span className="text-xs text-text-muted">
                  {p.description}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
