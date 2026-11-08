import type { StorageLocation } from "@vaultkeeper/shared/schemas/game-accounts";
import type { ReactNode } from "react";
import { Badge, BADGE_TONE } from "../../../shared/ui/badge";
import { entryCountLabel } from "../lib/messages";

interface StorageListProps {
  locations: readonly StorageLocation[];
  /** Router-aware link to a location page (provided by the container). */
  renderLink: (location: StorageLocation) => ReactNode;
}

/** Inventories and vaults with entry counts; over-limit vaults are flagged (R-GA-3 S3, R-GA-5). */
export function StorageList({ locations, renderLink }: StorageListProps) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {locations.map((location) => (
        <li
          key={location.id}
          className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
        >
          {renderLink(location)}
          <span className="flex items-center gap-2 text-sm text-muted">
            {location.overLimit && <Badge tone={BADGE_TONE.DANGER}>over limit, move items</Badge>}
            {entryCountLabel(location.entryCount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
