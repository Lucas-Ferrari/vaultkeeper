import { useState } from "react";
import { Button, BUTTON_VARIANT } from "./button";

interface ConfirmButtonProps {
  /** Text of the first button (e.g. "Delete account"). */
  label: string;
  /** Accessible name of the first button when the text alone is ambiguous (table rows). */
  ariaLabel?: string;
  prompt: string;
  confirmLabel?: string;
  onConfirm: () => void;
  pending: boolean;
}

/** Two-step destructive action (no modal): the first click asks, the second confirms. */
export function ConfirmButton({
  label,
  ariaLabel,
  prompt,
  confirmLabel = "Confirm delete",
  onConfirm,
  pending,
}: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        variant={BUTTON_VARIANT.SECONDARY}
        aria-label={ariaLabel}
        onClick={() => setAsking(true)}
      >
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">{prompt}</span>
      <Button className="bg-danger" requiresNetwork disabled={pending} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button variant={BUTTON_VARIANT.GHOST} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </div>
  );
}
