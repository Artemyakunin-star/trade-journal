ALTER TABLE "docs" ADD COLUMN "date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "docs_date_uq" ON "docs" USING btree ("date");