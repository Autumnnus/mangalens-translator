ALTER TABLE "images" ADD COLUMN "layout" jsonb;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "layout_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "legacy_translated_key" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "rendered_at" timestamp;