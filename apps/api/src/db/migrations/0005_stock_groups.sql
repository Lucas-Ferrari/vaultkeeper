CREATE TABLE "stock_group_entries" (
	"group_id" uuid NOT NULL,
	"stock_entry_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "stock_group_entries_pk" PRIMARY KEY("group_id","stock_entry_id")
);
--> statement-breakpoint
CREATE TABLE "stock_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_groups_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "stock_groups_name_length" CHECK (char_length("stock_groups"."name") BETWEEN 1 AND 60),
	CONSTRAINT "stock_groups_description_length" CHECK ("stock_groups"."description" IS NULL OR char_length("stock_groups"."description") <= 500)
);
--> statement-breakpoint
CREATE TABLE "stock_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"storage_location_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"level" smallint DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"options" text,
	"price_mc" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_entries_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "stock_entries_level_range" CHECK ("stock_entries"."level" BETWEEN 0 AND 15),
	CONSTRAINT "stock_entries_quantity_range" CHECK ("stock_entries"."quantity" BETWEEN 1 AND 9999),
	CONSTRAINT "stock_entries_options_length" CHECK ("stock_entries"."options" IS NULL OR char_length("stock_entries"."options") <= 500),
	CONSTRAINT "stock_entries_notes_length" CHECK ("stock_entries"."notes" IS NULL OR char_length("stock_entries"."notes") <= 500),
	CONSTRAINT "stock_entries_price_non_negative" CHECK ("stock_entries"."price_mc" IS NULL OR "stock_entries"."price_mc" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stock_group_entries" ADD CONSTRAINT "stock_group_entries_group_owner_fk" FOREIGN KEY ("group_id","user_id") REFERENCES "public"."stock_groups"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_group_entries" ADD CONSTRAINT "stock_group_entries_entry_owner_fk" FOREIGN KEY ("stock_entry_id","user_id") REFERENCES "public"."stock_entries"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_groups" ADD CONSTRAINT "stock_groups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_location_owner_fk" FOREIGN KEY ("storage_location_id","user_id") REFERENCES "public"."storage_locations"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_group_entries_entry_idx" ON "stock_group_entries" USING btree ("stock_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_groups_user_name_unique" ON "stock_groups" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "stock_entries_user_location_idx" ON "stock_entries" USING btree ("user_id","storage_location_id");--> statement-breakpoint
CREATE INDEX "stock_entries_user_item_idx" ON "stock_entries" USING btree ("user_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "stock_entries_user_created_idx" ON "stock_entries" USING btree ("user_id","created_at" DESC NULLS LAST,"id");