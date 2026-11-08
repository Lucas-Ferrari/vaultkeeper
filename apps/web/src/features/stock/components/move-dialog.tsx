import { useState } from "react";
import { Button, BUTTON_VARIANT } from "../../../shared/ui/button";
import { SelectField, type SelectOption } from "../../../shared/ui/select-field";

interface MoveDialogProps {
  itemName: string;
  options: readonly SelectOption[];
  pending: boolean;
  error: string | undefined;
  onMove: (storageLocationId: string) => void;
  onCancel: () => void;
}

/** Inline "move to" panel (R-STK-2): pick another own location; over-limit vaults disabled. */
export function MoveDialog({
  itemName,
  options,
  pending,
  error,
  onMove,
  onCancel,
}: MoveDialogProps) {
  const [target, setTarget] = useState("");
  return (
    <div
      role="dialog"
      aria-label={`Move ${itemName}`}
      className="flex flex-col gap-3 rounded-lg border border-primary bg-surface-raised p-3"
    >
      <SelectField
        label="Move to"
        value={target}
        error={error}
        options={[{ value: "", label: "Choose a location" }, ...options]}
        onChange={(event) => setTarget(event.target.value)}
      />
      <div className="flex gap-2">
        <Button disabled={pending || target === ""} onClick={() => onMove(target)}>
          Move
        </Button>
        <Button variant={BUTTON_VARIANT.GHOST} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
