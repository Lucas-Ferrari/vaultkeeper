import type { ItemCategory } from "@vaultkeeper/shared/schemas/catalog";
import { SelectField } from "../../../shared/ui/select-field";
import { TextField } from "../../../shared/ui/text-field";
import { CATALOG_STATUS, type CatalogStatus } from "../lib/search";

export interface CatalogFilterValues {
  q: string;
  category: string;
  status: CatalogStatus;
}

interface CatalogFiltersProps {
  values: CatalogFilterValues;
  categories: readonly ItemCategory[];
  onChange: (patch: Partial<CatalogFilterValues>) => void;
}

const STATUS_OPTIONS = [
  { value: CATALOG_STATUS.ALL, label: "All" },
  { value: CATALOG_STATUS.ACTIVE, label: "Active" },
  { value: CATALOG_STATUS.INACTIVE, label: "Inactive" },
];

export function CatalogFilters({ values, categories, onChange }: CatalogFiltersProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
      <TextField
        label="Search"
        type="search"
        value={values.q}
        onChange={(event) => onChange({ q: event.target.value })}
      />
      <SelectField
        label="Category"
        value={values.category}
        options={[
          { value: "", label: "All categories" },
          ...categories.map((category) => ({ value: category.slug, label: category.name })),
        ]}
        onChange={(event) => onChange({ category: event.target.value })}
      />
      <SelectField
        label="Status"
        value={values.status}
        options={STATUS_OPTIONS}
        onChange={(event) => onChange({ status: event.target.value as CatalogStatus })}
      />
    </div>
  );
}
