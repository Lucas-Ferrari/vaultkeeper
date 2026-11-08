import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Alert } from "../../../shared/ui/alert";
import { Badge, BADGE_TONE } from "../../../shared/ui/badge";
import { Button, BUTTON_VARIANT } from "../../../shared/ui/button";
import { categoriesQueryOptions } from "../../catalog/api/queries";
import { useDeleteItem, useUpdateItem } from "../api/mutations";
import { adminItemQueryOptions } from "../api/queries";
import { DeleteItem } from "../components/delete-item";
import { ItemEditForm } from "../components/item-edit-form";
import { adminErrorMessage } from "../lib/messages";
import { ImageSectionContainer } from "./image-section-container";

/** /catalog/$itemId (admin): edit, (de)activate, image, delete (R-CAT-2, R-CAT-3, R-CAT-6). */
export function ItemEditContainer({ itemId }: { itemId: string }) {
  const navigate = useNavigate();
  const item = useQuery(adminItemQueryOptions(itemId));
  const categories = useQuery(categoriesQueryOptions);
  const update = useUpdateItem(itemId);
  const remove = useDeleteItem(itemId);

  if (item.isError) return <Alert>{adminErrorMessage(item.error)}</Alert>;
  if (!item.data || !categories.data) return <p className="text-muted">Loading…</p>;
  const current = item.data;
  const icon =
    categories.data.find((category) => category.slug === current.categorySlug)?.icon ?? "item";
  const error = update.error ?? remove.error;

  return (
    <section className="flex flex-col gap-6">
      <Link to="/catalog" className="text-sm text-primary">
        ← Catalog
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{current.name}</h1>
        {current.isActive ? <Badge>Active</Badge> : <Badge tone={BADGE_TONE.MUTED}>Inactive</Badge>}
      </div>
      {error && <Alert>{adminErrorMessage(error)}</Alert>}
      {update.isSuccess && !update.isPending && (
        <p className="text-sm text-muted" role="status">
          Saved.
        </p>
      )}
      <ItemEditForm
        key={current.id}
        item={current}
        categories={categories.data}
        pending={update.isPending}
        onSubmit={(values) => update.mutate(values)}
      />
      <ImageSectionContainer item={current} categoryIcon={icon} />
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          variant={BUTTON_VARIANT.SECONDARY}
          disabled={update.isPending}
          onClick={() => update.mutate({ isActive: !current.isActive })}
        >
          {current.isActive ? "Deactivate" : "Reactivate"}
        </Button>
        <DeleteItem
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(undefined, { onSuccess: () => navigate({ to: "/catalog" }) })
          }
        />
      </div>
    </section>
  );
}
