"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";

import { buttonLinkClassName } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * TAKE A PHOTO — the phone's camera as the start of a work record (Future
 * Experience A, owner 2026-10-14: "kameros panaudojimas darbo įrodymams").
 *
 * A second door into the SAME photo field, never a second upload path: the
 * picked file goes to the caller's own handler (`onFile`), so validation,
 * compression, the free-tier rule and the after-save upload are exactly the
 * ones the regular picker uses.
 *
 * Why a separate control: `capture` on the regular input would REMOVE the
 * gallery choice on phones (iOS/Android open the camera only), and a photo
 * taken earlier must stay pickable. Desktop browsers ignore `capture`, so the
 * button shows only below `md` — where a camera is in the person's hand.
 */
export function CameraCaptureButton({
  label,
  onFile,
  disabled = false,
  testId,
  className,
}: {
  readonly label: string;
  readonly onFile: (file: File | null) => void;
  readonly disabled?: boolean;
  readonly testId: string;
  readonly className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={cn(buttonLinkClassName("secondary"), "self-start md:hidden", className)}
        data-testid={testId}
      >
        <Camera aria-hidden className="h-4 w-4" />
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid={`${testId}-input`}
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          // Reset, so taking a second photo still fires onChange.
          e.target.value = "";
          onFile(picked);
        }}
      />
    </>
  );
}
