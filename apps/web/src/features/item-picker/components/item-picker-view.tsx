import type { CatalogItem } from "@vaultkeeper/shared/schemas/catalog";
import { useId } from "react";
import { cn } from "../../../shared/lib/cn";
import { ItemImage } from "../../../shared/ui/item-image";

interface ItemPickerViewProps {
  query: string;
  onQueryChange: (value: string) => void;
  items: readonly CatalogItem[];
  iconOf: (categorySlug: string) => string;
  status: "idle" | "too-short" | "loading" | "ready" | "error";
  /** A newer query is loading while `items` still shows the previous results. */
  refreshing: boolean;
  onSelect: (id: string) => void;
}

/** Search box + result list (pure). Results are options of a listbox for screen readers. */
export function ItemPickerView({
  query,
  onQueryChange,
  items,
  iconOf,
  status,
  refreshing,
  onSelect,
}: ItemPickerViewProps) {
  const id = useId();
  const listId = `${id}-list`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Item
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search the catalog, e.g. wings of storm"
        className="min-h-11 rounded-lg border border-border bg-surface-raised px-3 text-base focus:border-primary focus:outline-none"
      />
      {status === "too-short" && (
        <p className="text-xs text-muted">Type at least 2 characters to search.</p>
      )}
      {status === "error" && <p className="text-xs text-danger">Search failed. Try again.</p>}
      {status === "ready" && items.length === 0 && (
        <p className="text-xs text-muted">No items match “{query.trim()}”.</p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label="Matching items"
        aria-busy={status === "loading" || refreshing}
        className={cn("flex flex-col gap-1", refreshing && "opacity-70")}
      >
        {items.map((item) => (
          <li key={item.id} role="none">
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onSelect(item.id)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1 text-left hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-primary"
            >
              <ItemImage
                imageKey={item.imageKey}
                name={item.name}
                categoryIcon={iconOf(item.categorySlug)}
                className="size-10"
              />
              <span className="flex flex-col">
                <span className="font-medium">{item.name}</span>
                <span className="text-xs text-muted">{item.categorySlug}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
