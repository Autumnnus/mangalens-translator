import { describeError } from "@/server/errors";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  DEFAULT_GEMINI_FALLBACK_MODEL,
  DEFAULT_GEMINI_MODEL,
  isSupportedGeminiModel,
  TranslationSettings,
} from "@/types";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_SETTINGS: TranslationSettings = {
  targetLanguage: "Turkish",
  translationPipeline: "auto",
  developerMode: false,
  customInstructions: "",
  model: DEFAULT_GEMINI_MODEL,
  fallbackModel: DEFAULT_GEMINI_FALLBACK_MODEL,
  enableQualityFallback: true,
  useGeminiBatch: true,
  batchSize: 10,
  batchDelay: 0,
  useCustomApiKey: false,
  customApiKeyPool: "",
  namedApiKeys: [],
};

const withTranslationPipelineDefaults = (
  stored?: Partial<TranslationSettings> | null,
): TranslationSettings => {
  const isLegacy = !!stored && stored.enableQualityFallback === undefined;
  const translationPipeline = ["auto", "gemini_vision", "local_ocr"].includes(
    String(stored?.translationPipeline),
  )
    ? stored?.translationPipeline
    : "auto";
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    model: isLegacy
      ? DEFAULT_GEMINI_MODEL
      : isSupportedGeminiModel(stored?.model)
        ? stored.model
        : DEFAULT_SETTINGS.model,
    fallbackModel: isSupportedGeminiModel(stored?.fallbackModel)
      ? stored.fallbackModel
      : DEFAULT_SETTINGS.fallbackModel,
    translationPipeline,
  };
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    return NextResponse.json(
      withTranslationPipelineDefaults(
        user?.settings as Partial<TranslationSettings> | null,
      ),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          describeError(error, "Unknown server error"),
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const incoming = (await req.json()) as Partial<TranslationSettings>;

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    const currentSettings = withTranslationPipelineDefaults(
      user?.settings as Partial<TranslationSettings> | null,
    );

    const updatedSettings: TranslationSettings = {
      ...currentSettings,
      ...incoming,
      model: isSupportedGeminiModel(incoming.model)
        ? incoming.model
        : currentSettings.model,
      fallbackModel: isSupportedGeminiModel(incoming.fallbackModel)
        ? incoming.fallbackModel
        : currentSettings.fallbackModel,
      translationPipeline: ["auto", "gemini_vision", "local_ocr"].includes(
        String(incoming.translationPipeline),
      )
        ? incoming.translationPipeline
        : currentSettings.translationPipeline,
    };

    await db
      .update(users)
      .set({ settings: updatedSettings })
      .where(eq(users.id, session.user.id));

    return NextResponse.json(updatedSettings);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          describeError(error, "Unknown server error"),
      },
      { status: 500 },
    );
  }
}
