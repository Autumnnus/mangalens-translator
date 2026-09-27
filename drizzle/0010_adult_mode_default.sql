ALTER TABLE "series" ALTER COLUMN "content_mode" SET DEFAULT 'adult_verified';--> statement-breakpoint
UPDATE "series" SET "content_mode" = 'adult_verified' WHERE "content_mode" <> 'adult_verified';
