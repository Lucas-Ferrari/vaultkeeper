import type { CatalogItem } from "@vaultkeeper/shared/schemas/catalog";
import type { ReactNode } from "react";
import { Badge, BADGE_TONE } from "../../../shared/ui/badge";
import { ItemImage } from "../../../shared/ui/item-image";

interface CatalogTableProps {
  items: readonly CatalogItem[];
  categoryOf: (slug: string) => { name: string; icon: string };
  /** Router-aware link to the edit page (provided by the container). */
  renderName: (item: CatalogItem) => ReactNode;
}

export function CatalogTable({ items, categoryOf, renderName }: CatalogTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-raised text-muted">
          <tr>
            <th scope="col" className="px-3 py-2">
              Item
            </th>
            <th scope="col" className="px-3 py-2">
              Category
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Price (MC)
            </th>
            <th scope="col" className="px-3 py-2">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const category = categoryOf(item.categorySlug);
            return (
              <tr key={item.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-3">
                    <ItemImage
                      imageKey={item.imageKey}
                      name={item.name}
                      categoryIcon={category.icon}
                      className="size-10"
                    />
                    {renderName(item)}
                  </span>
                </td>
                <td className="px-3 py-2">{category.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {item.referencePriceMc ?? <span className="text-muted">Unpriced</span>}
                </td>
                <td className="px-3 py-2">
                  {item.isActive ? (
                    <Badge>Active</Badge>
                  ) : (
                    <Badge tone={BADGE_TONE.MUTED}>Inactive</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
