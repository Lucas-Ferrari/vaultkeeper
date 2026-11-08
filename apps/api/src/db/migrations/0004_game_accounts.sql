CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_account_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_id_account_unique" UNIQUE("id","game_account_id"),
	CONSTRAINT "characters_name_length" CHECK (char_length("characters"."name") BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE TABLE "game_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_accounts_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "game_accounts_name_length" CHECK (char_length("game_accounts"."name") BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE "storage_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"game_account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"character_id" uuid,
	"vault_number" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_locations_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "storage_locations_kind_valid" CHECK ("storage_locations"."kind" IN ('inventory', 'vault')),
	CONSTRAINT "storage_locations_kind_shape" CHECK (("storage_locations"."kind" = 'inventory' AND "storage_locations"."character_id" IS NOT NULL AND "storage_locations"."vault_number" IS NULL)
        OR ("storage_locations"."kind" = 'vault' AND "storage_locations"."character_id" IS NULL AND "storage_locations"."vault_number" IS NOT NULL AND "storage_locations"."vault_number" BETWEEN 1 AND 50))
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_owner_fk" FOREIGN KEY ("game_account_id","user_id") REFERENCES "public"."game_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_accounts" ADD CONSTRAINT "game_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_locations" ADD CONSTRAINT "storage_locations_account_owner_fk" FOREIGN KEY ("game_account_id","user_id") REFERENCES "public"."game_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_locations" ADD CONSTRAINT "storage_locations_character_account_fk" FOREIGN KEY ("character_id","game_account_id") REFERENCES "public"."characters"("id","game_account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "characters_account_name_unique" ON "characters" USING btree ("game_account_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "game_accounts_user_name_unique" ON "game_accounts" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "storage_locations_vault_number_unique" ON "storage_locations" USING btree ("game_account_id","vault_number") WHERE "storage_locations"."kind" = 'vault';--> statement-breakpoint
CREATE UNIQUE INDEX "storage_locations_inventory_unique" ON "storage_locations" USING btree ("character_id") WHERE "storage_locations"."kind" = 'inventory';