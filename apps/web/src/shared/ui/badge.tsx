import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export const BADGE_TONE = {
  PRIMARY: "primary",
  MUTED: "muted",
  DANGER: "danger",
} as const;
export type BadgeTone = (typeof BADGE_TONE)[keyof typeof BADGE_TONE];

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

/** Small status label (e.g. "Inactive"). */
export function Badge({ tone = BADGE_TONE.PRIMARY, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
        tone === BADGE_TONE.PRIMARY && "border-primary text-primary",
        tone === BADGE_TONE.MUTED && "border-border text-muted",
        tone === BADGE_TONE.DANGER && "border-danger text-danger",
      )}
    >
      {children}
    </span>
  );
}
