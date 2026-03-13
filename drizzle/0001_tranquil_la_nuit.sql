ALTER TABLE "categories" ADD COLUMN "color" text DEFAULT '#6366f1';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "settings" jsonb;