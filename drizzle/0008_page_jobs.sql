CREATE TABLE "page_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"requested_pipeline" text DEFAULT 'auto' NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"provider_ref" text,
	"options" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"usage" jsonb,
	"cost" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "page_jobs" ADD CONSTRAINT "page_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_jobs" ADD CONSTRAINT "page_jobs_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_jobs" ADD CONSTRAINT "page_jobs_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_jobs_image_idx" ON "page_jobs" USING btree ("image_id");--> statement-breakpoint
CREATE INDEX "page_jobs_series_stage_idx" ON "page_jobs" USING btree ("series_id","stage");--> statement-breakpoint
ALTER TABLE "local_ocr_jobs" DROP COLUMN "translated_bubbles";