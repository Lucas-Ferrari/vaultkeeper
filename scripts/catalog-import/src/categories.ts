/** A seed catalog category (matches item_categories: slug PK, name, icon key, sort order). */
export interface SeedCategory {
  slug: string;
  name: string;
  /** Placeholder icon key resolved by the web app (no game art is shipped). */
  icon: string;
  sortOrder: number;
}

/** Display order = array order. Slugs are stable: the seeder upserts by slug. */
export const CATEGORIES: readonly SeedCategory[] = [
  { slug: "swords", name: "Swords", icon: "sword" },
  { slug: "axes", name: "Axes", icon: "axe" },
  { slug: "maces", name: "Maces & Scepters", icon: "mace" },
  { slug: "spears", name: "Spears", icon: "spear" },
  { slug: "bows", name: "Bows & Crossbows", icon: "bow" },
  { slug: "staffs", name: "Staffs & Sticks", icon: "staff" },
  { slug: "shields", name: "Shields", icon: "shield" },
  { slug: "helms", name: "Helms", icon: "helm" },
  { slug: "armors", name: "Armors", icon: "armor" },
  { slug: "pants", name: "Pants", icon: "pants" },
  { slug: "gloves", name: "Gloves", icon: "gloves" },
  { slug: "boots", name: "Boots", icon: "boots" },
  { slug: "wings", name: "Wings & Capes", icon: "wings" },
  { slug: "jewelry", name: "Rings & Pendants", icon: "ring" },
  { slug: "jewels", name: "Jewels", icon: "jewel" },
  { slug: "pets", name: "Pets", icon: "pet" },
  { slug: "orbs", name: "Orbs", icon: "orb" },
  { slug: "scrolls", name: "Scrolls", icon: "scroll" },
  { slug: "socket-items", name: "Seeds & Spheres", icon: "socket" },
  { slug: "potions", name: "Potions & Consumables", icon: "potion" },
  { slug: "boxes", name: "Boxes", icon: "box" },
  { slug: "buffs", name: "Seals & Buff Items", icon: "buff" },
  { slug: "event-items", name: "Event Items", icon: "ticket" },
  { slug: "quest-items", name: "Quest Items", icon: "quest" },
  { slug: "misc", name: "Miscellaneous", icon: "misc" },
].map((category, index) => ({ ...category, sortOrder: (index + 1) * 10 }));

/** MU item groups 0..11 are pure equipment: the group alone decides (design 10). */
const EQUIPMENT_BY_GROUP: Readonly<Record<number, string>> = {
  0: "swords",
  1: "axes",
  2: "maces",
  3: "spears",
  4: "bows",
  5: "staffs",
  6: "shields",
  7: "helms",
  8: "armors",
  9: "pants",
  10: "gloves",
  11: "boots",
};

/** Groups 12..15 mix wings, jewels, pets, potions...: the defining OpenMU file decides. */
const BY_FILE: Readonly<Record<string, string>> = {
  "Weapons.cs": "misc",
  "Armors.cs": "misc",
  "Wings.cs": "wings",
  "Orbs.cs": "orbs",
  "Scrolls.cs": "scrolls",
  "Jewels.cs": "jewels",
  "PackedJewels.cs": "jewels",
  "Jewelery.cs": "jewelry",
  "Pets.cs": "pets",
  "Potions.cs": "potions",
  "SocketSystem.cs": "socket-items",
  "BoxOfLuck.cs": "boxes",
  "BuffItems.cs": "buffs",
  "EventTicketItems.cs": "event-items",
  "Quest.cs": "quest-items",
  "LuckyItems.cs": "misc",
  "CashShopItems.cs": "misc",
  "CraftingTalismans.cs": "misc",
  "GensRewardItems.cs": "misc",
  "Misc.cs": "misc",
};

/**
 * Suffix for an item whose name collides with an earlier one in the same category (the catalog
 * requires unique names per category). Lucky armors reuse the regular set names in OpenMU.
 * Files not listed fall back to "<group>:<number>".
 */
export const COLLISION_LABELS: Readonly<Record<string, string>> = {
  "LuckyItems.cs": "Lucky",
};

/** Category slug of an OpenMU item. Unknown files throw so new OpenMU files get a conscious mapping. */
export function categoryFor(file: string, group: number): string {
  const equipment = EQUIPMENT_BY_GROUP[group];
  if (equipment !== undefined) return equipment;
  const byFile = BY_FILE[file];
  if (byFile === undefined) {
    throw new Error(`no category for ${file} (group ${group}): add it to categories.ts`);
  }
  return byFile;
}
