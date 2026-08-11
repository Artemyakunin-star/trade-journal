CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "commission" numeric(10, 4) DEFAULT '0' NOT NULL;
--> statement-breakpoint
INSERT INTO "instruments" ("symbol", "name", "tick_size", "tick_value", "commission") VALUES
  ('NQ',  'E-mini Nasdaq-100',        0.25, 5.00, 0),
  ('ES',  'E-mini S&P 500',           0.25, 12.50, 0),
  ('YM',  'E-mini Dow',               1,    5.00, 0),
  ('RTY', 'E-mini Russell 2000',      0.10, 5.00, 0),
  ('MNQ', 'Micro E-mini Nasdaq-100',  0.25, 0.50, 0),
  ('MES', 'Micro E-mini S&P 500',     0.25, 1.25, 0),
  ('MYM', 'Micro E-mini Dow',         1,    0.50, 0),
  ('M2K', 'Micro E-mini Russell 2000',0.10, 0.50, 0),
  ('CL',  'Crude Oil',                0.01, 10.00, 0),
  ('MCL', 'Micro Crude Oil',          0.01, 1.00, 0),
  ('GC',  'Gold',                     0.10, 10.00, 0),
  ('MGC', 'Micro Gold',               0.10, 1.00, 0)
ON CONFLICT ("symbol") DO NOTHING;
