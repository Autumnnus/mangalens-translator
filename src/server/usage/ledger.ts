import { client, db } from "@/db";
import { aiCalls } from "@/db/schema";
import { ModelCallEvent, ModelCallObserver } from "@/server/llm/run";

/**
 * Writes model calls to the `ai_calls` ledger. Recording never gets in the
 * way of a translation: failures are logged and swallowed.
 *
 * The table comes from migration 0009. Servers that were not migrated get it
 * created on first use with the same DDL, so a deploy needs no manual step.
 */

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS "ai_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "image_id" uuid,
  "job_id" uuid,
  "stage" text NOT NULL,
  "provider_id" text NOT NULL,
  "provider_name" text NOT NULL,
  "preset" text NOT NULL,
  "model" text NOT NULL,
  "key_hint" text,
  "free_tier" boolean DEFAULT false NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "reasoning_tokens" integer DEFAULT 0 NOT NULL,
  "cost_usd" real DEFAULT 0 NOT NULL,
  "list_cost_usd" real DEFAULT 0 NOT NULL,
  "duration_ms" integer,
  "limits" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ai_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "ai_calls_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "ai_calls_user_created_idx" ON "ai_calls" USING btree ("user_id","created_at");
`;

const globalState = globalThis as unknown as { __aiCallsTable?: Promise<boolean> };

/** Resolves true once the ledger table exists; false if it cannot be created. */
export const ensureAiCallsTable = () => {
  if (!globalState.__aiCallsTable) {
    globalState.__aiCallsTable = client
      .unsafe(CREATE_TABLE)
      .then(() => true)
      .catch((error) => {
        console.error("Usage ledger table could not be created", error);
        globalState.__aiCallsTable = undefined; // try again next time
        return false;
      });
  }
  return globalState.__aiCallsTable;
};

export interface CallContext {
  userId: string;
  imageId?: string;
  jobId?: string;
}

const toRow = (context: CallContext, event: ModelCallEvent): typeof aiCalls.$inferInsert => ({
  userId: context.userId,
  imageId: context.imageId,
  jobId: context.jobId,
  stage: event.stage,
  providerId: event.providerId,
  providerName: event.providerName,
  preset: event.preset,
  model: event.model,
  keyHint: event.keyHint,
  freeTier: event.freeTier,
  status: event.status,
  error: event.error,
  inputTokens: event.usage.inputTokens,
  outputTokens: event.usage.outputTokens,
  reasoningTokens: event.usage.reasoningTokens,
  costUsd: event.costUsd,
  listCostUsd: event.listCostUsd,
  durationMs: event.durationMs,
  limits: event.limits,
});

/**
 * An observer for `trackModelCalls` that stores each call. `flush` waits for
 * the pending writes, so a job's calls are visible when the job completes.
 */
export const ledgerRecorder = (context: CallContext) => {
  const pending = new Set<Promise<void>>();
  const observe: ModelCallObserver = (event) => {
    const write = ensureAiCallsTable()
      .then((ready) =>
        ready
          ? db
              .insert(aiCalls)
              .values(toRow(context, event))
              .then(() => undefined)
          : undefined,
      )
      .catch((error) => console.error("Usage ledger write failed", error))
      .finally(() => pending.delete(write));
    pending.add(write);
  };
  const flush = async () => {
    await Promise.all([...pending]);
  };
  return { observe, flush };
};
