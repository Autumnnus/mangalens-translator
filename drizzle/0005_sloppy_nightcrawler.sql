CREATE TABLE "local_ocr_workers" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
