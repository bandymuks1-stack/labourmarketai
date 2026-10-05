import { cn } from "@/lib/utils";

/**
 * THE PLATE — a photograph of real work as the product's native material.
 *
 * A plate is never framed in a card. It bleeds: the caller lays a gradient over
 * the side the type sits on, and the photograph dissolves into the obsidian
 * ground. `focus` is where the person's face is, so the crop keeps the person
 * whatever the aspect (a wide hero on desktop, a tall one on a phone).
 *
 * `drift` adds a very slow push (the photograph is never quite still); it stops
 * under prefers-reduced-motion.
 */
export type PlateImage = {
  readonly src: string;
  readonly small: string;
  readonly face: { readonly x: number; readonly y: number };
  readonly alt: string;
};

export function Plate({
  image,
  className,
  imgClassName,
  drift = false,
  priority = false,
  decorative = false,
  position,
  zoom,
  zoomOrigin,
}: {
  readonly image: PlateImage;
  readonly className?: string;
  readonly imgClassName?: string;
  readonly drift?: boolean;
  readonly priority?: boolean;
  /** The caption/heading already says what the photograph shows. */
  readonly decorative?: boolean;
  /** Override the crop anchor, e.g. "50% 20%". */
  readonly position?: string;
  /** Magnify the crop (≥1) around `zoomOrigin` — to use a detail of the
   *  photograph (a landscape, a site) without the person in it. */
  readonly zoom?: number;
  readonly zoomOrigin?: string;
}) {
  return (
    <div
      className={cn("overflow-hidden", !/(^| )(absolute|fixed|sticky)( |$)/.test(className ?? "") && "relative", className)}
      data-plate
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        srcSet={`${image.small} 960w, ${image.src} 1920w`}
        sizes="(min-width: 1024px) 70vw, 100vw"
        alt={decorative ? "" : image.alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        className={cn("absolute inset-0 h-full w-full object-cover", drift && "sig-drift", imgClassName)}
        style={{
          objectPosition: position ?? `${image.face.x * 100}% ${image.face.y * 100}%`,
          ...(zoom && zoom > 1 ? { transform: `scale(${zoom})`, transformOrigin: zoomOrigin ?? "50% 50%" } : null),
        }}
      />
    </div>
  );
}
