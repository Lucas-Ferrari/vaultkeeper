import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { StockTableContainer } from "../../stock/containers/stock-table-container";
import { accountQueryOptions, storageQueryOptions } from "../api/queries";

/** /accounts/$accountId/locations/$locationId: the entries stored in one location. */
export function LocationContainer({
  accountId,
  locationId,
}: {
  accountId: string;
  locationId: string;
}) {
  const account = useQuery(accountQueryOptions(accountId));
  const storage = useQuery(storageQueryOptions(accountId));
  const label = storage.data?.locations.find((location) => location.id === locationId)?.label;

  return (
    <section className="flex flex-col gap-4">
      <Link to="/accounts/$accountId" params={{ accountId }} className="text-sm text-primary">
        ← {account.data?.name ?? "Account"}
      </Link>
      <h1 className="text-2xl font-bold">
        {account.data && label ? `${account.data.name} · ${label}` : "Location"}
      </h1>
      <StockTableContainer filters={{ locationId }} />
    </section>
  );
}
