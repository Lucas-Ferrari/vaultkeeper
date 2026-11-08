import { CATALOG_SOURCE } from "@vaultkeeper/shared/constants";
import { ERROR_CODE, type ApiErrorBody, type ErrorCode } from "@vaultkeeper/shared/errors";
import type {
  CatalogItem,
  CatalogItemPage,
  ItemCategory,
} from "@vaultkeeper/shared/schemas/catalog";
import type { CsvImportResult } from "@vaultkeeper/shared/schemas/csv";
import { http, HttpResponse, type AnyHandler } from "msw";

/**
 * In-memory catalog API for web tests (design 16). Bodies are typed by the shared contracts.
 * Search is a case-insensitive substring match: ranking is the API's job (tested there).
 */

export interface CatalogRequest {
  path: string;
  search: URLSearchParams;
}

export interface FakeCatalogCalls {
  userSearch: CatalogRequest[];
  adminList: CatalogRequest[];
  patches: Array<{ id: string; body: unknown }>;
  deletes: string[];
  uploads: Array<{ id: string; file: File }>;
  imports: Array<{ dryRun: string | null; file: File }>;
}

export interface FakeCatalogApi {
  handlers: AnyHandler[];
  calls: FakeCatalogCalls;
  items: CatalogItem[];
  categories: ItemCategory[];
  addItem(overrides?: Partial<CatalogItem>): CatalogItem;
  /** Next GET /catalog/items waits for this promise (to observe loading states). */
  holdUserSearch(gate: Promise<void>): void;
  /** Ids whose DELETE answers 409 REFERENCED. */
  referenced: Set<string>;
  /** Next image PUT fails with this status/code. */
  failNextUpload(status: number, code: ErrorCode, message: string): void;
  /** Response of the next import call. */
  importResult: (dryRun: boolean) => CsvImportResult;
}

export const FAKE_CATEGORIES: ItemCategory[] = [
  { slug: "wings", name: "Wings", icon: "wings", sortOrder: 0 },
  { slug: "swords", name: "Swords", icon: "sword", sortOrder: 1 },
];

function apiError(status: number, code: ErrorCode, message: string, details?: unknown) {
  const body: ApiErrorBody = {
    error: { code, message, requestId: "req-test", ...(details === undefined ? {} : { details }) },
  };
  return HttpResponse.json(body, { status });
}

function page(items: CatalogItem[], search: URLSearchParams): CatalogItemPage {
  const limit = Number(search.get("limit") ?? 20);
  const offset = Number(search.get("offset") ?? 0);
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
    hasMore: offset + limit < items.length,
  };
}

let seq = 0;

