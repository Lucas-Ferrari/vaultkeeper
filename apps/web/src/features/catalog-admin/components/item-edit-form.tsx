import { zodResolver } from "@hookform/resolvers/zod";
import type { CatalogItem, ItemCategory } from "@vaultkeeper/shared/schemas/catalog";
import { useForm } from "react-hook-form";
import { Button } from "../../../shared/ui/button";
import { SelectField } from "../../../shared/ui/select-field";
import { TextField } from "../../../shared/ui/text-field";
import { itemEditForm, type ItemEditFormInput, type ItemEditFormOutput } from "../lib/item-form";

interface ItemEditFormProps {
  item: CatalogItem;
  categories: readonly ItemCategory[];
  onSubmit: (values: ItemEditFormOutput) => void;
  pending: boolean;
}

/** Name, category and reference price, validated by the shared schemas (R-CAT-2). */
export function ItemEditForm({ item, categories, onSubmit, pending }: ItemEditFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ItemEditFormInput, unknown, ItemEditFormOutput>({
    resolver: zodResolver(itemEditForm),
    defaultValues: {
      name: item.name,
      categorySlug: item.categorySlug,
      referencePriceMc: item.referencePriceMc ?? "",
    },
  });

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <TextField label="Name" error={errors.name?.message} {...register("name")} />
      <SelectField
        label="Category"
        options={categories.map((category) => ({ value: category.slug, label: category.name }))}
        error={errors.categorySlug?.message}
        {...register("categorySlug")}
      />
      <TextField
        label="Reference price (MC)"
        inputMode="decimal"
        hint="Leave empty for unpriced."
        error={errors.referencePriceMc?.message}
        {...register("referencePriceMc")}
      />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
