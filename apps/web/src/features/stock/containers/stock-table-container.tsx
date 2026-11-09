import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { StockEntry } from "@vaultkeeper/shared/schemas/stock";
import { useState } from "react";
import { Alert } from "../../../shared/ui/alert";
import { Button, BUTTON_VARIANT } from "../../../shared/ui/button";
import { ConfirmButton } from "../../../shared/ui/confirm-button";
import { useLocationChoices } from "../../accounts/api/queries";
import { categoriesQueryOptions } from "../../catalog/api/queries";
import { AddToGroupBar } from "../../groups/containers/add-to-group-bar";
import { useDeleteEntry, useMoveEntry } from "../api/mutations";
import type { StockFilters } from "../api/keys";
import { stockListQueryOptions } from "../api/queries";
import { MoveDialog } from "../components/move-dialog";
import { StockTable } from "../components/stock-table";
import { stockErrorMessage } from "../lib/messages";

const GENERIC_ICON = "item";

/** Entries matching `filters` with move/delete actions; used by /stock and location pages. */
export function StockTableContainer({ filters }: { filters: StockFilters }) {
  const list = useInfiniteQuery({
    ...stockListQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery(categoriesQueryOptions);
  const iconOf = (slug: string) =>
    categories.data?.find((category) => category.slug === slug)?.icon ?? GENERIC_ICON;
  const [moving, setMoving] = useState<StockEntry | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (entry: StockEntry) =>
    setSelected((ids) =>
      ids.includes(entry.id) ? ids.filter((id) => id !== entry.id) : [...ids, entry.id],
    );
  const move = useMoveEntry();
  const remove = useDeleteEntry();
  const { choices } = useLocationChoices();

  if (list.isError) return <Alert>Could not load your stock.</Alert>;
  if (!list.data) return <p className="text-muted">Loading…</p>;
  const entries = list.data.pages.flatMap((page) => page.items);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-6">
        <p className="text-muted">No stock yet{filters.q ? ` matching “${filters.q}”` : ""}.</p>
        <Link
          to="/stock/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Add your first entry
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {remove.error && <Alert>{stockErrorMessage(remove.error)}</Alert>}
      {moving && (
        <MoveDialog
          key={moving.id}
          itemName={moving.itemName}
          options={choices
            .filter((choice) => choice.id !== moving.storageLocationId)
            .map((choice) => ({
              value: choice.id,
              label: choice.overLimit ? `${choice.label} (over limit)` : choice.label,
              disabled: choice.overLimit,
            }))}
          pending={move.isPending}
          error={move.error ? stockErrorMessage(move.error) : undefined}
          onCancel={() => {
            move.reset();
            setMoving(null);
          }}
          onMove={(storageLocationId) =>
            move.mutate({ id: moving.id, storageLocationId }, { onSuccess: () => setMoving(null) })
          }
        />
      )}
      <AddToGroupBar
        entryIds={selected.filter((id) => entries.some((entry) => entry.id === id))}
        onAdded={() => setSelected([])}
      />
      <StockTable
        entries={entries}
        iconOf={iconOf}
        selection={{ selected: new Set(selected), onToggle: toggle }}
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
          <>
            <Button
              variant={BUTTON_VARIANT.SECONDARY}
              aria-label={`Move ${entry.itemName}`}
              onClick={() => {
                move.reset();
                setMoving(entry);
              }}
            >
              Move
            </Button>
            <ConfirmButton
              label="Delete"
              ariaLabel={`Delete ${entry.itemName}`}
              prompt="Delete this entry?"
              pending={remove.isPending}
              onConfirm={() => remove.mutate(entry.id)}
            />
          </>
        )}
      />
      {list.hasNextPage && (
        <Button
          variant={BUTTON_VARIANT.SECONDARY}
          className="self-start"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
