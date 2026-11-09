import type { ValuationTotals } from "@vaultkeeper/shared/schemas/valuation";
import { formatTotal, unpricedLabel } from "../lib/format-money";
import { Badge, BADGE_TONE } from "./badge";

interface ValueTotalsProps {
  /** Accessible region name, e.g. "Total value". */
  title: string;
  totals: ValuationTotals;
}

/** R-VAL-3 totals card: MC + derived MP, unpriced badge and partial marker. */
export function ValueTotals({ title, totals }: ValueTotalsProps) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4"
    >
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-muted">MC</dt>
          <dd className="text-2xl font-bold tabular-nums" data-testid="total-mc">
            {formatTotal(totals, "totalMc")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">MP</dt>
          <dd className="text-2xl font-bold tabular-nums" data-testid="total-mp">
            {formatTotal(totals, "totalMp")}
          </dd>
        </div>
      </dl>
      {totals.partial && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={BADGE_TONE.DANGER}>{unpricedLabel(totals.unpricedCount)}</Badge>
          <span className="text-muted">Partial total</span>
        </p>
      )}
    </section>
  );
}
