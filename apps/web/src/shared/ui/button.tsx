import type { ComponentProps } from "react";
import { useOnlineStatus } from "../hooks/use-online-status";
import { cn } from "../lib/cn";

export const BUTTON_VARIANT = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
  GHOST: "ghost",
} as const;
export type ButtonVariant = (typeof BUTTON_VARIANT)[keyof typeof BUTTON_VARIANT];

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  /**
   * Disable while offline (R-PWA-3: no writes, nothing queued). Defaults to true for submit
   * buttons, since every form in the app saves something; set it on other write buttons.
   */
  requiresNetwork?: boolean;
}

export function Button({
  variant = BUTTON_VARIANT.PRIMARY,
  className,
  type = "button",
  requiresNetwork = type === "submit",
  disabled,
  title,
  ...props
}: ButtonProps) {
  const online = useOnlineStatus();
  const blockedOffline = requiresNetwork && !online;

  return (
    <button
      type={type}
      disabled={disabled === true || blockedOffline}
      title={blockedOffline ? "Unavailable offline" : title}
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
