CREATE TABLE "local_ocr_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"target_language" text NOT NULL,
	"custom_instructions" text,
	"primary_model" text NOT NULL,
	"fallback_model" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ocr_bubbles" jsonb,
	"translated_bubbles" jsonb,
	"usage" jsonb,
	"initial_usage" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "local_ocr_jobs_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "content_mode" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "local_ocr_jobs" ADD CONSTRAINT "local_ocr_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_ocr_jobs" ADD CONSTRAINT "local_ocr_jobs_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_ocr_jobs" ADD CONSTRAINT "local_ocr_jobs_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;