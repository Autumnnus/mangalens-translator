import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { describeError } from "@/server/errors";
import { catalogModel } from "@/lib/aiCatalog";
import { resolveAiSettings } from "@/server/llm/settings";
import { TranslationSettings } from "@/types";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const choiceSchema = z.object({
  providerId: z.string().min(1).max(64),
  model: z.string().trim().min(1).max(200),
  inputPer1M: z.number().min(0).max(1000).optional(),
  outputPer1M: z.number().min(0).max(1000).optional(),
});

const patchSchema = z.object({
  targetLanguage: z.string().trim().min(1).max(100).optional(),
  customInstructions: z.string().max(4000).optional(),
  developerMode: z.boolean().optional(),
  ai: z
    .object({
      providers: z
        .array(
          z.object({
            id: z.string().min(1).max(64),
            name: z.string().trim().min(1).max(80),
            preset: z.string().min(1).max(40),
            kind: z.enum(["gemini", "openai"]),
            baseUrl: z.string().trim().max(300).optional(),
            apiKeys: z.array(z.string().trim().min(1).max(500)).max(50),
            freeTier: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(20),
      reader: choiceSchema,
      translator: choiceSchema,
      readerFallback: choiceSchema.optional(),
      translatorFallback: choiceSchema.optional(),
    })
    .optional(),
});

/** What the client sees: stored values plus the resolved AI configuration. */
const view = (stored: Partial<TranslationSettings>): TranslationSettings => ({
  targetLanguage: stored.targetLanguage || "Turkish",
  customInstructions: stored.customInstructions || "",
  developerMode: stored.developerMode === true,
  ai: resolveAiSettings(stored),
});

const loadStored = async (userId: string) => {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return (user?.settings || {}) as Partial<TranslationSettings>;
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(view(await loadStored(session.user.id)));
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Unknown server error") }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid settings" },
        { status: 400 },
      );
    }
    const incoming = parsed.data;
    if (incoming.ai) {
      const ids = new Set(incoming.ai.providers.map((provider) => provider.id));
      const choices = [
        incoming.ai.reader,
        incoming.ai.translator,
        incoming.ai.readerFallback,
        incoming.ai.translatorFallback,
      ].filter(Boolean);
      if (choices.some((choice) => !ids.has(choice!.providerId))) {
        return NextResponse.json({ error: "A model points to a provider that does not exist" }, { status: 400 });
      }
      for (const choice of [incoming.ai.reader, incoming.ai.readerFallback]) {
        if (choice && catalogModel(choice.model)?.vision === false) {
          return NextResponse.json(
            { error: `${choice.model} cannot read images, so it cannot be used for reading` },
            { status: 400 },
          );
        }
      }
    }
    // Older fields (Gemini keys, pipeline, batching) stay in the stored JSON
    // untouched; they are only read when no `ai` configuration exists.
    const stored = await loadStored(session.user.id);
    const next: Partial<TranslationSettings> = { ...stored, ...incoming };
    await db
      .update(users)
      .set({ settings: next as TranslationSettings })
      .where(eq(users.id, session.user.id));
    return NextResponse.json(view(next));
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Unknown server error") }, { status: 500 });
  }
}
