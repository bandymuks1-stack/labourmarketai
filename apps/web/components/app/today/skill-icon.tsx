import {
  BadgeCheck,
  Brush,
  Drill,
  Flame,
  Grid3x3,
  Hammer,
  HardHat,
  Layers,
  Ruler,
  Truck,
  Wrench,
  Zap,
  Droplets,
  type LucideIcon,
} from "lucide-react";

/**
 * skill_icons.icon_slug → icon. The registry is DB-driven (doctrine §10 slug
 * taxonomy); this maps the known platform icon slugs to lucide glyphs and
 * falls back to the neutral verified badge — the icon is decorative, the
 * verification claim always comes from the real worker_skills.verified flag.
 */
const ICONS: Record<string, LucideIcon> = {
  wrench: Wrench,
  hammer: Hammer,
  drill: Drill,
  brush: Brush,
  "paint-roller": Brush,
  ruler: Ruler,
  "hard-hat": HardHat,
  truck: Truck,
  zap: Zap,
  electricity: Zap,
  droplets: Droplets,
  plumbing: Droplets,
  flame: Flame,
  welding: Flame,
  layers: Layers,
  tiles: Grid3x3,
};

export function SkillIcon({
  slug,
  className,
}: {
  slug: string | null;
  className?: string;
}) {
  const Icon = (slug && ICONS[slug]) || BadgeCheck;
  return <Icon className={className} aria-hidden />;
}
