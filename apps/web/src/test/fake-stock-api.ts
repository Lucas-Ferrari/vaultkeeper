import { STORAGE_KIND, VAULT_COUNT } from "@vaultkeeper/shared/constants";
import { ERROR_CODE, type ApiErrorBody, type ErrorCode } from "@vaultkeeper/shared/errors";
import type { CatalogItem } from "@vaultkeeper/shared/schemas/catalog";
import {
  LOCATION_LABEL,
  type AccountStorage,
  type Character,
  type GameAccount,
  type StorageLocation,
} from "@vaultkeeper/shared/schemas/game-accounts";
import type { StockEntry, StockPage } from "@vaultkeeper/shared/schemas/stock";
import { http, HttpResponse, type AnyHandler } from "msw";

/**
 * In-memory game accounts + stock API for web tests (design 16), bodies typed by the shared
 * contracts. Validation/ownership rules are the API's job (tested there); this fake keeps only
 * what the screens react to: 409 on duplicate names, 409 STORAGE_NOT_EMPTY, over-limit vaults.
 */

interface Location {
  id: string;
  accountId: string;
  kind: StorageLocation["kind"];
  vaultNumber: number | null;
  characterId: string | null;
}

export interface FakeStockCalls {
  stockList: URLSearchParams[];
  stockCreates: unknown[];
  stockPatches: Array<{ id: string; body: unknown }>;
  moves: Array<{ id: string; storageLocationId: string }>;
  stockDeletes: string[];
  accountDeletes: string[];
}

export interface FakeStockApi {
  handlers: AnyHandler[];
  calls: FakeStockCalls;
  accounts: GameAccount[];
  entries: StockEntry[];
  vaultCount: number;
  addAccount(name: string): GameAccount;
  addCharacter(accountId: string, name: string): Character;
  /** Adds a vault beyond vaultCount (over limit). */
  addVault(accountId: string, vaultNumber: number): string;
  locationIdOf(accountId: string, label: string): string;
  addEntry(
    item: CatalogItem,
    storageLocationId: string,
    overrides?: Partial<StockEntry>,
  ): StockEntry;
}