export function fakeCatalogApi(): FakeCatalogApi {
  const items: CatalogItem[] = [];
  const calls: FakeCatalogCalls = {
    userSearch: [],
    adminList: [],
    patches: [],
    deletes: [],
    uploads: [],
    imports: [],
  };
  let gate: Promise<void> | null = null;
  let uploadFailure: { status: number; code: ErrorCode; message: string } | null = null;

  const api: FakeCatalogApi = {
    handlers: [],
    calls,
    items,
    categories: FAKE_CATEGORIES,
    referenced: new Set(),
    addItem(overrides = {}) {
      seq += 1;
      const item: CatalogItem = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
        categorySlug: "wings",
        name: `Item ${seq}`,
        isActive: true,
        referencePriceMc: null,
        imageKey: null,
        source: CATALOG_SOURCE.ADMIN,
        ...overrides,
      };
      items.push(item);
      return item;
    },
    holdUserSearch(next) {
      gate = next;
    },
    failNextUpload(status, code, message) {
      uploadFailure = { status, code, message };
    },
    importResult: (dryRun) => ({
      dryRun,
      created: 0,
      updated: 0,
      unchanged: 0,
      rows: [],
      errors: [],
    }),
  };

  function matching(search: URLSearchParams, scope: (item: CatalogItem) => boolean) {
    const q = (search.get("q") ?? "").toLowerCase();
    const category = search.get("category");
    return items.filter(
      (item) =>
        scope(item) &&
        (q === "" || item.name.toLowerCase().includes(q)) &&
        (category === null || item.categorySlug === category),
    );
  }

  function adminScope(search: URLSearchParams) {
    const active = search.get("active");
    const includeInactive = search.get("includeInactive") === "true";
    return (item: CatalogItem) =>
      active !== null ? item.isActive === (active === "true") : includeInactive || item.isActive;
  }

  const find = (id: string) => items.find((item) => item.id === id);

  api.handlers = [
    http.get("/api/v1/catalog/categories", () => HttpResponse.json(api.categories)),
    http.get("/api/v1/catalog/items", async ({ request }) => {
      const url = new URL(request.url);
      calls.userSearch.push({ path: url.pathname, search: url.searchParams });
      if (gate) {
        const waitFor = gate;
        gate = null;
        await waitFor;
      }
      return HttpResponse.json(
        page(
          matching(url.searchParams, () => true),
          url.searchParams,
        ),
      );
    }),
    http.get("/api/v1/catalog/items/:id", ({ params }) => {
      const item = find(String(params.id));
      return item?.isActive
        ? HttpResponse.json(item)
        : apiError(404, ERROR_CODE.NOT_FOUND, "Not found");
    }),
    http.get("/api/v1/admin/catalog/items", ({ request }) => {
      const url = new URL(request.url);
      calls.adminList.push({ path: url.pathname, search: url.searchParams });
      return HttpResponse.json(
        page(matching(url.searchParams, adminScope(url.searchParams)), url.searchParams),
      );
    }),
    http.get("/api/v1/admin/catalog/items/:id", ({ params }) => {
      const item = find(String(params.id));
      return item ? HttpResponse.json(item) : apiError(404, ERROR_CODE.NOT_FOUND, "Not found");
    }),
    http.patch("/api/v1/admin/catalog/items/:id", async ({ params, request }) => {
      const item = find(String(params.id));
      if (!item) return apiError(404, ERROR_CODE.NOT_FOUND, "Not found");
      const body = (await request.json()) as Partial<CatalogItem>;
      calls.patches.push({ id: item.id, body });
      Object.assign(item, body);
      return HttpResponse.json(item);
    }),
    http.delete("/api/v1/admin/catalog/items/:id", ({ params }) => {
      const id = String(params.id);
      calls.deletes.push(id);
      if (api.referenced.has(id)) {
        return apiError(
          409,
          ERROR_CODE.REFERENCED,
          "Item is used by stock entries; deactivate it instead",
        );
      }
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return apiError(404, ERROR_CODE.NOT_FOUND, "Not found");
      items.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    }),
    http.put("/api/v1/admin/catalog/items/:id/image", async ({ params, request }) => {
      const item = find(String(params.id));
      if (!item) return apiError(404, ERROR_CODE.NOT_FOUND, "Not found");
      const file = (await request.formData()).get("file") as File;
      calls.uploads.push({ id: item.id, file });
      if (uploadFailure) {
        const failure = uploadFailure;
        uploadFailure = null;
        return apiError(failure.status, failure.code, failure.message);
      }
      seq += 1;
      item.imageKey = `catalog/${String(seq).padStart(64, "f")}.png`;
      return HttpResponse.json(item);
    }),
    http.delete("/api/v1/admin/catalog/items/:id/image", ({ params }) => {
      const item = find(String(params.id));
      if (!item) return apiError(404, ERROR_CODE.NOT_FOUND, "Not found");
      item.imageKey = null;
      return HttpResponse.json(item);
    }),
    http.post("/api/v1/admin/catalog/import", async ({ request }) => {
      const url = new URL(request.url);
      const file = (await request.formData()).get("file") as File;
      const dryRun = url.searchParams.get("dryRun");
      calls.imports.push({ dryRun, file });
      return HttpResponse.json(api.importResult(dryRun !== "false"));
    }),
  ];

  return api;
}
