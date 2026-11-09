import { STORAGE_KIND } from "@vaultkeeper/shared/constants";
import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { sum, toMp } from "@vaultkeeper/shared/money";
import type { StockGroup, StockGroupDetail } from "@vaultkeeper/shared/schemas/groups";
import type { Settings } from "@vaultkeeper/shared/schemas/settings";
import type { StockEntry } from "@vaultkeeper/shared/schemas/stock";
import type { ValuationSummary, ValuationTotals } from "@vaultkeeper/shared/schemas/valuation";
import { http, HttpResponse, type AnyHandler } from "msw";
import type { FakeStockApi } from "./fake-stock-api";

/**
 * In-memory valuation + groups + settings API for web tests (design 16), on top of the stock
 * fake's entries. Totals use the shared client money helpers; the API's SQL is tested on its own.
 */

interface Group {
  id: string;
  name: string;
  description: string | null;
  entryIds: Set<string>;
}

export interface FakeValuationCalls {
  summary: URLSearchParams[];
  groupCreates: unknown[];
  groupAdds: Array<{ id: string; stockEntryIds: string[] }>;
  groupRemoves: Array<{ id: string; entryId: string }>;
  groupDeletes: string[];
  settingsPatches: unknown[];
}

export interface FakeValuationApi {
  handlers: AnyHandler[];
  calls: FakeValuationCalls;
  settings: Settings;
  addGroup(name: string, entryIds?: string[]): string;
  groupEntryIds(id: string): string[];
  /** Next PATCH /admin/settings answers 422 with this field issue. */
  rejectNextSettings(field: string, message: string): void;
}

