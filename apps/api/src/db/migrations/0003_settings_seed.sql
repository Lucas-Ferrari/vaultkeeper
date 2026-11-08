-- Custom migration (design 04, R-SET-1 S1, R-DEP-2): the settings singleton row with its column
-- defaults (rate 7.5, 10 vaults). Idempotent: the PK admits one row, a replay is a no-op.
INSERT INTO "app_settings" DEFAULT VALUES ON CONFLICT ("id") DO NOTHING;
