import type { ValuationSummary, ValuationTotals } from "@vaultkeeper/shared/schemas/valuation";
import type { Database } from "../../db/client";
import { NotFoundError } from "../../shared/http/errors";
import { findAccount } from "../game-accounts/repository";
import { findGroup } from "../groups/repository";
import * as valuationRepository from "./repository";

export interface ValuationServiceDeps {
  db: Database;
}

/** Read-only valuation (R-VAL-1..3): every number comes from SQL at read time, nothing stored. */
export function createValuationService({ db }: ValuationServiceDeps) {
  return {
    /** One snapshot: rate and totals are read in the same transaction. */
    summary(userId: string, accountId: string | undefined): Promise<ValuationSummary> {
      return db.transaction(
        async (tx) => {
          if (accountId !== undefined && !(await findAccount(tx, userId, accountId))) {
            throw new NotFoundError("Game account not found");
          }
          const mcToMpRate = await valuationRepository.readRate(tx);
          return { mcToMpRate, ...(await valuationRepository.summary(tx, userId, accountId)) };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },

    async group(userId: string, groupId: string): Promise<ValuationTotals> {
      if (!(await findGroup(db, userId, groupId))) throw new NotFoundError("Group not found");
      return valuationRepository.groupTotals(db, userId, groupId);
    },
  };
}

export type ValuationService = ReturnType<typeof createValuationService>;
