import type { StockEntry } from "@vaultkeeper/shared/schemas/stock";
import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/cn";
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

/*
 * R-PWA-2: below `sm` each row becomes a card (no side-scrolling table on a 360 px phone, every
 * action on screen). Header cells are visually hidden there, so data cells show their own label.
 * Explicit ARIA roles keep the table semantics when CSS changes the display type.
 */
const ROW =
  "border-t border-border align-top max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1 max-sm:px-2 max-sm:py-3";
const CELL = "px-3 py-2 max-sm:p-0";
const LABELLED =
  "max-sm:text-left max-sm:before:mr-1 max-sm:before:text-xs max-sm:before:text-muted max-sm:before:content-[attr(data-label)]";

/** R-STK-4 row: image/placeholder, name (+ inactive), level, options, qty, location, value. */
export function StockTable({
  entries,
  iconOf,
  renderName,
  renderActions,
  selection,
}: StockTableProps) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-border">
      <table role="table" className="w-full text-left text-sm max-sm:block">
        <thead className="bg-surface-raised text-muted max-sm:sr-only">
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
        <tbody role="rowgroup" className="max-sm:block">
          {entries.map((entry) => (
            <tr key={entry.id} role="row" className={ROW}>
              {selection && (
                <td role="cell" className="px-1 py-0 max-sm:p-0">
                  {/* The label is the 44 px touch target around the 20 px box (R-PWA-2). */}
                  <label className="flex size-11 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      aria-label={`Select ${entry.itemName}`}
                      checked={selection.selected.has(entry.id)}
                      onChange={() => selection.onToggle(entry)}
                    />
                  </label>
                </td>
              )}
              <td role="cell" className={cn(CELL, "max-sm:min-w-0 max-sm:flex-1")}>
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
              <td role="cell" data-label="Level" className={cn(CELL, LABELLED, "tabular-nums")}>
                +{entry.level}
              </td>
              <td
                role="cell"
                data-label="Qty"
                className={cn(CELL, LABELLED, "text-right tabular-nums")}
              >
                {entry.quantity}
              </td>
              <td role="cell" data-label="Location" className={cn(CELL, LABELLED)}>
                {entry.locationLabel}
              </td>
              <td
                role="cell"
                data-label="Unit (MC)"
                className={cn(CELL, LABELLED, "text-right tabular-nums")}
              >
                {entry.unitPriceMc ?? "-"}
              </td>
              <td
                role="cell"
                data-label="Value (MC)"
                data-testid="value"
                className={cn(CELL, LABELLED, "text-right tabular-nums")}
              >
                {entry.valueMc ?? "-"}
              </td>
              <td role="cell" className={cn(CELL, "max-sm:basis-full")}>
                <span className="flex flex-wrap justify-end gap-2 max-sm:justify-start">
                  {renderActions(entry)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
