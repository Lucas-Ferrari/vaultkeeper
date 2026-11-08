import { useState } from "react";
import { Button, BUTTON_VARIANT } from "../../../shared/ui/button";

interface DeleteItemProps {
  onConfirm: () => void;
  pending: boolean;
}

/** Two-step delete (no modal): the first click asks, the second deletes. */
export function DeleteItem({ onConfirm, pending }: DeleteItemProps) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant={BUTTON_VARIANT.SECONDARY} onClick={() => setAsking(true)}>
        Delete
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">Delete permanently? This cannot be undone.</span>
      <Button className="bg-danger" disabled={pending} onClick={onConfirm}>
        Confirm delete
      </Button>
      <Button variant={BUTTON_VARIANT.GHOST} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </div>
  );
}
