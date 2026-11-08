import type { StockEntry } from "@vaultkeeper/shared/schemas/stock";
import type { ReactNode } from "react";
import { Badge, BADGE_TONE } from "../../../shared/ui/badge";
import { ItemImage } from "../../../shared/ui/item-image";

interface StockTableProps {
  entries: readonly StockEntry[];
  iconOf: (categorySlug: string) => string;
  /** Router-aware link to the edit page (provided by the container). */
  renderName: (entry: StockEntry) => ReactNode;
  /** Move / delete controls for a row (provided by the container). */
  renderActions: (entry: StockEntry) => ReactNode;
  /** Optional row selection (bulk "add to group"): a checkbox column when given. */
  selection?: { selected: ReadonlySet<string>; onToggle: (entry: StockEntry) => void };
}

/** R-STK-4 row: image/placeholder, name (+ inactive), level, options, qty, location, value. */
export function StockTable({
  entries,
  iconOf,
  renderName,
  renderActions,
  selection,
}: StockTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-raised text-muted">
          <tr>
            {selection && (
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Select</span>
              </th>
            )}
            <th scope="col" className="px-3 py-2">
              Item
            </th>
            <th scope="col" className="px-3 py-2">
              Level
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Qty
            </th>
            <th scope="col" className="px-3 py-2">
              Location
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Unit (MC)
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Value (MC)
            </th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t border-border align-top">
              {selection && (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    aria-label={`Select ${entry.itemName}`}
                    checked={selection.selected.has(entry.id)}
                    onChange={() => selection.onToggle(entry)}
                  />
                </td>
              )}
              <td className="px-3 py-2">
                <span className="flex items-center gap-3">
                  <ItemImage
                    imageKey={entry.imageKey}
                    name={entry.itemName}
                    categoryIcon={iconOf(entry.categorySlug)}
                    className="size-10"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {renderName(entry)}
                      {!entry.itemActive && <Badge tone={BADGE_TONE.MUTED}>Inactive</Badge>}
                    </span>
                    {entry.options && <span className="text-xs text-muted">{entry.options}</span>}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 tabular-nums">+{entry.level}</td>
              <td className="px-3 py-2 text-right tabular-nums">{entry.quantity}</td>
              <td className="px-3 py-2">{entry.locationLabel}</td>
              <td className="px-3 py-2 text-right tabular-nums">{entry.unitPriceMc ?? "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="value">
                {entry.valueMc ?? "-"}
              </td>
              <td className="px-3 py-2">
                <span className="flex flex-wrap justify-end gap-2">{renderActions(entry)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
