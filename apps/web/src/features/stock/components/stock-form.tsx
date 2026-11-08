import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../../shared/ui/button";
import { SelectField, type SelectOption } from "../../../shared/ui/select-field";
import { TextField } from "../../../shared/ui/text-field";
import { stockEntryForm, type StockFormInput, type StockFormOutput } from "../lib/entry-form";

interface StockFormProps {
  defaultValues: StockFormInput;
  /** Location choices; omitted on edit (moves use the move dialog). */
  locationOptions?: readonly SelectOption[] | undefined;
  /** The item picker, wired by the container; it calls `pickItem`. */
  renderPicker: (pickItem: (id: string) => void) => ReactNode;
  selectedItemName: string | undefined;
  pending: boolean;
  onSubmit: (values: StockFormOutput) => void;
}

/** Item, location, level, quantity, options, price override and notes (R-STK-1). */
export function StockForm({
  defaultValues,
  locationOptions,
  renderPicker,
  selectedItemName,
  pending,
  onSubmit,
}: StockFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<StockFormInput, unknown, StockFormOutput>({
    resolver: zodResolver(stockEntryForm),
    defaultValues,
  });

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-1">
        {renderPicker((id) => setValue("catalogItemId", id, { shouldValidate: true }))}
        <input type="hidden" {...register("catalogItemId")} />
        {selectedItemName && <p className="text-sm">Selected: {selectedItemName}</p>}
        {errors.catalogItemId && (
          <p className="text-xs text-danger">{errors.catalogItemId.message}</p>
        )}
      </div>
      {locationOptions && (
        <SelectField
          label="Location"
          options={[{ value: "", label: "Choose a location" }, ...locationOptions]}
          error={errors.storageLocationId?.message}
          {...register("storageLocationId")}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Level"
          inputMode="numeric"
          hint="+0 to +15"
          error={errors.level?.message}
          {...register("level")}
        />
        <TextField
          label="Quantity"
          inputMode="numeric"
          error={errors.quantity?.message}
          {...register("quantity")}
        />
      </div>
      <TextField
        label="Options"
        hint="Free text, e.g. +Luck, Exc: Dmg+2%"
        error={errors.options?.message}
        {...register("options")}
      />
      <TextField
        label="Price override (MC)"
        inputMode="decimal"
        hint="Empty uses the catalog price."
        error={errors.priceMc?.message}
        {...register("priceMc")}
      />
      <TextField label="Notes" error={errors.notes?.message} {...register("notes")} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save entry"}
      </Button>
    </form>
  );
}
