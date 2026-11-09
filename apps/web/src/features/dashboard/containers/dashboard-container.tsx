import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Alert } from "../../../shared/ui/alert";
import { ValueTotals } from "../../../shared/ui/value-totals";
import { valuationSummaryQueryOptions } from "../api/queries";
import { BreakdownTable } from "../components/breakdown-table";

/** "/" dashboard: overall value + per-account / per-location breakdown (R-VAL-2, R-VAL-3). */
export function DashboardContainer({ name }: { name: string }) {
  const summary = useQuery(valuationSummaryQueryOptions());
  const accountName = new Map(
    (summary.data?.byAccount ?? []).map((account) => [account.accountId, account.accountName]),
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted">Welcome, {name}. Here is what your stock is worth.</p>
      </div>
      {summary.isError && <Alert>Could not load your valuation.</Alert>}
      {!summary.data && !summary.isError && <p className="text-muted">Loading…</p>}
      {summary.data && (
        <>
          <ValueTotals title="Total value" totals={summary.data.totals} />
          {summary.data.byAccount.length === 0 ? (
            <p className="text-muted">
              No stock yet.{" "}
              <Link to="/accounts" className="font-medium text-primary hover:underline">
                Add a game account
              </Link>{" "}
              to start tracking items.
            </p>
          ) : (
            <>
              <BreakdownTable
                title="By account"
                labelHeader="Account"
                testIdPrefix="account"
                rows={summary.data.byAccount.map((account) => ({
                  key: account.accountId,
                  label: account.accountName,
                  totals: account,
                }))}
              />
              <BreakdownTable
                title="By location"
                labelHeader="Location"
                testIdPrefix="location"
                rows={summary.data.byLocation.map((location) => ({
                  key: location.locationId,
                  label: `${accountName.get(location.accountId) ?? ""} · ${location.label}`,
                  totals: location,
                }))}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
