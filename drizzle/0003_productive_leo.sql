ALTER TABLE "translation_jobs" ADD COLUMN "fallback_model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "translation_jobs" ADD COLUMN "prompt" text NOT NULL;--> statement-breakpoint
ALTER TABLE "translation_jobs" ADD COLUMN "quality_fallback" integer DEFAULT 1 NOT NULL;