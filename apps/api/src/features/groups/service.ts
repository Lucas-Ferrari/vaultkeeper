import type {
  CreateGroupInput,
  StockGroup,
  StockGroupDetail,
  UpdateGroupInput,
} from "@vaultkeeper/shared/schemas/groups";
import type { Database, DbOrTx } from "../../db/client";
import { NotFoundError } from "../../shared/http/errors";
import { mapNameConflict } from "../../shared/http/on-error";
import { countOwnEntries, listGroupEntries } from "../stock/repository";
import * as groupsRepository from "./repository";

export interface GroupsServiceDeps {
  db: Database;
}

const NAME_TAKEN = "You already have a group with this name";
const groupNotFound = () => new NotFoundError("Group not found");

/** Stock groups and their many-to-many membership (R-GRP-1..3). Every call is scoped to userId. */
export function createGroupsService({ db }: GroupsServiceDeps) {
  async function requireGroup(tx: DbOrTx, userId: string, id: string): Promise<void> {
    if (!(await groupsRepository.findGroup(tx, userId, id))) throw groupNotFound();
  }

  /** R-GRP-2 S6/S7: every id must be the user's own entry, else 404 and nothing changes. */
  async function requireOwnEntries(tx: DbOrTx, userId: string, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if ((await countOwnEntries(tx, userId, unique)) !== unique.length) {
      throw new NotFoundError("Stock entry not found");
    }
    return unique;
  }

  async function readGroup(tx: DbOrTx, userId: string, id: string): Promise<StockGroup> {
    const [group] = await groupsRepository.listGroups(tx, userId, id);
    if (!group) throw groupNotFound();
    return group;
  }

  async function readDetail(tx: DbOrTx, userId: string, id: string): Promise<StockGroupDetail> {
    const group = await readGroup(tx, userId, id);
    return { ...group, entries: await listGroupEntries(tx, userId, id) };
  }

  return {
    list(userId: string): Promise<StockGroup[]> {
      return groupsRepository.listGroups(db, userId);
    },

    get(userId: string, id: string): Promise<StockGroupDetail> {
      return db.transaction((tx) => readDetail(tx, userId, id), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },

    async create(userId: string, input: CreateGroupInput): Promise<StockGroup> {
      const id = await mapNameConflict(groupsRepository.insertGroup(db, userId, input), NAME_TAKEN);
      return readGroup(db, userId, id);
    },

    async update(userId: string, id: string, patch: UpdateGroupInput): Promise<StockGroup> {
      const found = await mapNameConflict(
        groupsRepository.updateGroup(db, userId, id, patch),
        NAME_TAKEN,
      );
      if (!found) throw groupNotFound();
      return readGroup(db, userId, id);
    },

    async remove(userId: string, id: string): Promise<void> {
      if (!(await groupsRepository.deleteGroup(db, userId, id))) throw groupNotFound();
    },

    /** Bulk, idempotent add in one transaction (S1/S2/S7). */
    addEntries(userId: string, id: string, entryIds: string[]): Promise<StockGroupDetail> {
      return db.transaction(async (tx) => {
        await requireGroup(tx, userId, id);
        const ids = await requireOwnEntries(tx, userId, entryIds);
        await groupsRepository.addMembers(tx, userId, id, ids);
        return readDetail(tx, userId, id);
      });
    },

    /** PUT: the membership becomes exactly `entryIds` (all-or-nothing). */
    replaceEntries(userId: string, id: string, entryIds: string[]): Promise<StockGroupDetail> {
      return db.transaction(async (tx) => {
        await requireGroup(tx, userId, id);
        const ids = await requireOwnEntries(tx, userId, entryIds);
        await groupsRepository.removeMembersExcept(tx, userId, id, ids);
        await groupsRepository.addMembers(tx, userId, id, ids);
        return readDetail(tx, userId, id);
      });
    },

    /** S4: the entry itself and its other memberships stay. Idempotent for own groups. */
    async removeEntry(userId: string, id: string, entryId: string): Promise<void> {
      await requireGroup(db, userId, id);
      await groupsRepository.removeMember(db, userId, id, entryId);
    },
  };
}

export type GroupsService = ReturnType<typeof createGroupsService>;
