import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Alert } from "../../../shared/ui/alert";
import { Button, BUTTON_VARIANT } from "../../../shared/ui/button";
import { ConfirmButton } from "../../../shared/ui/confirm-button";
import { ValueTotals } from "../../../shared/ui/value-totals";
import { categoriesQueryOptions } from "../../catalog/api/queries";
import { StockTable } from "../../stock/components/stock-table";
import { useDeleteGroup, useRemoveFromGroup } from "../api/mutations";
import { groupQueryOptions } from "../api/queries";
import { groupErrorMessage } from "../lib/messages";

const GENERIC_ICON = "item";

/** /groups/$groupId: members with location + value, group totals, remove, delete (R-GRP-3). */
export function GroupDetailContainer({ groupId }: { groupId: string }) {
  const navigate = useNavigate();
  const group = useQuery(groupQueryOptions(groupId));
  const categories = useQuery(categoriesQueryOptions);
  const removeEntry = useRemoveFromGroup(groupId);
  const remove = useDeleteGroup(groupId);
  const iconOf = (slug: string) =>
    categories.data?.find((category) => category.slug === slug)?.icon ?? GENERIC_ICON;

  if (group.isError) return <Alert>{groupErrorMessage(group.error)}</Alert>;
  if (!group.data) return <p className="text-muted">Loading…</p>;

  return (
    <section className="flex flex-col gap-4">
      <Link to="/groups" className="text-sm text-primary">
        ← Groups
      </Link>
      <h1 className="text-2xl font-bold">{group.data.name}</h1>
      {group.data.description && <p className="text-muted">{group.data.description}</p>}
      <ValueTotals title="Group value" totals={group.data.totals} />
      {removeEntry.error && <Alert>{groupErrorMessage(removeEntry.error)}</Alert>}
      {group.data.entries.length === 0 ? (
        <p className="text-muted">
          No entries yet. Select entries in{" "}
          <Link to="/stock" className="font-medium text-primary hover:underline">
            your stock
          </Link>{" "}
          and add them to this group.
        </p>
      ) : (
        <StockTable
          entries={group.data.entries}
          iconOf={iconOf}
          renderName={(entry) => (
            <Link
              to="/stock/$entryId"
              params={{ entryId: entry.id }}
              className="font-medium text-primary hover:underline"
            >
              {entry.itemName}
            </Link>
          )}
          renderActions={(entry) => (
            <Button
              variant={BUTTON_VARIANT.SECONDARY}
              aria-label={`Remove ${entry.itemName} from group`}
              disabled={removeEntry.isPending}
              onClick={() => removeEntry.mutate(entry.id)}
            >
              Remove
            </Button>
          )}
        />
      )}
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {remove.error && <Alert>{groupErrorMessage(remove.error)}</Alert>}
        <ConfirmButton
          label="Delete group"
          prompt="Delete this group? Its entries stay in your stock."
          confirmLabel="Confirm"
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(undefined, { onSuccess: () => navigate({ to: "/groups" }) })
          }
        />
      </div>
    </section>
  );
}
