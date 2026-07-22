import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { TranslationSettings } from "@/types";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_SETTINGS: TranslationSettings = {
  targetLanguage: "Turkish",
  fontSize: 24,
  fontColor: "#000000",
  backgroundColor: "#ffffff",
  strokeColor: "#ffffff",
  customInstructions: "",
  model: "gemini-2.5-flash-lite",
  fallbackModel: "gemini-2.5-flash",
  enableQualityFallback: true,
  useGeminiBatch: true,
  refineBubbles: true,
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
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    model: isLegacy ? "gemini-2.5-flash-lite" : stored?.model || DEFAULT_SETTINGS.model,
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
          error instanceof Error ? error.message : "Unknown server error",
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
          error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
