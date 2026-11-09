import { sql, type SQL } from "drizzle-orm";
import { timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

/** `timestamptz` column (design 05: every timestamp is timezone-aware). */
export function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true });
}

/** uuid PK, `gen_random_uuid()` default (design 05). */
export function uuidPk() {
  return uuid("id").primaryKey().defaultRandom();
}

/** created_at / updated_at pair shared by all app tables. */
export function timestamps() {
  return {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  };
}

/** SQL literal for values from our own const objects (never user input): CHECKs take no params. */
export function literal(value: string | number): SQL {
  return typeof value === "number"
    ? sql.raw(String(value))
    : sql.raw(`'${value.replaceAll("'", "''")}'`);
}

/** `col IN ('a', 'b')` for text+CHECK enums mirrored by shared const objects (ADR7). */
export function inList(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} IN (${sql.join(values.map(literal), sql.raw(", "))})`;
}

/** `col BETWEEN min AND max` with inlined bounds (CHECK constraints cannot take parameters). */
export function between(column: AnyPgColumn | SQL, min: number, max: number): SQL {
  return sql`${column} BETWEEN ${literal(min)} AND ${literal(max)}`;
}

/** `char_length(col) BETWEEN min AND max` (spec lengths win, see tasks index). */
export function lengthBetween(column: AnyPgColumn, min: number, max: number): SQL {
  return between(sql`char_length(${column})`, min, max);
}

/** `col IS NULL OR char_length(col) <= max` for optional free text. */
export function maxLength(column: AnyPgColumn, max: number): SQL {
  return sql`${column} IS NULL OR char_length(${column}) <= ${literal(max)}`;
}

/** Values of a const object as a non-empty tuple (Drizzle text `enum` typing wants one). */
export function objectValues<T extends Record<string, string>>(
  object: T,
): [T[keyof T], ...T[keyof T][]] {
  // Object.values loses the tuple shape; every const object here has at least one key.
  return Object.values(object) as [T[keyof T], ...T[keyof T][]];
}
