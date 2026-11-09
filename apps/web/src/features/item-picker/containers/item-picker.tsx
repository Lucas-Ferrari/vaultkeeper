import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SEARCH_LIMIT } from "@vaultkeeper/shared/constants";
import { useState } from "react";
import { catalogSearchQueryOptions, categoriesQueryOptions } from "../../catalog/api/queries";
import { ItemPickerView } from "../components/item-picker-view";
import { useDebouncedValue } from "../hooks/use-debounced-value";

/** Design 13: one request per pause in typing. */
export const ITEM_PICKER_DEBOUNCE_MS = 250;
const GENERIC_ICON = "item";

interface ItemPickerProps {
  onSelect: (itemId: string) => void;
}

/**
 * Fuzzy catalog picker (R-SRCH-1): debounced search, previous results kept while the next page
 * loads, active items only (the user endpoint filters; the client filters again defensively).
 */
export function ItemPicker({ onSelect }: ItemPickerProps) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), ITEM_PICKER_DEBOUNCE_MS);
  const searchable = debounced.replace(/\s/g, "").length >= SEARCH_LIMIT.FUZZY_MIN_CHARS;

  const search = useQuery({
    ...catalogSearchQueryOptions({ q: debounced }),
    enabled: searchable,
    placeholderData: keepPreviousData,
  });
  const categories = useQuery(categoriesQueryOptions);
  const iconOf = (slug: string) =>
    categories.data?.find((category) => category.slug === slug)?.icon ?? GENERIC_ICON;

  const typedEnough = query.trim().replace(/\s/g, "").length >= SEARCH_LIMIT.FUZZY_MIN_CHARS;
  const items = typedEnough ? (search.data?.items ?? []).filter((item) => item.isActive) : [];
  const status = !typedEnough
    ? query.trim() === ""
      ? "idle"
      : "too-short"
    : search.isError
      ? "error"
      : search.data === undefined
        ? "loading"
        : "ready";

  return (
    <ItemPickerView
      query={query}
      onQueryChange={setQuery}
      items={items}
      iconOf={iconOf}
      status={status}
      refreshing={search.isPlaceholderData || (typedEnough && debounced !== query.trim())}
      onSelect={onSelect}
    />
  );
}
