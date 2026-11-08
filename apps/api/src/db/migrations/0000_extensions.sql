-- Custom migration (design 04, ADR6): search extensions + IMMUTABLE unaccent wrapper.
-- Idempotent on purpose (R-DEP-2): IF NOT EXISTS / OR REPLACE.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
--> statement-breakpoint
-- unaccent() is STABLE, so it cannot back an index or a generated column. The dictionary is
-- schema-qualified so a different search_path cannot change the result.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