let seq = 0;
function uuid(): string {
  seq += 1;
  return `10000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

function apiError(status: number, code: ErrorCode, message: string, details?: unknown) {
  const body: ApiErrorBody = {
    error: { code, message, requestId: "req-test", ...(details === undefined ? {} : { details }) },
  };
  return HttpResponse.json(body, { status });
}

export function fakeStockApi(catalog: { items: CatalogItem[] }): FakeStockApi {
  const accounts: GameAccount[] = [];
  const characters: Character[] = [];
  const locations: Location[] = [];
  const entries: StockEntry[] = [];
  const calls: FakeStockCalls = {
    stockList: [],
    stockCreates: [],
    stockPatches: [],
    moves: [],
    stockDeletes: [],
    accountDeletes: [],
  };

  const labelOf = (loc: Location) =>
    loc.kind === STORAGE_KIND.VAULT
      ? `${LOCATION_LABEL.VAULT_PREFIX}${loc.vaultNumber}`
      : `${LOCATION_LABEL.INVENTORY_PREFIX}${characters.find((c) => c.id === loc.characterId)?.name}`;

  const api: FakeStockApi = {
    handlers: [],
    calls,
    accounts,
    entries,
    vaultCount: VAULT_COUNT.DEFAULT,
    addAccount(name) {
      const account: GameAccount = { id: uuid(), name, notes: null };
      accounts.push(account);
      for (let n = 1; n <= api.vaultCount; n += 1) {
        locations.push({
          id: uuid(),
          accountId: account.id,
          kind: STORAGE_KIND.VAULT,
          vaultNumber: n,
          characterId: null,
        });
      }
      return account;
    },
    addCharacter(accountId, name) {
      const ch: Character = { id: uuid(), gameAccountId: accountId, name, class: null };
      characters.push(ch);
      locations.push({
        id: uuid(),
        accountId,
        kind: STORAGE_KIND.INVENTORY,
        vaultNumber: null,
        characterId: ch.id,
      });
      return ch;
    },
    addVault(accountId, vaultNumber) {
      const id = uuid();
      locations.push({ id, accountId, kind: STORAGE_KIND.VAULT, vaultNumber, characterId: null });
      return id;
    },
    locationIdOf(accountId, label) {
      const loc = locations.find((l) => l.accountId === accountId && labelOf(l) === label);
      if (!loc) throw new Error(`no location ${label}`);
      return loc.id;
    },
    addEntry(item, storageLocationId, overrides = {}) {
      const entry = buildEntry(item, storageLocationId, {
        quantity: overrides.quantity ?? 1,
        level: overrides.level ?? 0,
        priceMc: overrides.priceMc ?? null,
      });
      Object.assign(entry, overrides);
      entries.unshift(entry);
      return entry;
    },
  };

  function buildEntry(
    item: CatalogItem,
    storageLocationId: string,
    fields: {
      quantity: number;
      level: number;
      options?: string | null;
      priceMc?: string | null;
      notes?: string | null;
    },
  ): StockEntry {
    const loc = locations.find((l) => l.id === storageLocationId);
    if (!loc) throw new Error("unknown location");
    const priceMc = fields.priceMc ?? null;
    const unit = priceMc ?? item.referencePriceMc;
    return {
      id: uuid(),
      catalogItemId: item.id,
      itemName: item.name,
      itemActive: item.isActive,
      categorySlug: item.categorySlug,
      imageKey: item.imageKey,
      level: fields.level,
      quantity: fields.quantity,
      options: fields.options ?? null,
      notes: fields.notes ?? null,
      priceMc,
      unitPriceMc: unit,
      valueMc: unit === null ? null : (Number(unit) * fields.quantity).toFixed(2),
      storageLocationId,
      gameAccountId: loc.accountId,
      locationLabel: labelOf(loc),
      createdAt: new Date().toISOString(),
    };
  }

  const isOverLimit = (loc: Location) =>
    loc.vaultNumber !== null && loc.vaultNumber > api.vaultCount;

  function storageOf(accountId: string): AccountStorage {
    const locs = locations
      .filter((l) => l.accountId === accountId)
      .sort((a, b) =>
        a.kind === b.kind
          ? labelOf(a).localeCompare(labelOf(b), undefined, { numeric: true })
          : a.kind === STORAGE_KIND.INVENTORY
            ? -1
            : 1,
      );
    return {
      accountId,
      vaultCount: api.vaultCount,
      locations: locs.map((l) => ({
        id: l.id,
        kind: l.kind,
        label: labelOf(l),
        vaultNumber: l.vaultNumber,
        characterId: l.characterId,
        characterName: characters.find((c) => c.id === l.characterId)?.name ?? null,
        entryCount: entries.filter((e) => e.storageLocationId === l.id).length,
        overLimit: isOverLimit(l),
      })),
    };
  }

  const findAccount = (id: string) => accounts.find((a) => a.id === id);
  const findEntry = (id: string) => entries.find((e) => e.id === id);
  const notFound = () => apiError(404, ERROR_CODE.NOT_FOUND, "Not found");

  api.handlers = [
    http.get("/api/v1/game-accounts", () =>
      HttpResponse.json([...accounts].sort((a, b) => a.name.localeCompare(b.name))),
    ),
    http.post("/api/v1/game-accounts", async ({ request }) => {
      const body = (await request.json()) as { name: string };
      if (accounts.some((a) => a.name.toLowerCase() === body.name.trim().toLowerCase())) {
        return apiError(
          409,
          ERROR_CODE.CONFLICT,
          "You already have a game account with this name",
          {
            field: "name",
          },
        );
      }
      return HttpResponse.json(api.addAccount(body.name.trim()), { status: 201 });
    }),
    http.get("/api/v1/game-accounts/:id", ({ params }) => {
      const account = findAccount(String(params.id));
      return account ? HttpResponse.json(account) : notFound();
    }),
    http.delete("/api/v1/game-accounts/:id", ({ params }) => {
      const id = String(params.id);
      calls.accountDeletes.push(id);
      if (!findAccount(id)) return notFound();
      const count = entries.filter((e) => e.gameAccountId === id).length;
      if (count > 0) {
        return apiError(409, ERROR_CODE.STORAGE_NOT_EMPTY, "Move or delete the stock first", {
          count,
        });
      }
      accounts.splice(
        accounts.findIndex((a) => a.id === id),
        1,
      );
      return new HttpResponse(null, { status: 204 });
    }),
    http.get("/api/v1/game-accounts/:id/characters", ({ params }) =>
      HttpResponse.json(characters.filter((c) => c.gameAccountId === String(params.id))),
    ),
    http.post("/api/v1/game-accounts/:id/characters", async ({ params, request }) => {
      const body = (await request.json()) as { name: string };
      const accountId = String(params.id);
      if (
        characters.some(
          (c) => c.gameAccountId === accountId && c.name.toLowerCase() === body.name.toLowerCase(),
        )
      ) {
        return apiError(409, ERROR_CODE.CONFLICT, "Duplicate character", { field: "name" });
      }
      return HttpResponse.json(api.addCharacter(accountId, body.name.trim()), { status: 201 });
    }),
    http.get("/api/v1/game-accounts/:id/storage", ({ params }) => {
      const id = String(params.id);
      return findAccount(id) ? HttpResponse.json(storageOf(id)) : notFound();
    }),
    http.get("/api/v1/stock", ({ request }) => {
      const search = new URL(request.url).searchParams;
      calls.stockList.push(search);
      const q = (search.get("q") ?? "").toLowerCase();
      const items = entries.filter(
        (e) =>
          (q === "" || e.itemName.toLowerCase().includes(q)) &&
          (search.get("accountId") === null || e.gameAccountId === search.get("accountId")) &&
          (search.get("locationId") === null || e.storageLocationId === search.get("locationId")) &&
          (search.get("category") === null || e.categorySlug === search.get("category")),
      );
      const body: StockPage = { items, nextCursor: null };
      return HttpResponse.json(body);
    }),
    http.post("/api/v1/stock", async ({ request }) => {
      const body = (await request.json()) as {
        catalogItemId: string;
        storageLocationId: string;
        quantity?: number;
        level?: number;
        options?: string | null;
        priceMc?: string | null;
        notes?: string | null;
      };
      calls.stockCreates.push(body);
      const item = catalog.items.find((i) => i.id === body.catalogItemId);
      const loc = locations.find((l) => l.id === body.storageLocationId);
      if (!item || !loc) return notFound();
      if (isOverLimit(loc)) return apiError(422, ERROR_CODE.VAULT_OVER_LIMIT, "Over limit");
      const entry = buildEntry(item, loc.id, {
        quantity: body.quantity ?? 1,
        level: body.level ?? 0,
        options: body.options ?? null,
        priceMc: body.priceMc ?? null,
        notes: body.notes ?? null,
      });
      entries.unshift(entry);
      return HttpResponse.json(entry, { status: 201 });
    }),
    http.get("/api/v1/stock/:id", ({ params }) => {
      const entry = findEntry(String(params.id));
      return entry ? HttpResponse.json(entry) : notFound();
    }),
    http.patch("/api/v1/stock/:id", async ({ params, request }) => {
      const entry = findEntry(String(params.id));
      if (!entry) return notFound();
      const body = (await request.json()) as Partial<StockEntry>;
      calls.stockPatches.push({ id: entry.id, body });
      Object.assign(entry, body);
      return HttpResponse.json(entry);
    }),
    http.post("/api/v1/stock/:id/move", async ({ params, request }) => {
      const entry = findEntry(String(params.id));
      const { storageLocationId } = (await request.json()) as { storageLocationId: string };
      const loc = locations.find((l) => l.id === storageLocationId);
      if (!entry || !loc) return notFound();
      calls.moves.push({ id: entry.id, storageLocationId });
      if (isOverLimit(loc)) return apiError(422, ERROR_CODE.VAULT_OVER_LIMIT, "Over limit");
      Object.assign(entry, {
        storageLocationId,
        gameAccountId: loc.accountId,
        locationLabel: labelOf(loc),
      });
      return HttpResponse.json(entry);
    }),
    http.delete("/api/v1/stock/:id", ({ params }) => {
      const id = String(params.id);
      calls.stockDeletes.push(id);
      const index = entries.findIndex((e) => e.id === id);
      if (index === -1) return notFound();
      entries.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    }),
  ];

  return api;
}
