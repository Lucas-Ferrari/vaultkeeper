import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { categoriesQueryOptions } from "../../catalog/api/queries";
import { adminCatalogListQueryOptions } from "../api/queries";
import { CatalogFilters, type CatalogFilterValues } from "../components/catalog-filters";
import { CatalogTable } from "../components/catalog-table";
import { CATALOG_STATUS, type AdminCatalogSearch } from "../lib/search";

const UNKNOWN_CATEGORY = { name: "Unknown", icon: "item" };

/** /catalog (admin): filters live in the URL so the view can be shared and reloaded. */
export function CatalogListContainer({ search }: { search: AdminCatalogSearch }) {
  const navigate = useNavigate({ from: "/catalog/" });
  const values: CatalogFilterValues = {
    q: search.q ?? "",
    category: search.category ?? "",
    status: search.status ?? CATALOG_STATUS.ALL,
  };
  const list = useQuery({
    ...adminCatalogListQueryOptions({
      q: values.q.trim(),
      category: values.category === "" ? undefined : values.category,
      status: values.status,
    }),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery(categoriesQueryOptions);
  const categoryOf = (slug: string) =>
    categories.data?.find((category) => category.slug === slug) ?? UNKNOWN_CATEGORY;

  const onChange = (patch: Partial<CatalogFilterValues>) => {
    const next = { ...values, ...patch };
    void navigate({
      search: {
        ...(next.q === "" ? {} : { q: next.q }),
        ...(next.category === "" ? {} : { category: next.category }),
        ...(next.status === CATALOG_STATUS.ALL ? {} : { status: next.status }),
      },
      replace: true,
    });
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Catalog</h1>
        <Link
          to="/catalog/import"
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold"
        >
          Import CSV
        </Link>
      </div>
      <CatalogFilters values={values} categories={categories.data ?? []} onChange={onChange} />
      {list.isError && <p className="text-danger">Could not load the catalog.</p>}
      {list.data && (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {list.data.total} item{list.data.total === 1 ? "" : "s"}
          </p>
          <CatalogTable
            items={list.data.items}
            categoryOf={categoryOf}
            renderName={(item) => (
              <Link
                to="/catalog/$itemId"
                params={{ itemId: item.id }}
                className="inline-flex min-h-11 min-w-11 items-center font-medium text-primary hover:underline"
              >
                {item.name}
              </Link>
            )}
          />
        </>
      )}
    </section>
  );
}
