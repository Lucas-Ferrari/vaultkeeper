import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export const BUTTON_VARIANT = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
  GHOST: "ghost",
} as const;
export type ButtonVariant = (typeof BUTTON_VARIANT)[keyof typeof BUTTON_VARIANT];

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
}

export function Button({
  variant = BUTTON_VARIANT.PRIMARY,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === BUTTON_VARIANT.PRIMARY &&
          "bg-primary text-primary-foreground hover:brightness-110",
        variant === BUTTON_VARIANT.SECONDARY &&
          "border border-border bg-surface-raised text-foreground hover:bg-border",
        variant === BUTTON_VARIANT.GHOST && "text-muted hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
