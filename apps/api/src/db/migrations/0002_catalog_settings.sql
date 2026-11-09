CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_key" text,
	"category_slug" text NOT NULL,
	"name" text NOT NULL,
	"search_name" text GENERATED ALWAYS AS (public.immutable_unaccent(lower(name))) STORED NOT NULL,
	"source" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"reference_price_mc" numeric(14, 2),
	"image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_external_key_unique" UNIQUE("external_key"),
	CONSTRAINT "catalog_items_category_search_name_unique" UNIQUE("category_slug","search_name"),
	CONSTRAINT "catalog_items_name_length" CHECK (char_length("catalog_items"."name") BETWEEN 1 AND 120),
	CONSTRAINT "catalog_items_source_valid" CHECK ("catalog_items"."source" IN ('openmu', 'admin', 'csv')),
	CONSTRAINT "catalog_items_reference_price_non_negative" CHECK ("catalog_items"."reference_price_mc" IS NULL OR "catalog_items"."reference_price_mc" >= 0)
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"icon" text NOT NULL,
	CONSTRAINT "item_categories_slug_format" CHECK ("item_categories"."slug" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"mc_to_mp_rate" numeric(8, 4) DEFAULT '7.5' NOT NULL,
	"vault_count" smallint DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id"),
	CONSTRAINT "app_settings_rate_positive" CHECK ("app_settings"."mc_to_mp_rate" > 0),
	CONSTRAINT "app_settings_vault_count_range" CHECK ("app_settings"."vault_count" BETWEEN 1 AND 50)
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_slug_item_categories_slug_fk" FOREIGN KEY ("category_slug") REFERENCES "public"."item_categories"("slug") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_items_search_name_trgm_idx" ON "catalog_items" USING gin ("search_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "catalog_items_category_active_idx" ON "catalog_items" USING btree ("category_slug","is_active");