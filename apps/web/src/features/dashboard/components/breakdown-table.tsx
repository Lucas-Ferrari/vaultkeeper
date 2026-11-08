import type { ValuationTotals } from "@vaultkeeper/shared/schemas/valuation";
import { formatTotal } from "../../../shared/lib/format-money";

export interface BreakdownRow {
  key: string;
  label: string;
  totals: ValuationTotals;
}

interface BreakdownTableProps {
  title: string;
  /** Column header of the label column ("Account", "Location"). */
  labelHeader: string;
  rows: readonly BreakdownRow[];
  /** data-testid prefix of the MC cell ("account" -> "account-mc"). */
  testIdPrefix: string;
}

/** Per-account / per-location totals (R-VAL-3); all-unpriced rows show "-", never 0. */
export function BreakdownTable({ title, labelHeader, rows, testIdPrefix }: BreakdownTableProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="relative overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-raised text-muted">
            <tr>
              <th scope="col" className="px-3 py-2">
                {labelHeader}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                MC
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                MP
              </th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Unpriced</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border">
                <td className="px-3 py-2">{row.label}</td>
                <td
                  className="px-3 py-2 text-right tabular-nums"
                  data-testid={`${testIdPrefix}-mc`}
                >
                  {formatTotal(row.totals, "totalMc")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatTotal(row.totals, "totalMp")}
                </td>
                <td className="px-3 py-2 text-xs text-danger">
                  {row.totals.partial && `${row.totals.unpricedCount} without price`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
