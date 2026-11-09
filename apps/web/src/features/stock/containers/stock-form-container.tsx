import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { StockEntry } from "@vaultkeeper/shared/schemas/stock";
import { useState } from "react";
import { Alert } from "../../../shared/ui/alert";
import { useLocationChoices } from "../../accounts/api/queries";
import { catalogItemQueryOptions } from "../../catalog/api/queries";
import { ItemPicker } from "../../item-picker/containers/item-picker";
import { useCreateEntry, useUpdateEntry } from "../api/mutations";
import { stockEntryQueryOptions } from "../api/queries";
import { StockForm } from "../components/stock-form";
import type { StockFormInput } from "../lib/entry-form";
import { stockErrorMessage } from "../lib/messages";

const EMPTY: StockFormInput = {
  catalogItemId: "",
  storageLocationId: "",
  level: "0",
  quantity: "1",
  options: "",
  priceMc: "",
  notes: "",
};

function toFormValues(entry: StockEntry): StockFormInput {
  return {
    catalogItemId: entry.catalogItemId,
    storageLocationId: entry.storageLocationId,
    level: String(entry.level),
    quantity: String(entry.quantity),
    options: entry.options ?? "",
    priceMc: entry.priceMc ?? "",
    notes: entry.notes ?? "",
  };
}

/** Picked item's name: the entry's own when unchanged, else the catalog item's. */
function usePickedName(pickedId: string | null, entry?: StockEntry) {
  const picked = useQuery({
    ...catalogItemQueryOptions(pickedId ?? ""),
    enabled: pickedId !== null && pickedId !== entry?.catalogItemId,
  });
  if (pickedId === null || pickedId === entry?.catalogItemId) return entry?.itemName;
  return picked.data?.name;
}

/** /stock/new: create an entry in one of the user's locations (over-limit vaults disabled). */
export function StockCreateContainer() {
  const navigate = useNavigate();
  const create = useCreateEntry();
  const { choices } = useLocationChoices();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const pickedName = usePickedName(pickedId);

  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/stock"
        className="inline-flex min-h-11 items-center self-start text-sm text-primary"
      >
        ← Stock
      </Link>
      <h1 className="text-2xl font-bold">Add stock</h1>
      {create.error && <Alert>{stockErrorMessage(create.error)}</Alert>}
      <StockForm
        defaultValues={EMPTY}
        locationOptions={choices.map((choice) => ({
          value: choice.id,
          label: choice.overLimit ? `${choice.label} (over limit)` : choice.label,
          disabled: choice.overLimit,
        }))}
        renderPicker={(pickItem) => (
          <ItemPicker
            onSelect={(id) => {
              setPickedId(id);
              pickItem(id);
            }}
          />
        )}
        selectedItemName={pickedName}
        pending={create.isPending}
        onSubmit={(values) =>
          create.mutate(values, { onSuccess: () => navigate({ to: "/stock" }) })
        }
      />
    </section>
  );
}

/** /stock/$entryId: edit any field but the location (R-STK-2). */
export function StockEditContainer({ entryId }: { entryId: string }) {
  const entry = useQuery(stockEntryQueryOptions(entryId));
  const update = useUpdateEntry(entryId);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const pickedName = usePickedName(pickedId, entry.data);

  if (entry.isError) return <Alert>{stockErrorMessage(entry.error)}</Alert>;
  if (!entry.data) return <p className="text-muted">Loading…</p>;

  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/stock"
        className="inline-flex min-h-11 items-center self-start text-sm text-primary"
      >
        ← Stock
      </Link>
      <h1 className="text-2xl font-bold">
        {entry.data.itemName} · {entry.data.locationLabel}
      </h1>
      {update.error && <Alert>{stockErrorMessage(update.error)}</Alert>}
      {update.isSuccess && !update.isPending && (
        <p className="text-sm text-muted" role="status">
          Saved.
        </p>
      )}
      <StockForm
        key={entry.data.id}
        defaultValues={toFormValues(entry.data)}
        renderPicker={(pickItem) => (
          <ItemPicker
            onSelect={(id) => {
              setPickedId(id);
              pickItem(id);
            }}
          />
        )}
        selectedItemName={pickedName}
        pending={update.isPending}
        onSubmit={({ storageLocationId: _location, ...values }) => update.mutate(values)}
      />
    </section>
  );
}
