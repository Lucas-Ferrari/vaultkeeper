import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { accountsQueryOptions } from "../../accounts/api/queries";
import { SelectField } from "../../../shared/ui/select-field";
import { TextField } from "../../../shared/ui/text-field";
import type { StockSearch } from "../lib/search";
import { StockTableContainer } from "./stock-table-container";

/** /stock: filters live in the URL (validateSearch), so views can be shared and reloaded. */
export function StockListContainer({ search }: { search: StockSearch }) {
  const navigate = useNavigate({ from: "/stock/" });
  const accounts = useQuery(accountsQueryOptions);

  const onChange = (patch: Partial<StockSearch>) => {
    const next = { ...search, ...patch };
    void navigate({
      search: Object.fromEntries(
        Object.entries(next).filter(([, value]) => value !== undefined && value !== ""),
      ),
      replace: true,
    });
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Stock</h1>
        <Link
          to="/stock/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Add stock
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Search"
          type="search"
          value={search.q ?? ""}
          onChange={(event) => onChange({ q: event.target.value })}
        />
        <SelectField
          label="Account"
          value={search.accountId ?? ""}
          options={[
            { value: "", label: "All accounts" },
            ...(accounts.data ?? []).map((account) => ({ value: account.id, label: account.name })),
          ]}
          onChange={(event) => onChange({ accountId: event.target.value })}
        />
      </div>
      <StockTableContainer
        filters={{
          q: search.q?.trim() || undefined,
          accountId: search.accountId,
          locationId: search.locationId,
          groupId: search.groupId,
          category: search.category,
        }}
      />
    </section>
  );
}
