ALTER TABLE "local_ocr_jobs" ADD COLUMN "pipeline" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "local_ocr_jobs" ADD COLUMN "ocr_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "translation_jobs" ADD COLUMN "pipeline" text DEFAULT 'auto' NOT NULL;