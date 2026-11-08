import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import type {
  AccountStorage,
  Character,
  CreateCharacterInput,
  CreateGameAccountInput,
  GameAccount,
  UpdateCharacterInput,
  UpdateGameAccountInput,
} from "@vaultkeeper/shared/schemas/game-accounts";
import type { Database, Transaction } from "../../db/client";
import { AppError, ConflictError, NotFoundError } from "../../shared/http/errors";
import { PG_ERROR, pgCodeOf } from "../../shared/http/on-error";
import * as accountsRepository from "./repository";

export type GameAccountsRepository = typeof accountsRepository;

export interface GameAccountsServiceDeps {
  db: Database;
  repo?: GameAccountsRepository;
}

/** R-GA-4: deleting storage that still holds stock is a 409 reporting how many entries. */
export function storageNotEmpty(count: number | undefined): AppError {
  return new AppError({
    code: ERROR_CODE.STORAGE_NOT_EMPTY,
    status: 409,
    message: "Move or delete the stock stored here first",
    ...(count === undefined ? {} : { details: { count } }),
  });
}

/** Case-insensitive unique names (R-GA-1 S2, R-GA-3 S2) are a 409 on the name field. */
async function mapNameConflict<T>(write: Promise<T>, message: string): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (pgCodeOf(error) === PG_ERROR.UNIQUE_VIOLATION) {
      throw new ConflictError(message, { field: "name" });
    }
    throw error;
  }
}

/** Game accounts, characters and their storage (design 02/05). Every call is scoped to userId. */
export function createGameAccountsService({
  db,
  repo = accountsRepository,
}: GameAccountsServiceDeps) {
  async function requireAccount(userId: string, id: string): Promise<GameAccount> {
    const account = await repo.findAccount(db, userId, id);
    if (!account) throw new NotFoundError("Game account not found");
    return account;
  }

  /**
   * Count, then delete, in one transaction (ADR8); stock found -> 409 and nothing is deleted. The
   * NO ACTION FK stock -> location still guards a racing insert (23503 -> same 409, no count).
   */
  async function deleteIfEmpty(
    count: (tx: Transaction) => Promise<number>,
    remove: (tx: Transaction) => Promise<boolean>,
    notFound: string,
  ): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        const entries = await count(tx);
        if (entries > 0) throw storageNotEmpty(entries);
        if (!(await remove(tx))) throw new NotFoundError(notFound);
      });
    } catch (error) {
      if (pgCodeOf(error) === PG_ERROR.FOREIGN_KEY_VIOLATION) throw storageNotEmpty(undefined);
      throw error;
    }
  }

  return {
    listAccounts(userId: string): Promise<GameAccount[]> {
      return repo.listAccounts(db, userId);
    },

    getAccount: requireAccount,

    /** R-GA-2: the account and its vaults are created in the same transaction. */
    createAccount(userId: string, input: CreateGameAccountInput): Promise<GameAccount> {
      return mapNameConflict(
        db.transaction(async (tx) => {
          const account = await repo.insertAccount(tx, userId, input);
          await repo.insertVaults(tx, userId, account.id);
          return account;
        }),
        "You already have a game account with this name",
      );
    },

    async updateAccount(
      userId: string,
      id: string,
      patch: UpdateGameAccountInput,
    ): Promise<GameAccount> {
      const account = await mapNameConflict(
        repo.updateAccount(db, userId, id, patch),
        "You already have a game account with this name",
      );
      if (!account) throw new NotFoundError("Game account not found");
      return account;
    },

    deleteAccount(userId: string, id: string): Promise<void> {
      return deleteIfEmpty(
        (tx) => repo.countAccountEntries(tx, userId, id),
        (tx) => repo.deleteAccount(tx, userId, id),
        "Game account not found",
      );
    },

    async listCharacters(userId: string, accountId: string): Promise<Character[]> {
      await requireAccount(userId, accountId);
      return repo.listCharacters(db, userId, accountId);
    },

    /** R-GA-3 S1: the character and its inventory are created together. */
    async createCharacter(
      userId: string,
      accountId: string,
      input: CreateCharacterInput,
    ): Promise<Character> {
      await requireAccount(userId, accountId);
      return mapNameConflict(
        db.transaction(async (tx) => {
          const ch = await repo.insertCharacter(tx, userId, accountId, input);
          await repo.insertInventory(tx, userId, ch);
          return ch;
        }),
        "This account already has a character with this name",
      );
    },

    async updateCharacter(
      userId: string,
      id: string,
      patch: UpdateCharacterInput,
    ): Promise<Character> {
      const ch = await mapNameConflict(
        repo.updateCharacter(db, userId, id, patch),
        "This account already has a character with this name",
      );
      if (!ch) throw new NotFoundError("Character not found");
      return ch;
    },

    deleteCharacter(userId: string, id: string): Promise<void> {
      return deleteIfEmpty(
        (tx) => repo.countCharacterEntries(tx, userId, id),
        (tx) => repo.deleteCharacter(tx, userId, id),
        "Character not found",
      );
    },

    async getStorage(userId: string, accountId: string): Promise<AccountStorage> {
      await requireAccount(userId, accountId);
      const [vaultCount, locations] = await Promise.all([
        repo.readVaultCount(db),
        repo.listStorage(db, userId, accountId),
      ]);
      return { accountId, vaultCount, locations };
    },
  };
}

export type GameAccountsService = ReturnType<typeof createGameAccountsService>;