let seq = 0;
function uuid(): string {
  seq += 1;
  return `20000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

function apiError(status: number, code: string, message: string, details?: unknown) {
  const body = {
    error: { code, message, requestId: "req-test", ...(details === undefined ? {} : { details }) },
  } as ApiErrorBody;
  return HttpResponse.json(body, { status });
}

export function fakeValuationApi(stock: FakeStockApi): FakeValuationApi {
  const groups: Group[] = [];
  const calls: FakeValuationCalls = {
    summary: [],
    groupCreates: [],
    groupAdds: [],
    groupRemoves: [],
    groupDeletes: [],
    settingsPatches: [],
  };
  let settingsRejection: { field: string; message: string } | null = null;

  const api: FakeValuationApi = {
    handlers: [],
    calls,
    settings: {
      mcToMpRate: "7.5000",
      vaultCount: stock.vaultCount,
      updatedAt: new Date(0).toISOString(),
      updatedBy: null,
    },
    addGroup(name, entryIds = []) {
      const id = uuid();
      groups.push({ id, name, description: null, entryIds: new Set(entryIds) });
      return id;
    },
    groupEntryIds: (id) => [...(groups.find((g) => g.id === id)?.entryIds ?? [])],
    rejectNextSettings(field, message) {
      settingsRejection = { field, message };
    },
  };

  const rate = () => api.settings.mcToMpRate.replace(/0+$/, "").replace(/\.$/, "");

  function totalsOf(entries: readonly StockEntry[]): ValuationTotals {
    const values = entries.map((e) => e.valueMc);
    const totalMc = sum(values);
    const unpricedCount = values.filter((v) => v === null).length;
    return {
      totalMc,
      totalMp: toMp(totalMc, rate()),
      pricedCount: values.length - unpricedCount,
      unpricedCount,
      partial: unpricedCount > 0,
    };
  }

  const liveEntries = (group: Group) => {
    for (const id of group.entryIds) {
      if (!stock.entries.some((e) => e.id === id)) group.entryIds.delete(id);
    }
    return stock.entries.filter((e) => group.entryIds.has(e.id));
  };
  const toGroup = (group: Group): StockGroup => {
    const entries = liveEntries(group);
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      entryCount: entries.length,
      totals: totalsOf(entries),
    };
  };
  const toDetail = (group: Group): StockGroupDetail => ({
    ...toGroup(group),
    entries: liveEntries(group),
  });
  const findGroup = (id: unknown) => groups.find((g) => g.id === String(id));
  const notFound = () => apiError(404, ERROR_CODE.NOT_FOUND, "Group not found");
  const taken = (name: string, except?: string) =>
    groups.some((g) => g.id !== except && g.name.toLowerCase() === name.trim().toLowerCase());
  const conflict = () =>
    apiError(409, ERROR_CODE.CONFLICT, "You already have a group with this name", {
      field: "name",
    });

  function summaryOf(accountId: string | null): ValuationSummary {
    const entries = stock.entries.filter(
      (e) => accountId === null || e.gameAccountId === accountId,
    );
    const accounts = stock.accounts
      .filter((a) => accountId === null || a.id === accountId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const locationIds = [...new Set(entries.map((e) => e.storageLocationId))];
    return {
      mcToMpRate: api.settings.mcToMpRate,
      totals: totalsOf(entries),
      byAccount: accounts.map((a) => ({
        accountId: a.id,
        accountName: a.name,
        ...totalsOf(entries.filter((e) => e.gameAccountId === a.id)),
      })),
      byLocation: locationIds.map((locationId) => {
        const inside = entries.filter((e) => e.storageLocationId === locationId);
        const first = inside[0] as StockEntry;
        return {
          locationId,
          accountId: first.gameAccountId,
          kind: first.locationLabel.startsWith("Vault")
            ? STORAGE_KIND.VAULT
            : STORAGE_KIND.INVENTORY,
          label: first.locationLabel,
          characterId: null,
          ...totalsOf(inside),
        };
      }),
    };
  }

  api.handlers = [
    http.get("/api/v1/valuation/summary", ({ request }) => {
      const search = new URL(request.url).searchParams;
      calls.summary.push(search);
      return HttpResponse.json(summaryOf(search.get("accountId")));
    }),
    http.get("/api/v1/valuation/groups/:id", ({ params }) => {
      const group = findGroup(params.id);
      return group ? HttpResponse.json(toGroup(group).totals) : notFound();
    }),
    http.get("/api/v1/groups", () =>
      HttpResponse.json(
        [...groups].sort((a, b) => a.name.localeCompare(b.name)).map((g) => toGroup(g)),
      ),
    ),
    http.post("/api/v1/groups", async ({ request }) => {
      const body = (await request.json()) as { name: string; description?: string | null };
      calls.groupCreates.push(body);
      if (taken(body.name)) return conflict();
      const id = api.addGroup(body.name.trim());
      const group = findGroup(id) as Group;
      group.description = body.description ?? null;
      return HttpResponse.json(toGroup(group), { status: 201 });
    }),
    http.get("/api/v1/groups/:id", ({ params }) => {
      const group = findGroup(params.id);
      return group ? HttpResponse.json(toDetail(group)) : notFound();
    }),
    http.patch("/api/v1/groups/:id", async ({ params, request }) => {
      const group = findGroup(params.id);
      if (!group) return notFound();
      const body = (await request.json()) as { name?: string; description?: string | null };
      if (body.name !== undefined && taken(body.name, group.id)) return conflict();
      if (body.name !== undefined) group.name = body.name.trim();
      if (body.description !== undefined) group.description = body.description;
      return HttpResponse.json(toGroup(group));
    }),
    http.delete("/api/v1/groups/:id", ({ params }) => {
      const index = groups.findIndex((g) => g.id === String(params.id));
      calls.groupDeletes.push(String(params.id));
      if (index === -1) return notFound();
      groups.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("/api/v1/groups/:id/entries", async ({ params, request }) => {
      const group = findGroup(params.id);
      if (!group) return notFound();
      const { stockEntryIds } = (await request.json()) as { stockEntryIds: string[] };
      calls.groupAdds.push({ id: group.id, stockEntryIds });
      if (!stockEntryIds.every((id) => stock.entries.some((e) => e.id === id))) {
        return apiError(404, ERROR_CODE.NOT_FOUND, "Stock entry not found");
      }
      for (const id of stockEntryIds) group.entryIds.add(id);
      return HttpResponse.json(toDetail(group));
    }),
    http.delete("/api/v1/groups/:id/entries/:entryId", ({ params }) => {
      const group = findGroup(params.id);
      if (!group) return notFound();
      calls.groupRemoves.push({ id: group.id, entryId: String(params.entryId) });
      group.entryIds.delete(String(params.entryId));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get("/api/v1/settings", () => HttpResponse.json(api.settings)),
    http.patch("/api/v1/admin/settings", async ({ request }) => {
      const body = (await request.json()) as { mcToMpRate?: string; vaultCount?: number };
      calls.settingsPatches.push(body);
      if (settingsRejection) {
        const { field, message } = settingsRejection;
        settingsRejection = null;
        return apiError(422, ERROR_CODE.VALIDATION_FAILED, "Invalid input", {
          target: "json",
          issues: [{ path: [field], code: "custom", message }],
        });
      }
      if (body.mcToMpRate !== undefined) {
        const [whole = "0", fraction = ""] = body.mcToMpRate.split(".");
        api.settings.mcToMpRate = `${whole}.${fraction.padEnd(4, "0")}`;
      }
      if (body.vaultCount !== undefined) {
        api.settings.vaultCount = body.vaultCount;
        stock.vaultCount = body.vaultCount;
      }
      api.settings.updatedAt = new Date().toISOString();
      return HttpResponse.json(api.settings);
    }),
  ];

  return api;
}
